import { z } from 'zod'
import { parseDocument, stringify } from 'yaml'
import { wikiSchema, storySchema, embeddedEventSchema } from './content-schema.ts'
import { forumThreadSchema } from './forum-schema.ts'
import { parseForumPosts } from './forum-posts.ts'
import { parseForumBody } from './forum-body.ts'
import { analyzeMarkdown } from './markdown-analysis.ts'
import { forumPagePath, forumFanfictionAnchor, FORUM_PAGE_SIZE, type ForumPost } from './forum.ts'
import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'

export const editorKinds = { wiki: '百科文章', story: '故事文章', forum: '论坛帖子' } as const
export type EditorKind = keyof typeof editorKinds
export const EDITOR_MAX_BYTES = 2 * 1024 * 1024
export const EDITOR_BUCKET = 'editor-drafts'
export const EDITOR_STORAGE_PREFIX = 'hetwila-editor:v1:'
const parser = unified().use(remarkParse).use(remarkGfm)
export interface EditorPage { uid?: string; title: string; path: string; anchors: string[]; kind: string; entityType?: string; markdownUrl?: string }
export interface EditorCatalogue { pages: EditorPage[]; sources: { path: string; title: string; anchors: string[] }[]; events: { uid: string; title: string; path: string; articleUid?: string }[] }
const blockSchema = z.object({ id: z.string().uuid(), type: z.enum(['markdown', 'fanfiction']), key: z.string().max(100), title: z.string().max(200), body: z.string().max(EDITOR_MAX_BYTES) }).strict()
export type EditorBlock = z.infer<typeof blockSchema>
export const editorDraftSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), kind: z.enum(['wiki', 'story', 'forum']), updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()), body: z.string().max(EDITOR_MAX_BYTES),
  posts: z.array(z.object({ id: z.string().uuid(), author: z.string().max(200), blocks: z.array(blockSchema).max(100) }).strict()).max(1000),
}).strict()
export type EditorDraft = z.infer<typeof editorDraftSchema>
// Preserve incomplete edits, but never restore a shape that the form cannot read.
const fieldText = z.string().max(10000)
const draftYear = z.union([z.number().finite(), z.literal('')]).optional()
const draftTime = wikiSchema.shape.worldTime.extend({ year: draftYear }).strict()
const draftRefs = z.array(wikiSchema.shape.sourceRefs.element.strict()).max(500)
const draftCommon = { uid: fieldText, title: fieldText, description: fieldText, category: fieldText, routeKey: fieldText, revision: z.union([z.number().finite(), z.literal('')]) }
const draftArticle = { ...draftCommon, worldTime: draftTime, sourceRefs: draftRefs, relations: z.array(wikiSchema.shape.relations.removeDefault().element.strict()).max(500) }
const snapshotMetadata = {
  wiki: wikiSchema.extend({ ...draftArticle, events: z.array(embeddedEventSchema.extend({ uid: fieldText, title: fieldText, description: fieldText, anchor: fieldText, sourceIds: z.array(z.string()), sourceRefs: draftRefs, worldTime: draftTime }).strict()).max(500) }).strict(),
  story: storySchema.extend({ ...draftArticle, scopeUid: fieldText }).strict(),
  forum: forumThreadSchema.extend({ ...draftCommon, community: fieldText, board: fieldText, originalFile: fieldText, scopeUid: fieldText }).strict(),
}
export interface EditorIssue { field: string; message: string; level: 'error' | 'warning' }
export function createEditorBlock(type: EditorBlock['type'] = 'markdown'): EditorBlock {
  return { id: crypto.randomUUID(), type, key: type === 'fanfiction' ? crypto.randomUUID() : '', title: '', body: '' }
}
export function createEditorDraft(kind: EditorKind): EditorDraft {
  const id = crypto.randomUUID(), uid = `${kind === 'forum' ? 'thread' : kind}:${id}`
  const common = { uid, routeKey: '', title: '', description: '', category: '', publicationStatus: 'draft', visibility: 'public', settingVersion: '3.0.3', revision: 1 }
  const metadata = kind === 'forum'
    ? { ...common, community: '', board: '', narrativeLayer: 'in-world-discussion', scopeUid: uid, originalFile: '' }
    : { ...common, entityType: kind === 'wiki' ? 'concept' : 'story', aliases: [], nameStatus: 'descriptive', sourceIds: [], factStatus: kind === 'wiki' ? 'working' : 'story-local', narrativeLayer: kind === 'wiki' ? 'author-reference' : 'fiction', worldTime: { label: '', precision: 'period' }, sourceRefs: [], relations: [], ...(kind === 'wiki' ? { events: [] } : { scopeUid: uid }) }
  return { version: 1, id, kind, metadata, body: '', posts: kind === 'forum' ? [{ id: crypto.randomUUID(), author: '', blocks: [createEditorBlock()] }] : [], updatedAt: new Date().toISOString() }
}
export function safeEditorTitle(value: string) { return value.normalize('NFC').replace(/[^\p{L}\p{M}\p{N} _·（）()、，：《》「」-]/gu, '').trim().slice(0, 80) }
export function escapeMarkdownText(text: string) { return text.replace(/[\\`*_[\]<>]/gu, '\\$&').replace(/[\r\n]+/gu, ' ') }
export function editorLink(label: string, path: string) {
  const url = new URL(path, 'https://hetwila.github.io')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('链接只支持站内地址或 HTTP(S)。')
  const destination = url.origin === 'https://hetwila.github.io' ? url.pathname + url.search + url.hash : url.href
  return `[${escapeMarkdownText(label || path)}](<${destination}>)`
}
export function serializeEditorBlocks(blocks: EditorBlock[]) {
  return blocks.map(b => b.type === 'markdown' ? b.body.trim() : `<!-- fanfiction: ${b.key} -->\n\n## ${b.title}\n\n${b.body.trim()}\n\n<!-- /fanfiction -->`).join('\n\n')
}
export function editorBody(draft: EditorDraft) {
  return draft.kind === 'forum'
    ? draft.posts.map((post, i) => `**${i + 1}L｜${i === 0 ? '楼主 ' : ''}${escapeMarkdownText(post.author.trim())}**\n\n${serializeEditorBlocks(post.blocks)}`).join('\n\n')
    : draft.body.trim()
}
export function serializeEditorDraft(draft: EditorDraft) {
  return `---\n${stringify(draft.metadata, { lineWidth: 0, aliasDuplicateObjects: false })}---\n\n${editorBody(draft)}\n`
}
export function parseEditorSnapshot(text: string): EditorDraft {
  if (new TextEncoder().encode(text).length > EDITOR_MAX_BYTES) throw new Error('草稿超过2 MiB，请拆分后再导入。')
  const draft = editorDraftSchema.parse(JSON.parse(text))
  draft.metadata = snapshotMetadata[draft.kind].parse(draft.metadata)
  if (draft.kind === 'forum' && !draft.posts.length) throw new Error('论坛草稿至少需要一层。')
  return draft
}
export function importEditorMarkdown(text: string): EditorDraft {
  if (new TextEncoder().encode(text).length > EDITOR_MAX_BYTES) throw new Error('文件超过2 MiB，请拆分后再导入。')
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  if (!match) throw new Error('请选择带 YAML 页首资料的百科、故事或论坛编辑文件。')
  const yaml = parseDocument(match[1]!, { uniqueKeys: true, schema: 'core' })
  if (yaml.errors.length || yaml.warnings.length) throw new Error('页首 YAML 无法解析，或包含不支持的标签。')
  const metadata = yaml.toJS({ maxAliasCount: 20 })
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('页首资料必须是字段对象。')
  const kind: EditorKind = metadata.narrativeLayer === 'in-world-discussion' ? 'forum' : metadata.entityType === 'story' ? 'story' : 'wiki'
  const schema = kind === 'forum' ? forumThreadSchema : kind === 'story' ? storySchema.strict() : wikiSchema.strict()
  const parsed = schema.safeParse(metadata)
  if (!parsed.success) throw new Error('页首资料不符合当前格式：' + parsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('；'))
  const draft = createEditorDraft(kind); draft.metadata = parsed.data
  const body = text.slice(match[0].length).trim()
  if (kind !== 'forum') draft.body = body
  else draft.posts = parseForumPosts(body).map(post => ({ id: crypto.randomUUID(), author: post.author, blocks: parseForumBody(post.bodyMarkdown).blocks.map(block => {
    const fields = createEditorBlock(block.type)
    if (block.type === 'markdown') return { ...fields, body: block.bodyMarkdown }
    const title = parser.parse(block.bodyMarkdown).children[0]!
    return { ...fields, key: block.key, title: block.title, body: block.bodyMarkdown.slice(title.position!.end.offset!).trim() }
  }) }))
  return draft
}

// Avoid routing unsupported Markdown through a rich-text parser that would drop it.
export function needsMarkdownMode(body: string) {
  let unsupported = false
  visit(parser.parse(body), node => {
    if (['html', 'table', 'definition', 'linkReference', 'imageReference', 'image', 'footnoteDefinition', 'footnoteReference'].includes(node.type) || (node.type === 'listItem' && node.checked != null)) unsupported = true
  })
  return unsupported || /(^|\n)::/u.test(body)
}
export function editorForumPages(routeKey: string, posts: Pick<ForumPost, 'floor' | 'isOriginalPoster' | 'blocks'>[]) {
  return [false, true].flatMap(onlyAuthor => {
    const filtered = posts.filter(post => !onlyAuthor || post.isOriginalPoster)
    return Array.from({ length: Math.ceil(filtered.length / FORUM_PAGE_SIZE) }, (_, index) => ({
      path: forumPagePath(routeKey, index + 1, onlyAuthor),
      anchors: filtered.slice(index * FORUM_PAGE_SIZE, (index + 1) * FORUM_PAGE_SIZE).flatMap(post => [
        `post-${post.floor}`,
        ...post.blocks.flatMap(block => {
          if (block.type !== 'fanfiction') return []
          const anchor = forumFanfictionAnchor(post.floor, block.key), slugger = new GithubSlugger()
          return [anchor, ...parser.parse(block.bodyMarkdown).children.filter(node => node.type === 'heading').map((node, i) => {
            const slug = slugger.slug(toString(node)) || slugger.slug('section')
            return i === 0 ? `${anchor}-title` : `${anchor}-section-${slug}`.replace(/-+/gu, '-').replace(/-$/u, '')
          })]
        }),
      ]),
    }))
  })
}
export function validateEditorDraft(draft: EditorDraft, catalogue: EditorCatalogue): EditorIssue[] {
  const issues: EditorIssue[] = []
  const add = (field: string, message: string, level: EditorIssue['level'] = 'error') => issues.push({ field, message, level })
  const schema = draft.kind === 'forum' ? forumThreadSchema : draft.kind === 'story' ? storySchema.strict() : wikiSchema.strict()
  const checked = schema.safeParse(draft.metadata)
  if (!checked.success) for (const issue of checked.error.issues) add(issue.path.join('.'), issue.message)
  if (!checked.success) return issues
  const m = checked.data, body = editorBody(draft)
  if (!m.title.trim()) add('title', '请填写标题。')
  for (const field of draft.kind === 'forum' ? ['title', 'community', 'board', 'category'] : ['title']) if (/[\r\n]/u.test(String(draft.metadata[field]))) add(field, '此字段须为单行文字。')
  const publicCopy = m.publicationStatus === 'published' && m.visibility === 'public'
  const referenceLevel = publicCopy ? 'error' : 'warning'
  if (new TextEncoder().encode(JSON.stringify(draft)).length > EDITOR_MAX_BYTES) add('body', '草稿超过2 MiB，请拆分内容。')
  if (!body.trim()) add('body', '请填写正文。')
  if ('scopeUid' in m && m.scopeUid !== m.uid) add('scopeUid', '作品范围必须与 UID 一致。')
  const path = `/${draft.kind === 'forum' ? 'forum/threads' : draft.kind === 'story' ? 'stories' : 'wiki'}/${m.routeKey}${draft.kind === 'forum' ? '/page/1' : ''}`
  if (catalogue.pages.some(p => p.path.normalize('NFC').toLowerCase() === path.toLowerCase() && p.uid && p.uid !== m.uid)) add('routeKey', '此文件名已属于另一篇作品，请使用不同名称或导入原文件编辑。')
  if (catalogue.pages.some(p => p.uid === m.uid && p.kind !== draft.kind)) add('uid', '此 UID 已用于另一种内容类型。')
  let ownForumPages: ReturnType<typeof editorForumPages> = []
  if (draft.kind === 'forum') {
    try {
      const posts = parseForumPosts(body)
      if (posts.length !== draft.posts.length) add('posts', '楼层正文不能包含顶层楼层标记；示例请放入代码或引用。')
      ownForumPages = editorForumPages(m.routeKey, posts.map(post => ({ ...post, blocks: parseForumBody(post.bodyMarkdown).blocks })))
    } catch (error) { add('posts', error instanceof Error ? error.message : '楼层格式不正确。') }
    for (const [i, post] of draft.posts.entries()) if (/\r|\n|^楼主 /u.test(post.author)) add(`posts.${i}.author`, '昵称不能换行或以“楼主 ”开头。')
  }
  try {
    const analysis = analyzeMarkdown(body)
    const anchorRanges = [...body.matchAll(/<(a|span) id="[\p{L}\p{N}][\p{L}\p{N}_-]*"><\/\1>/gu)].map(match => [match.index, match.index + match[0].length])
    visit(parser.parse(body), node => {
      if (node.type === 'html' && !anchorRanges.some(([start, end]) => node.position!.start.offset! >= start! && node.position!.end.offset! <= end!) && !(draft.kind === 'forum' && /^<!-- (?:fanfiction: [\p{L}\p{M}\p{N}·()-]+|\/fanfiction) -->$/u.test(node.value))) add('body', '正文仅允许普通 Markdown、显式锚点及论坛同人文边界；HTML／组件请作为代码示例。')
      if (node.type === 'paragraph' && node.position && /(^|\n)::/u.test(body.slice(node.position.start.offset, node.position.end.offset))) add('body', '请使用普通 Markdown，不使用 MDC 组件语法。')
      if (node.type === 'image') { try { if (!['https:', 'http:'].includes(new URL(node.url).protocol)) throw new Error() } catch { add('body', '图片须使用完整 HTTP(S) 地址。') } }
    })
    for (const link of analysis.links) {
      try {
        const url = new URL(link.url, `https://hetwila.github.io${path}`)
        if (!['http:', 'https:'].includes(url.protocol)) { add('body', `不支持的链接：${link.label}`); continue }
        if (url.origin !== 'https://hetwila.github.io') continue
        const pathname = decodeURIComponent(url.pathname).replace(/\/$/u, '') || '/', anchor = decodeURIComponent(url.hash.slice(1))
        const target = catalogue.pages.find(p => p.path === pathname && (draft.kind === 'forum' || p.kind !== 'forum'))
        const ownForum = ownForumPages.find(p => p.path === pathname)
        const ownThread = draft.kind === 'forum' && pathname.startsWith(`/forum/threads/${m.routeKey}/`)
        // Fiction-local fragments are rewritten to scoped IDs by the renderer.
        const anchors = ownForum ? new Set([...ownForum.anchors, ...(link.url.startsWith('#') ? analysis.anchors : [])]) : ownThread ? null : pathname === path ? analysis.anchors : target ? new Set(target.anchors) : null
        if (!anchors || (anchor && !anchors.has(anchor))) add('body', `链接目标尚未找到：${link.url}`, referenceLevel)
      } catch { add('body', `链接格式不正确：${link.url}`) }
    }
    if (draft.kind !== 'forum') {
      const article = (draft.kind === 'wiki' ? wikiSchema : storySchema).parse(m)
      if (article.worldTime.precision === 'year' && !Number.isInteger(article.worldTime.year)) add('worldTime.year', '按年记录时请填写整数纪年，0年有效。')
      const events = 'events' in article ? article.events : []
      const uids = new Set([m.uid]), anchors = new Set<string>()
      for (const event of events) {
        if (uids.has(event.uid) || catalogue.events.some(e => e.uid === event.uid && (e.articleUid ? e.articleUid !== m.uid : e.path.split('#')[0] !== path))) add('events', `事件 UID 重复：${event.uid}`)
        uids.add(event.uid)
        if (!analysis.explicitAnchors.has(event.anchor) || anchors.has(event.anchor)) add('events', `正文需包含唯一的显式锚点：${event.anchor}`)
        anchors.add(event.anchor)
      }
      for (const record of [article, ...events]) for (const ref of record.sourceRefs) if (!catalogue.sources.find(s => s.path === ref.path)?.anchors.includes(ref.anchor)) add('sourceRefs', `来源尚未收录：${ref.path}#${ref.anchor}`, referenceLevel)
      for (const relation of article.relations) {
        const target = catalogue.pages.find(p => p.uid === relation.target) || catalogue.events.find(e => e.uid === relation.target) || events.find(e => e.uid === relation.target)
        if (!target && relation.target !== m.uid) add('relations', `关系目标尚未找到：${relation.target}`, referenceLevel)
        const event = catalogue.events.some(e => e.uid === relation.target) || events.some(e => e.uid === relation.target)
        if (relation.type === 'depicts' && (draft.kind !== 'story' || !event)) add('relations', 'depicts 仅用于故事与事件之间的关系。')
      }
    }
  } catch (error) { add('body', error instanceof Error ? error.message : '正文格式不正确。') }
  return issues
}
export async function editorDownloads(draft: EditorDraft, catalogue: EditorCatalogue) {
  const errors = validateEditorDraft(draft, catalogue).filter(i => i.level === 'error')
  if (errors.length) throw new Error(errors.map(i => `${i.field}：${i.message}`).join('\n'))
  const schema = draft.kind === 'forum' ? forumThreadSchema : draft.kind === 'story' ? storySchema.strict() : wikiSchema.strict()
  const metadata = schema.parse(draft.metadata)
  // Apply schema normalization to both editions, so a padded input cannot
  // produce an original header that disagrees with its reading metadata.
  draft = { ...draft, metadata: { ...metadata, title: metadata.title.trim() } }
  const route = String(draft.metadata.routeKey), body = editorBody(draft)
  const files = [{ name: `${route}.md`, path: `content/${draft.kind === 'story' ? 'stories' : draft.kind}/${route}.md`, text: serializeEditorDraft(draft) }]
  if (draft.kind !== 'wiki') {
    const filename = draft.kind === 'forum' ? String(draft.metadata.originalFile) : `${route}.md`
    const folder = draft.kind === 'forum' ? 'forum' : 'stories'
    const text = `# ${draft.metadata.title}\n\n${draft.kind === 'forum' ? `${draft.metadata.community} › ${draft.metadata.board} › ${draft.metadata.category}\n\n---\n\n` : ''}${body}\n`
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('')
    files.push({ name: filename, path: `sources/${folder}/${filename}`, text }, { name: `原稿登记-${route}.json`, path: `合并到 sources/${folder}/manifest.json`, text: JSON.stringify({ files: { [filename]: sha } }, null, 2) + '\n' })
  }
  return files
}
export function editorSnapshotName(draft: EditorDraft) {
  // Storage keys use ASCII; the short UTF-8 title remains readable in the UI.
  const title = Array.from(safeEditorTitle(String(draft.metadata.title)) || '未命名').slice(0, 20).join('')
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(title))).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
  return `${Date.now()}-${encoded}-${crypto.randomUUID()}.json`
}
export function editorSnapshotTitle(name: string) {
  const match = /^\d{13}-([A-Za-z0-9_-]+)-[0-9a-f-]{36}\.json$/u.exec(name)
  if (!match) return '草稿快照'
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(match[1]!.replace(/-/gu, '+').replace(/_/gu, '/')), c => c.charCodeAt(0))) }
  catch { return '草稿快照' }
}
