import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { readPublicContent } from './lib/content.ts'
import type { PublicDocument } from '../shared/content-schema.ts'

const root = resolve(import.meta.dirname, '..')
const sources = await readPublicContent(join(root, 'content/wiki'))
const contentHash = createHash('sha256').update(sources.map(doc => doc.raw).join('\n')).digest('hex')
const siteRelease = `3.0.3-prototype-${contentHash.slice(0, 12)}`
const base = `/data/v1/releases/${siteRelease}`
const generated = join(root, '.generated/content/wiki')

// Only approved public files reach Nuxt Content, including its browser database.
await mkdir(generated, { recursive: true })
for (const filename of await readdir(generated)) {
  if (!sources.some(source => source.filename === filename)) {
    await rm(join(generated, filename), { force: true })
  }
}
const documents: PublicDocument[] = sources.map(({ metadata, markdown }) => {
  const key = metadata.uid.replace(':', '/')
  return {
    ...metadata,
    path: `/wiki/${metadata.routeKey}`,
    bodyMarkdown: markdown,
    markdownUrl: `${base}/documents/${key}.md`,
    jsonUrl: `${base}/documents/${key}.json`,
  }
})

// Recreate the public export allowlist so withdrawn material cannot linger.
// This prototype keeps only the current release; historical retention is a later feature.
await rm(join(root, 'public/data'), { recursive: true, force: true })
const checksums: Record<string, string> = {}
async function publish(url: string, text: string) {
  const path = join(root, 'public', url)
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, text)
  checksums[url] = createHash('sha256').update(text).digest('hex')
}
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

for (const [index, doc] of documents.entries()) {
  const source = sources[index]!
  await writeFile(join(generated, source.filename), source.raw)
  await publish(doc.markdownUrl, `${source.raw.trim()}\n`)
  await publish(doc.jsonUrl, json(doc))
}
await publish(`${base}/catalog.json`, json(documents.map(({ bodyMarkdown: _, ...metadata }) => metadata)))
await writeFile(join(root, '.generated/catalog.json'), json(documents.map(({ bodyMarkdown: _, ...metadata }) => metadata)))
await publish(`${base}/relations.json`, json(documents.flatMap(doc => doc.relations.map(relation => ({ source: doc.uid, ...relation })))))
await publish('/data/v1/manifest.json', json({
  schemaVersion: 1,
  settingVersion: '3.0.3',
  siteRelease,
  scope: 'Two public excerpts for the first development prototype; not the complete setting.',
  documentCount: documents.length,
  catalog: `${base}/catalog.json`,
  relations: `${base}/relations.json`,
  files: checksums,
}))
await writeFile(join(root, 'public/llms.txt'), `# 赫特维拉世界观\n\n设定基线：3.0.3。本原型只收录两个试读条目，并非完整设定集。\n\n- [发布清单](/data/v1/manifest.json)\n- [内容目录](${base}/catalog.json)\n- [概念关系](${base}/relations.json)\n\n目录提供每条内容的 Markdown、JSON、来源坐标和事实状态。先读清单，再使用其中的版本地址。\n\n本文本为作者层的设定资料，不是世界内人物的公开知识声明。创作前仍需完整读取原附件的总入口、责任与边界、全局写作规则及题材资料；本原型尚未收录这些规则，不能替代它们。\n`)
console.log(`Prepared ${documents.length} public documents (${siteRelease}).`)
