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

export function parseForumPosts(markdown: string) {
  const tree = parser.parse(markdown)
  const markers = tree.children.flatMap(node => {
    if (node.type !== 'paragraph' || node.children.length !== 1 || node.children[0]?.type !== 'strong') return []
    const strong = node.children[0]
    if (strong.children.length !== 1 || strong.children[0]?.type !== 'text') return []
    const match = strong.children[0].value.match(/^([1-9]\d*)L｜(楼主 )?(.+)$/u)
    if (/^\d+L｜/u.test(strong.children[0].value) && !match) throw new Error('Invalid forum floor marker')
    return match ? [{ floor: Number(match[1]), author: match[3]!.trim(), markedAsAuthor: Boolean(match[2]), start: node.position!.start.offset!, end: node.position!.end.offset! }] : []
  })
  if (!markers.length || markdown.slice(0, markers[0]!.start).trim()) throw new Error('Forum body must start with **1L｜楼主 昵称**')
  const author = markers[0]!.author
  if (!markers[0]!.markedAsAuthor) throw new Error('Forum first floor must identify the original poster')
  return markers.map((marker, index) => {
    if (marker.floor !== index + 1) throw new Error(`Forum floors must be consecutive: expected ${index + 1}L`)
    if (!marker.author || (marker.markedAsAuthor && marker.author !== author)) throw new Error(`Invalid forum author: ${marker.floor}L`)
    const bodyMarkdown = markdown.slice(marker.end, markers[index + 1]?.start ?? markdown.length).trim()
    if (!bodyMarkdown) throw new Error(`Empty forum post: ${marker.floor}L`)
    return { floor: marker.floor, author: marker.author, isOriginalPoster: marker.author === author, bodyMarkdown }
  })
}

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
