export const READING_PREFIX = 'hetwila-reading:v1:'
export const READING_SETTINGS_KEY = READING_PREFIX + 'settings'
export const READING_RECORD_PREFIX = READING_PREFIX + 'record:'
export const READING_LIMIT = 50
export interface ReadingSettings { font: 'serif' | 'sans'; size: number; lineHeight: number }
export const defaultReadingSettings: ReadingSettings = { font: 'serif', size: 20, lineHeight: 2 }
export interface ReadingPosition { key: string; index: number; offset: number; progress: number }
export interface ReadingIdentity { id: string; kind: 'story' | 'fanfiction'; ownerId?: string; documentId?: string; anchor?: string; floor?: number }
export interface ReadingItem extends ReadingIdentity { title: string; path: string }
export interface ReadingRecord extends ReadingIdentity { version: 1; updatedAt: number; position: ReadingPosition }
export const readingIdentityKey = (item: ReadingIdentity) => `${item.ownerId || 'public'}|${item.id}`
export const readingRecordKey = (item: ReadingIdentity) => READING_RECORD_PREFIX + encodeURIComponent(readingIdentityKey(item))
export function parseReadingSettings(value: unknown): ReadingSettings | null {
  if (!value || typeof value !== 'object') return null
  const v = value as ReadingSettings
  return ['serif', 'sans'].includes(v.font) && Number.isInteger(v.size) && v.size >= 16 && v.size <= 28 && [1.8, 2, 2.2].includes(v.lineHeight)
    ? { font: v.font, size: v.size, lineHeight: v.lineHeight } : null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const anchor = /^post-[1-9]\d*-fanfiction-[\p{L}\p{M}\p{N}·()-]+$/u
export function parseReadingRecord(value: unknown): ReadingRecord | null {
  if (!value || typeof value !== 'object') return null
  const v = value as ReadingRecord, p = v.position
  if (v.version !== 1 || typeof v.id !== 'string' || !v.id || v.id.length > 500 || !['story', 'fanfiction'].includes(v.kind)
    || !Number.isSafeInteger(v.updatedAt) || v.updatedAt < 0 || !Number.isFinite(new Date(v.updatedAt).valueOf()) || !p || typeof p.key !== 'string' || p.key.length > 80
    || !Number.isSafeInteger(p.index) || p.index < 0 || p.index > 100000
    || !Number.isFinite(p.offset) || p.offset < 0 || p.offset > 1 || !Number.isFinite(p.progress) || p.progress < 0 || p.progress > 1) return null
  if (v.ownerId !== undefined && (typeof v.ownerId !== 'string' || !uuid.test(v.ownerId) || typeof v.documentId !== 'string' || !uuid.test(v.documentId) || v.id !== `private:${v.documentId}/${v.kind === 'story' ? 'story' : v.anchor}`)) return null
  if (v.ownerId === undefined && (v.documentId !== undefined || v.id.startsWith('private:'))) return null
  if (v.kind === 'fanfiction' && (typeof v.anchor !== 'string' || !anchor.test(v.anchor) || !Number.isSafeInteger(v.floor) || v.floor! < 1 || !v.anchor.startsWith(`post-${v.floor}-`))) return null
  return { version: 1, id: v.id, kind: v.kind, updatedAt: v.updatedAt, position: { key: p.key, index: p.index, offset: p.offset, progress: p.progress },
    ...(v.ownerId ? { ownerId: v.ownerId, documentId: v.documentId } : {}), ...(v.kind === 'fanfiction' ? { anchor: v.anchor, floor: v.floor } : {}) }
}
export function readingHref(item: ReadingItem) {
  const url = new URL(item.path, 'https://hetwila.github.io')
  if (url.origin !== 'https://hetwila.github.io' || !item.path.startsWith('/') || item.path.startsWith('//')) return '/'
  url.searchParams.set('read', item.id)
  return url.pathname + url.search + url.hash
}
// Store a small text fingerprint, never a quotation or a copy of private prose.
export function readingFingerprint(text: string) {
  let hash = 2166136261
  for (const character of text.replace(/\s+/gu, ' ').trim()) { hash ^= character.codePointAt(0)!; hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}
