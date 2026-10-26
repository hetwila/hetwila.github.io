import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import matter from 'gray-matter'
import { readPublicContent, buildContentGraph, collectEvents, documentPath } from './lib/content.ts'
import { readSources } from './lib/sources.ts'
import { readStoryOriginals } from './lib/stories.ts'
import type { PublicDocument } from '../shared/content-schema.ts'

const root = resolve(import.meta.dirname, '..')
const sources = await readPublicContent({ wiki: join(root, 'content/wiki'), stories: join(root, 'content/stories') })
const references = await readSources(root)
const originals = await readStoryOriginals(root, sources)
const events = collectEvents(sources)
const categories = [...new Set(sources.filter(doc => doc.metadata.entityType !== 'story').map(doc => doc.metadata.category))].sort()
const staticRoutes = ['/', '/wiki', '/stories', '/timeline', '/reference', ...categories.map(category => `/wiki/category/${category}`)]
const extraPages = new Map(staticRoutes.map(path => [path, new Set<string>()]))
for (const reference of references) extraPages.set(reference.path, reference.analysis.anchors)
const relations = buildContentGraph(sources, extraPages)
for (const item of [...sources.map(doc => doc.metadata), ...events]) {
  for (const ref of item.sourceRefs) {
    const source = references.find(item => item.sourcePath === ref.path)
    if (!source || !source.analysis.explicitAnchors.has(ref.anchor)) throw new Error(`Missing source anchor: ${ref.path}#${ref.anchor}`)
  }
}
const contentHash = createHash('sha256').update(JSON.stringify({ exportFormat: 4, documents: sources.map(doc => doc.raw), originals, sources: references.map(({ raw, sourcePath, path, title, description }) => ({ raw, sourcePath, path, title, description })) })).digest('hex')
const siteRelease = `3.0.3-site-${contentHash.slice(0, 12)}`
const base = `/data/v1/releases/${siteRelease}`
const generated = join(root, '.generated/content')

async function syncCollection(name: string, files: { filename: string, raw: string }[]) {
  const directory = join(generated, name)
  await mkdir(directory, { recursive: true })
  for (const filename of await readdir(directory)) {
    if (!files.some(file => file.filename === filename)) await rm(join(directory, filename), { force: true })
  }
  for (const file of files) await writeFile(join(directory, file.filename), file.raw)
}
const documents: PublicDocument[] = sources.map(({ metadata, markdown }) => {
  const original = originals.find(item => item.uid === metadata.uid)
  const namespace = metadata.entityType === 'story' ? 'story' : metadata.entityType === 'event' ? 'event' : 'wiki'
  return {
    ...metadata,
    path: documentPath(metadata),
    bodyMarkdown: markdown,
    markdownUrl: encodeURI(`${base}/documents/${namespace}/${metadata.routeKey}.md`),
    jsonUrl: encodeURI(`${base}/documents/${namespace}/${metadata.routeKey}.json`),
    ...(original ? { originalMarkdownUrl: encodeURI(`${base}/originals/${original.filename}`), originalSha256: original.sha256 } : {}),
  }
})
// Explicit paths bypass Content's automatic filename slugification. The
// original Chinese title remains the canonical route and editable filename.
for (const collection of ['wiki', 'stories']) {
  await syncCollection(collection, sources.filter(doc => (doc.metadata.entityType === 'story') === (collection === 'stories')).map(doc => ({ filename: doc.filename, raw: matter.stringify(doc.markdown, { ...doc.metadata, path: documentPath(doc.metadata) }) })))
}
await syncCollection('reference', references.map(doc => ({ filename: `${doc.routeKey}.md`, raw: matter.stringify(doc.markdown, { title: doc.title, description: doc.description, path: doc.path, routeKey: doc.routeKey }) })))

// Only this release is retained for now; withdrawn exports cannot linger.
await rm(join(root, 'public/data'), { recursive: true, force: true })
const checksums: Record<string, string> = {}
async function publish(path: string, text: string) {
  const url = encodeURI(path)
  const filename = join(root, 'public', path)
  await mkdir(resolve(filename, '..'), { recursive: true })
  await writeFile(filename, text)
  checksums[url] = createHash('sha256').update(text).digest('hex')
  return url
}
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
for (const original of originals) await publish(`${base}/originals/${original.filename}`, original.raw)
for (const [index, doc] of documents.entries()) {
  await publish(decodeURI(doc.markdownUrl), `${sources[index]!.raw.trim()}\n`)
  await publish(decodeURI(doc.jsonUrl), json({ ...doc, relations: relations.filter(edge => edge.source === doc.uid), backlinks: relations.filter(edge => edge.targetArticleUid === doc.uid) }))
}
const catalog = documents.map(({ bodyMarkdown: _, ...metadata }) => metadata)
const referenceCatalog = []
for (const reference of references) {
  const markdownUrl = await publish(`${base}/sources/${reference.sourcePath}`, reference.raw)
  referenceCatalog.push({ sourcePath: reference.sourcePath, path: reference.path, title: reference.title, description: reference.description, sha256: reference.sha256, markdownUrl, anchors: [...reference.analysis.explicitAnchors], unavailableLinks: reference.unavailableLinks })
}
const sourceMap = references.flatMap(reference => [...reference.analysis.explicitAnchors].map(anchor => ({
  sourcePath: reference.sourcePath, anchor, referencePath: `${reference.path}#${anchor}`,
  entries: [...documents, ...events.filter(event => event.embedded)].flatMap(doc => doc.sourceRefs.filter(ref => ref.path === reference.sourcePath && ref.anchor === anchor).map(ref => ({ uid: doc.uid, path: doc.path, role: ref.role }))),
})))
const catalogUrl = await publish(`${base}/catalog.json`, json(catalog))
const relationsUrl = await publish(`${base}/relations.json`, json(relations))
const referencesUrl = await publish(`${base}/sources.json`, json(referenceCatalog))
const sourceMapUrl = await publish(`${base}/source-map.json`, json({ scope: 'Only explicitly published sources, not the complete 216-document setting.', importedSourceCount: references.length, expectedSourceCount: 216, anchors: sourceMap }))
const eventsUrl = await publish(`${base}/events.json`, json(events))
const routes = [...staticRoutes, ...documents.map(doc => doc.path), ...references.map(doc => doc.path)]
await writeFile(join(root, '.generated/catalog.json'), json(catalog))
await writeFile(join(root, '.generated/relations.json'), json(relations))
await writeFile(join(root, '.generated/references.json'), json(referenceCatalog))
await writeFile(join(root, '.generated/routes.json'), json(routes))
await writeFile(join(root, '.generated/events.json'), json(events))
await publish('/data/v1/manifest.json', json({
  schemaVersion: 1, settingVersion: '3.0.3', siteRelease,
  scope: '禁制机制、H31 全部事件与1747年选举相关百科，以及故事《第一次选择》；并非完整设定集。',
  documentCount: documents.length, wikiCount: documents.filter(doc => doc.entityType !== 'story').length, storyCount: originals.length, eventCount: events.length, referenceCount: references.length,
  catalog: catalogUrl, relations: relationsUrl, references: referencesUrl, sourceMap: sourceMapUrl, events: eventsUrl,
  files: { ...checksums },
}))
await writeFile(join(root, 'public/llms.txt'), `# 赫特维拉世界观\n\n设定基线：3.0.3。当前收录 ${documents.filter(doc => doc.entityType !== 'story').length} 个百科条目、${originals.length} 篇故事和 ${references.length} 份设定来源原文，并非完整设定集。\n\n- [发布清单](/data/v1/manifest.json)\n- [内容目录](${catalogUrl})\n- [概念关系与正文反链](${relationsUrl})\n- [来源原文目录](${referencesUrl})\n- [来源锚点映射](${sourceMapUrl})\n- [年代事件与段落落点](${eventsUrl})\n\n标题、文件名和页面路径保留中文；HTTP 客户端按标准 URL 编码请求。UID 是稳定身份，不因标题改名改变。事件可以是百科正文中的段落，不一定有独立条目；events.json 保留事件 UID 和带锚点的阅读路径，articleUid 指向所属百科。先读清单，再使用其中的版本地址；Markdown、JSON 和来源原文均可通过 HTTP 获取，无需截图或 OCR。来源目录提供原始字节的 SHA-256；网页只将尚未收录的原文链接显示为文字坐标。\n\n百科为作者层的设定资料，不是世界内人物的公开知识声明。故事以 entityType=story、narrativeLayer=fiction、factStatus=story-local 与 scopeUid 标注；depicts 表示描写事件，不能由此把对白或局部情节提升为全局设定。故事 JSON 提供 originalMarkdownUrl 与 originalSha256，可核对作者上传原稿。创作前仍需完整读取原附件的总入口、责任与边界、全局写作规则及题材资料；本网站尚未收录这些规则，不能替代它们。当前论坛作品尚未收录。\n`)
console.log(`Prepared ${documents.length} public documents, ${references.length} references, ${sourceMap.length} source anchors (${siteRelease}).`)
