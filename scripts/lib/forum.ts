import { parseForumPosts } from '../../shared/forum-posts.ts'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit, SKIP } from 'unist-util-visit'
import { forumThreadSchema, forumPostSchema } from '../../shared/forum-schema.ts'
import { forumPostPath, forumFanfictionEntries, forumFanfictionAnchor, type ForumThreadMetadata, type ForumPost } from '../../shared/forum.ts'
import { parseForumBody, renderFanfiction } from './forum-fanfiction.ts'

const parser = unified().use(remarkParse).use(remarkGfm)

export { parseForumPosts } from '../../shared/forum-posts.ts'

// Add links only to existing floors in this same thread. Work on plain-text
// AST nodes so formatting, code, existing links and their destinations stay intact.
export function linkForumFloors(markdown: string, routeKey: string, postCount: number) {
  const edits: { start: number, end: number, value: string }[] = []
  visit(parser.parse(markdown), node => {
    if (node.type === 'link' || node.type === 'linkReference') return SKIP
    if (node.type !== 'text') return
    const start = node.position!.start.offset!
    const raw = markdown.slice(start, node.position!.end.offset!)
    for (const match of raw.matchAll(/(?<![A-Za-z0-9])([1-9]\d*)L(?![A-Za-z0-9])/gu)) {
      const floor = Number(match[1])
      if (floor <= postCount) edits.push({ start: start + match.index, end: start + match.index + match[0].length, value: `[${match[0]}](<${encodeURI(forumPostPath(routeKey, floor))}>)` })
    }
  })
  for (const edit of edits.sort((a, b) => b.start - a.start)) markdown = markdown.slice(0, edit.start) + edit.value + markdown.slice(edit.end)
  return markdown
}

export interface ForumSource {
  metadata: ForumThreadMetadata
  raw: string
  markdown: string
  original: string
  originalSha256: string
  posts: ForumPost[]
}

export function renderForumPost(post: ForumPost, routeKey: string, posts: ForumPost[]) {
  const entries = forumFanfictionEntries(routeKey, posts)
  return post.blocks.map(block => {
    if (block.type === 'markdown') return linkForumFloors(block.bodyMarkdown, routeKey, posts.length)
    const index = entries.findIndex(entry => entry.anchor === forumFanfictionAnchor(post.floor, block.key))
    return renderFanfiction(block, entries[index]!, entries[index - 1], entries[index + 1])
  }).join('\n\n')
}

export async function readPublicForum(root: string): Promise<ForumSource[]> {
  const directory = join(root, 'content/forum')
  const originals = join(root, 'sources/forum')
  const manifest = JSON.parse(await readFile(join(originals, 'manifest.json'), 'utf8')) as { files: Record<string, string> }
  const uids = new Set<string>()
  const routes = new Set<string>()
  const result: ForumSource[] = []
  for (const filename of (await readdir(directory)).filter(name => name.endsWith('.md')).sort()) {
    const raw = await readFile(join(directory, filename), 'utf8')
    const { data, content } = matter(raw)
    const metadata = forumThreadSchema.parse(data)
    if (metadata.scopeUid !== metadata.uid) throw new Error(`Forum scope must match uid: ${metadata.uid}`)
    if (filename !== `${metadata.routeKey}.md`) throw new Error(`Forum filename must match routeKey: ${filename}`)
    const normalized = metadata.routeKey.normalize('NFC').toLowerCase()
    if (uids.has(metadata.uid) || routes.has(normalized)) throw new Error(`Duplicate forum identity: ${metadata.uid}`)
    uids.add(metadata.uid)
    routes.add(normalized)
    if (metadata.publicationStatus !== 'published' || metadata.visibility !== 'public') continue
    if (!Object.hasOwn(manifest.files, metadata.originalFile)) throw new Error(`Missing forum original: ${metadata.originalFile}`)
    const original = await readFile(join(originals, metadata.originalFile), 'utf8')
    const originalSha256 = createHash('sha256').update(original).digest('hex')
    if (originalSha256 !== manifest.files[metadata.originalFile]) throw new Error(`Forum checksum mismatch: ${metadata.originalFile}`)
    const originalTree = parser.parse(original)
    const [title, breadcrumb, separator, firstPost] = originalTree.children
    const textOf = (node: typeof title) => node?.position ? original.slice(node.position.start.offset, node.position.end.offset) : ''
    if (title?.type !== 'heading' || title.depth !== 1 || textOf(title) !== `# ${metadata.title}`
      || textOf(breadcrumb) !== `${metadata.community} › ${metadata.board} › ${metadata.category}` || separator?.type !== 'thematicBreak' || !firstPost) {
      throw new Error(`Forum original header differs: ${metadata.originalFile}`)
    }
    const parsed = parseForumPosts(content)
    const originalPosts = parseForumPosts(original.slice(firstPost.position!.start.offset!))
    const withoutLayout = (posts: typeof parsed) => posts.map(post => ({ ...post, bodyMarkdown: parseForumBody(post.bodyMarkdown).bodyMarkdown }))
    if (JSON.stringify(withoutLayout(parsed)) !== JSON.stringify(withoutLayout(originalPosts))) throw new Error(`Forum text differs from original: ${filename}`)
    const posts: ForumPost[] = parsed.map(post => ({
      ...forumPostSchema.parse({
        ...post, uid: `post:${metadata.uid.slice('thread:'.length)}:${post.floor}`,
        threadUid: metadata.uid, scopeUid: metadata.uid, narrativeLayer: metadata.narrativeLayer,
      }),
      path: forumPostPath(metadata.routeKey, post.floor), ...parseForumBody(post.bodyMarkdown),
    }))
    result.push({ metadata, raw, markdown: content.trim(), original, originalSha256, posts })
  }
  return result
}
