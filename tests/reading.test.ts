import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultReadingSettings, parseReadingSettings, parseReadingRecord, readingRecordKey, readingHref, readingFingerprint, type ReadingRecord } from '../shared/reading.ts'

const record: ReadingRecord = { version: 1, id: 'story:第一次选择', kind: 'story', updatedAt: Date.now(), position: { key: 'abc:0', index: 8, offset: 0.4, progress: 0.3 } }
test('local reading data is bounded and malformed settings or progress cannot enter the UI', () => {
  assert.deepEqual(parseReadingSettings(defaultReadingSettings), defaultReadingSettings)
  for (const value of [null, {}, { ...defaultReadingSettings, size: 300 }, { ...defaultReadingSettings, font: 'url(evil)' }, { ...defaultReadingSettings, lineHeight: 0 }]) assert.equal(parseReadingSettings(value), null)
  assert.deepEqual(parseReadingRecord(record), record)
  for (const value of [null, {}, { ...record, version: 2 }, { ...record, updatedAt: Number.MAX_SAFE_INTEGER }, { ...record, position: { ...record.position, progress: Infinity } }, { ...record, position: { ...record.position, index: -1 } }]) assert.equal(parseReadingRecord(value), null)
})
test('private records contain only identity/position and are isolated by account, without cached prose or titles', () => {
  const ownerId = crypto.randomUUID(), documentId = crypto.randomUUID()
  const privateRecord = { ...record, id: `private:${documentId}/story`, ownerId, documentId, title: 'Do not persist', body: 'Private manuscript' }
  const parsed = parseReadingRecord(privateRecord)!
  assert.ok(parsed)
  assert.ok(!JSON.stringify(parsed).includes('Do not persist'))
  assert.ok(!JSON.stringify(parsed).includes('Private manuscript'))
  assert.notEqual(readingRecordKey(parsed), readingRecordKey({ ...parsed, ownerId: crypto.randomUUID() }))
  assert.equal(parseReadingRecord({ ...parsed, ownerId: undefined }), null)
  assert.equal(parseReadingRecord({ ...parsed, documentId: crypto.randomUUID() }), null)
  assert.equal(readingHref({ ...parsed, title: '私有故事', path: `/private/read?id=${documentId}` }), `/private/read?id=${documentId}&read=${encodeURIComponent(parsed.id)}`)
})
test('resume links preserve forum floors and safe fragments; paragraph fingerprints contain no prose', () => {
  const item = { id: 'thread:测试/post-21-fanfiction-one', kind: 'fanfiction' as const, title: '测试', path: '/forum/threads/测试/page/2#post-21-fanfiction-one' }
  const href = readingHref(item)
  assert.ok(decodeURI(href).includes('/forum/threads/测试/page/2?read='))
  assert.ok(href.endsWith('#post-21-fanfiction-one'))
  for (const path of ['//evil.example/path', 'https://evil.example/path', 'javascript:alert(1)']) assert.equal(readingHref({ ...item, path }), '/')
  assert.equal(readingFingerprint('一段\n文字。'), readingFingerprint('一段 文字。'))
  assert.notEqual(readingFingerprint('第一段'), readingFingerprint('第二段'))
  assert.match(readingFingerprint('私有正文'), /^[a-z0-9]+$/u)
})
