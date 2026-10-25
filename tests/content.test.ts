import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { readPublicContent, buildContentGraph } from '../scripts/lib/content.ts'
import { wikiSchema } from '../shared/content-schema.ts'
import { readSources } from '../scripts/lib/sources.ts'

const baseline = matter(await readFile(new URL('../content/wiki/禁制.md', import.meta.url), 'utf8')).data

async function fixture(files: Record<string, Record<string, unknown>>, action: (dir: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'hetwila-content-'))
  try {
    for (const [name, metadata] of Object.entries(files)) {
      const { bodyMarkdown = 'Fixture body.', ...fields } = metadata
      await writeFile(join(directory, `${name}.md`), matter.stringify(String(bodyMarkdown), { ...baseline, routeKey: name, uid: `wiki:${name}`, relations: [], redirects: [], ...fields }))
    }
    await action(directory)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('private, draft and withdrawn documents never enter the public collection', async () => {
  await fixture({ public: {}, secret: { visibility: 'private' }, draft: { publicationStatus: 'draft' }, removed: { publicationStatus: 'withdrawn' } }, async dir => {
    const docs = await readPublicContent(dir)
    assert.deepEqual(docs.map(doc => doc.metadata.uid), ['wiki:public'])
  })
})

test('public references to a private document fail instead of exposing its metadata', async () => {
  await fixture({ public: { relations: [{ type: 'mentions', target: 'wiki:secret' }] }, secret: { visibility: 'private' } }, async dir => {
    await assert.rejects(readPublicContent(dir), /Unpublished or missing relation/)
  })
})

test('duplicate stable identities are rejected even with different routes', async () => {
  await fixture({ first: { uid: 'wiki:duplicate' }, second: { uid: 'wiki:duplicate' } }, async dir => {
    await assert.rejects(readPublicContent(dir), /Duplicate uid/)
  })
})

test('real sample event retains year zero and its source attribution', async () => {
  const docs = await readPublicContent(new URL('../content/wiki', import.meta.url).pathname)
  const event = docs.find(doc => doc.metadata.uid === 'event:h31-01')!
  assert.equal(event.metadata.worldTime.year, 0)
  assert.equal(event.metadata.sourceRefs[0]?.anchor, 'h31-01')
  assert.match(event.markdown, /当时参与者首先关心工程能否可靠运行/)
})

test('Chinese titles and punctuation survive validation; ambiguous or unsafe routes do not', async () => {
  assert.equal(wikiSchema.parse({ ...baseline, routeKey: '伊拉奈德（原生文明）' }).routeKey, '伊拉奈德（原生文明）')
  for (const key of ['../禁制', '禁制/子页', '禁制#定义', '禁制?版本', '禁制%2f内容', ' 禁制', 'category', 'e\u0301']) {
    assert.equal(wikiSchema.safeParse({ ...baseline, routeKey: key }).success, false, key)
  }
  await fixture({ 禁制: { redirects: ['ban'] }, ban: {} }, async dir => {
    await assert.rejects(readPublicContent(dir), /Duplicate route or redirect/)
  })
})

test('Markdown links produce directional backlinks, including references and encoded Chinese fragments', async () => {
  await fixture({
    禁制: { bodyMarkdown: '## 原理\n\n定义正文。' },
    历史: { bodyMarkdown: '[定义](/wiki/%E7%A6%81%E5%88%B6#%E5%8E%9F%E7%90%86)\n\n[再读][定义]\n\n[定义]: /wiki/禁制#原理\n\n`[不解析](/wiki/不存在)`' },
  }, async dir => {
    const graph = buildContentGraph(await readPublicContent(dir))
    assert.equal(graph.length, 1)
    assert.equal(graph[0]?.source, 'wiki:历史')
    assert.equal(graph[0]?.target, 'wiki:禁制')
    assert.equal(graph[0]?.origin, 'markdown')
  })
})

test('public Markdown cannot link to private content or missing sections', async () => {
  for (const href of ['/wiki/秘密', '/wiki/公开#不存在']) {
    await fixture({ 公开: { bodyMarkdown: `[链接](${href})` }, 秘密: { visibility: 'private' } }, async dir => {
      const docs = await readPublicContent(dir)
      assert.throws(() => buildContentGraph(docs), /Unpublished or missing link|Missing anchor/)
    })
  }
})

test('H31 contains all twelve original event IDs and sources keep their original hashes', async () => {
  const root = new URL('..', import.meta.url).pathname
  const docs = await readPublicContent(join(root, 'content/wiki'))
  const events = docs.filter(doc => doc.metadata.entityType === 'event')
  assert.deepEqual(events.map(doc => doc.metadata.sourceIds[0]).sort(), Array.from({ length: 12 }, (_, i) => `H31-${String(i + 1).padStart(2, '0')}`))
  assert.equal(docs.length, 13)
  const sources = await readSources(root)
  assert.equal(sources.reduce((count, source) => count + source.analysis.explicitAnchors.size, 0), 19)
  for (const doc of docs) for (const ref of doc.metadata.sourceRefs) {
    assert.ok(sources.find(source => source.sourcePath === ref.path)?.analysis.explicitAnchors.has(ref.anchor))
  }
  const temporary = await mkdtemp(join(tmpdir(), 'hetwila-sources-'))
  try {
    await cp(join(root, 'sources'), join(temporary, 'sources'), { recursive: true })
    await writeFile(join(temporary, 'sources/releases/3.0.3/07_历代历史/H31.md'), 'Altered source')
    await assert.rejects(readSources(temporary), /checksum mismatch/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
