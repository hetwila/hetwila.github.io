import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { readPublicContent } from '../scripts/lib/content.ts'

const baseline = matter(await readFile(new URL('../content/wiki/ban.md', import.meta.url), 'utf8')).data

async function fixture(files: Record<string, Record<string, unknown>>, action: (dir: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'hetwila-content-'))
  try {
    for (const [name, metadata] of Object.entries(files)) {
      await writeFile(join(directory, `${name}.md`), matter.stringify('Fixture body.', { ...baseline, routeKey: name, uid: `wiki:${name}`, relations: [], ...metadata }))
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
