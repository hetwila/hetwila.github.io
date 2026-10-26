import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { readPublicContent, buildContentGraph, collectEvents } from '../scripts/lib/content.ts'
import { wikiSchema } from '../shared/content-schema.ts'
import { storySchema } from '../shared/content-schema.ts'
import { readStoryOriginals } from '../scripts/lib/stories.ts'
import { createHash } from 'node:crypto'
import { readSources } from '../scripts/lib/sources.ts'

const baseline = { ...matter(await readFile(new URL('../content/wiki/禁制.md', import.meta.url), 'utf8')).data, events: [] }

async function fixture(files: Record<string, Record<string, unknown>>, action: (dir: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'hetwila-content-'))
  try {
    for (const [name, metadata] of Object.entries(files)) {
      const { bodyMarkdown = 'Fixture body.', ...fields } = metadata
      await writeFile(join(directory, `${name}.md`), matter.stringify(String(bodyMarkdown), { ...baseline, routeKey: name, uid: `wiki:${name}`, relations: [], ...fields }))
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
  const event = collectEvents(docs).find(event => event.uid === 'event:h31-01')!
  assert.equal(event.worldTime.year, 0)
  assert.equal(event.sourceRefs[0]?.anchor, 'h31-01')
  assert.equal(event.path, '/wiki/禁制#h31-01')
  assert.equal(event.articleUid, 'wiki:ban')
  assert.equal(event.embedded, true)
})

test('Chinese titles and punctuation survive validation; ambiguous or unsafe routes do not', async () => {
  assert.equal(wikiSchema.parse({ ...baseline, routeKey: '伊拉奈德（原生文明）' }).routeKey, '伊拉奈德（原生文明）')
  for (const key of ['../禁制', '禁制/子页', '禁制#定义', '禁制?版本', '禁制%2f内容', ' 禁制', 'category', 'e\u0301']) {
    assert.equal(wikiSchema.safeParse({ ...baseline, routeKey: key }).success, false, key)
  }
  await fixture({ Ban: {}, ban: {} }, async dir => {
    await assert.rejects(readPublicContent(dir), /Duplicate route/)
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
  const events = collectEvents(docs).filter(event => event.uid.startsWith('event:h31-'))
  assert.deepEqual(events.map(event => event.sourceIds[0]).sort(), Array.from({ length: 12 }, (_, i) => `H31-${String(i + 1).padStart(2, '0')}`))
  assert.equal(docs.length, 6)
  assert.equal(docs.filter(doc => doc.metadata.entityType === 'event').length, 1)
  const sources = await readSources(root)
  assert.equal(sources.reduce((count, source) => count + source.analysis.explicitAnchors.size, 0), 151)
  for (const doc of [...docs.map(doc => doc.metadata), ...events]) for (const ref of doc.sourceRefs) {
    assert.ok(sources.find(source => source.sourcePath === ref.path)?.analysis.explicitAnchors.has(ref.anchor))
  }
  const temporary = await mkdtemp(join(tmpdir(), 'hetwila-sources-'))
  try {
    await cp(join(root, 'sources'), join(temporary, 'sources'), { recursive: true })
    await writeFile(join(temporary, 'sources/releases/3.0.3/07_历代历史/H31.md'), 'Altered source')
    await assert.rejects(readSources(temporary), /checksum mismatch/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('wiki and stories share a validated graph but have separate routes and narrative scopes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hetwila-stories-'))
  const root = new URL('..', import.meta.url).pathname
  try {
    const { mkdir } = await import('node:fs/promises')
    const folders = { wiki: join(directory, 'wiki'), stories: join(directory, 'stories') }
    await mkdir(folders.wiki); await mkdir(folders.stories)
    const original = matter(await readFile(join(root, 'content/stories/第一次选择.md'), 'utf8')).data
    const story = { ...original, uid: 'story:同名', scopeUid: 'story:同名', routeKey: '同名', relations: [] }
    await writeFile(join(folders.wiki, '同名.md'), matter.stringify('[阅读作品](/stories/同名#一)', { ...baseline, uid: 'wiki:同名', routeKey: '同名', relations: [{ type: 'mentions', target: 'story:同名' }] }))
    await writeFile(join(folders.stories, '同名.md'), matter.stringify('## 一\n\n[查阅设定](/wiki/同名)', story))
    const docs = await readPublicContent(folders)
    const graph = buildContentGraph(docs)
    assert.ok(graph.some(edge => edge.source === 'wiki:同名' && edge.targetPath === '/stories/同名'))
    assert.ok(graph.some(edge => edge.source === 'story:同名' && edge.targetPath === '/wiki/同名' && edge.sectionId === '一'))
    assert.equal(storySchema.safeParse({ ...story, factStatus: 'canon' }).success, false)
    assert.equal(storySchema.safeParse({ ...story, narrativeLayer: 'author-reference' }).success, false)
    assert.equal(storySchema.safeParse({ ...story, scopeUid: undefined }).success, false)
    await writeFile(join(folders.stories, '同名.md'), matter.stringify('正文', { ...story, scopeUid: 'story:别篇' }))
    await assert.rejects(readPublicContent(folders), /Story scope must match/)
    for (const fields of [{ visibility: 'private' }, { publicationStatus: 'draft' }, { publicationStatus: 'withdrawn' }]) {
      await writeFile(join(folders.stories, '同名.md'), matter.stringify('正文', { ...story, ...fields }))
      await assert.rejects(readPublicContent(folders), /Unpublished or missing relation/)
      await writeFile(join(folders.wiki, '同名.md'), matter.stringify('公开设定', { ...baseline, uid: 'wiki:同名', routeKey: '同名', relations: [] }))
      assert.deepEqual((await readPublicContent(folders)).map(doc => doc.metadata.uid), ['wiki:同名'])
      await writeFile(join(folders.wiki, '同名.md'), matter.stringify('公开设定', { ...baseline, uid: 'wiki:同名', routeKey: '同名', relations: [{ type: 'mentions', target: 'story:同名' }] }))
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('the supplied story retains all prose and the complete setting archive matches its recorded release', async () => {
  const root = new URL('..', import.meta.url).pathname
  const docs = await readPublicContent({ wiki: join(root, 'content/wiki'), stories: join(root, 'content/stories') })
  const originals = await readStoryOriginals(root, docs)
  assert.equal(originals.length, 1)
  const story = docs.find(doc => doc.metadata.entityType === 'story')!
  assert.equal(story.metadata.worldTime.year, 1747)
  assert.match(story.markdown, /\[第一届议长选举\]\(\/wiki\/1747年议长选举\)/)
  assert.equal((story.markdown.match(/^## /gm) ?? []).length, 6)
  const sources = await readSources(root)
  const graph = buildContentGraph(docs, new Map([['/timeline', new Set<string>()], ...sources.map(source => [source.path, source.analysis.anchors] as const)]))
  assert.ok(graph.some(edge => edge.type === 'depicts' && edge.source === 'story:第一次选择' && edge.target === 'event:h48-08'))
  assert.ok(graph.some(edge => edge.type === 'mentions' && edge.target === 'wiki:诺菲莉亚' && edge.sectionId === '一'))
  await assert.rejects(readStoryOriginals(root, [{ ...story, markdown: story.markdown.replace('纪元1747年', '纪元1748年') }]), /Story text differs/)
  const manifest = JSON.parse(await readFile(join(root, 'sources/releases/3.0.3/manifest.json'), 'utf8'))
  assert.equal(createHash('sha256').update(await readFile(join(root, manifest.archivePath))).digest('hex'), manifest.archiveSha256)
})

test('depicts only describes a story-to-event relation, never promotes fiction to a source fact', async () => {
  const root = new URL('..', import.meta.url).pathname
  const docs = await readPublicContent({ wiki: join(root, 'content/wiki'), stories: join(root, 'content/stories') })
  const story = docs.find(doc => doc.metadata.entityType === 'story')!
  const concept = docs.find(doc => doc.metadata.uid === 'wiki:帝国公民')!
  for (const doc of [story, concept]) {
    const changed = { ...doc, markdown: '', metadata: { ...doc.metadata, relations: [{ type: 'depicts' as const, target: 'wiki:帝国公民' }] } }
    assert.throws(() => buildContentGraph([changed, ...docs.filter(item => item.metadata.uid !== changed.metadata.uid)]), new RegExp('depicts must link'))
  }
})

test('embedded events require real paragraph anchors and globally unique identities', async () => {
  const docs = await readPublicContent(new URL('../content/wiki', import.meta.url).pathname)
  const source = docs.find(doc => doc.metadata.uid === 'wiki:ban')!
  assert.notEqual(source.metadata.entityType, 'story')
  const event = source.metadata.entityType === 'story' ? undefined : source.metadata.events[0]!
  await fixture({ 禁制: { events: [event] } }, async dir => {
    await assert.rejects(readPublicContent(dir), /Missing embedded event anchor/)
  })
  await fixture({ 禁制: { events: [event], bodyMarkdown: '<span id="h31-01"></span>\n\n事件正文' }, 重复: { uid: event!.uid } }, async dir => {
    await assert.rejects(readPublicContent(dir), /Duplicate uid/)
  })
  await fixture({ 秘密: { events: [event], visibility: 'private' }, 公开: { relations: [{ type: 'mentions', target: event!.uid }] } }, async dir => {
    await assert.rejects(readPublicContent(dir), /Unpublished or missing relation/)
  })
})

test('paragraph links and story depicts preserve event identity and the owning article backlink', async () => {
  const root = new URL('..', import.meta.url).pathname
  const docs = await readPublicContent({ wiki: join(root, 'content/wiki'), stories: join(root, 'content/stories') })
  const story = docs.find(doc => doc.metadata.entityType === 'story')!
  const changed = { ...story, markdown: '[启用](/wiki/禁制#h31-01)', metadata: { ...story.metadata, relations: [{ type: 'depicts' as const, target: 'event:h31-01' }] } }
  const ban = docs.find(doc => doc.metadata.uid === 'wiki:ban')!
  const graph = buildContentGraph([changed, { ...ban, markdown: '<span id="h31-01"></span>\n\n系统启用。' }])
  assert.equal(graph.length, 2)
  assert.deepEqual(graph.map(edge => edge.type).sort(), ['depicts', 'mentions'])
  for (const edge of graph) {
    assert.equal(edge.target, 'event:h31-01')
    assert.equal(edge.targetArticleUid, 'wiki:ban')
    assert.equal(edge.targetPath, '/wiki/禁制#h31-01')
  }
})
