import { defaultReadingSettings, parseReadingRecord, parseReadingSettings, readingRecordKey, readingIdentityKey, READING_LIMIT, READING_RECORD_PREFIX, READING_SETTINGS_KEY, type ReadingIdentity, type ReadingRecord, type ReadingSettings } from '#shared/reading'

export function useReadingLibrary() {
  const settings = useState<ReadingSettings>('reading-settings', () => ({ ...defaultReadingSettings }))
  const records = useState<ReadingRecord[]>('reading-records', () => [])
  const error = useState('reading-storage-error', () => '')
  const ready = useState('reading-storage-ready', () => false)
  function load() {
    try {
      const raw = localStorage.getItem(READING_SETTINGS_KEY)
      const next = raw ? parseReadingSettings(JSON.parse(raw)) : defaultReadingSettings
      if (next && JSON.stringify(next) !== JSON.stringify(settings.value)) settings.value = { ...next }
    } catch { /* Invalid settings never prevent reading. */ }
    try {
      const found: ReadingRecord[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (!key.startsWith(READING_RECORD_PREFIX)) continue
        try { const record = parseReadingRecord(JSON.parse(localStorage.getItem(key)!)); if (record && readingRecordKey(record) === key) found.push(record) } catch { /* Ignore malformed entries. */ }
      }
      records.value = found.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, READING_LIMIT)
    } catch { error.value = '此浏览器暂时无法保存阅读记录；仍可继续阅读。' }
    ready.value = true
  }
  function saveSettings(next: ReadingSettings) {
    const valid = parseReadingSettings(next)
    if (!valid) return
    settings.value = valid
    try { localStorage.setItem(READING_SETTINGS_KEY, JSON.stringify(valid)); error.value = '' }
    catch { error.value = '阅读设置暂时无法保存，当前设置仍然生效。' }
  }
  const find = (item: ReadingIdentity) => records.value.find(record => readingIdentityKey(record) === readingIdentityKey(item))
  function save(record: ReadingRecord, session: { saved: boolean; removed: boolean }) {
    if (session.removed) return
    const valid = parseReadingRecord(record)
    if (!valid) return
    try {
      const key = readingRecordKey(valid)
      // A deletion in another tab wins over this tab's pending scroll timer.
      if (session.saved && localStorage.getItem(key) === null) { session.removed = true; load(); return }
      localStorage.setItem(key, JSON.stringify(valid)); session.saved = true; error.value = ''
      load()
      const keep = new Set(records.value.map(readingRecordKey))
      for (const key of Object.keys(localStorage)) if (key.startsWith(READING_RECORD_PREFIX) && !keep.has(key)) {
        try { if (parseReadingRecord(JSON.parse(localStorage.getItem(key)!))) localStorage.removeItem(key) } catch { /* Preserve unknown formats. */ }
      }
    } catch { error.value = '阅读进度暂时无法保存；请保持此页面打开，稍后重试。' }
  }
  function remove(item: ReadingIdentity) {
    try { localStorage.removeItem(readingRecordKey(item)); load(); error.value = '' }
    catch { error.value = '这条阅读记录未能删除，请重试。' }
  }
  function storage(event: StorageEvent) { if (event.key === null || event.key === READING_SETTINGS_KEY || event.key.startsWith(READING_RECORD_PREFIX)) load() }
  onMounted(() => { load(); window.addEventListener('storage', storage) })
  onBeforeUnmount(() => window.removeEventListener('storage', storage))
  return { settings, records, error, ready, load, saveSettings, find, save, remove }
}
