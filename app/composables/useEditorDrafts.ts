import { createEditorDraft, parseEditorSnapshot, EDITOR_STORAGE_PREFIX, EDITOR_MAX_BYTES, type EditorDraft, type EditorKind } from '#shared/editor'

export function useEditorDrafts() {
  const draft = ref<EditorDraft>(createEditorDraft('wiki'))
  const locals = ref<{ id: string; title: string; kind: EditorKind; updatedAt: string }[]>([])
  const ready = ref(false), dirty = ref(false), error = ref(''), conflict = ref(false), savedAt = ref('')
  let expected: string | null = null, timer: ReturnType<typeof setTimeout> | undefined, changing = false
  const key = () => EDITOR_STORAGE_PREFIX + draft.value.id
  function list() {
    const rows: typeof locals.value = []
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i)!
      if (!name.startsWith(EDITOR_STORAGE_PREFIX) || name.endsWith(':active')) continue
      try { const d = parseEditorSnapshot(localStorage.getItem(name)!); rows.push({ id: d.id, title: String(d.metadata.title || '未命名草稿'), kind: d.kind, updatedAt: d.updatedAt }) }
      catch { error.value = '有一份本机草稿无法读取，原数据已保留。可以导入有效备份继续编辑。' }
    }
    locals.value = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  function save() {
    clearTimeout(timer)
    if (!ready.value || !dirty.value) return true
    try {
      if (conflict.value || localStorage.getItem(key()) !== expected) { conflict.value = true; return false }
      const text = JSON.stringify(draft.value)
      if (new TextEncoder().encode(text).length > EDITOR_MAX_BYTES) throw new Error()
      parseEditorSnapshot(text)
      localStorage.setItem(key(), text)
      expected = text; dirty.value = false; savedAt.value = draft.value.updatedAt; error.value = ''
      try { localStorage.setItem(EDITOR_STORAGE_PREFIX + 'active', draft.value.id) } catch { /* The draft itself is already safely stored. */ }
      list()
      return true
    } catch { error.value = '本机自动保存失败：存储可能已满或不可用。请下载草稿备份，当前编辑仍保留在页面中。'; return false }
  }
  function setDraft(next: EditorDraft, existing: string | null = null) {
    changing = true; draft.value = next; expected = existing; conflict.value = false; dirty.value = !existing; savedAt.value = existing ? next.updatedAt : ''; changing = false
  }
  function open(id: string) {
    if (!save()) return false
    try {
      const raw = localStorage.getItem(EDITOR_STORAGE_PREFIX + id)
      if (!raw) throw new Error()
      setDraft(parseEditorSnapshot(raw), raw); localStorage.setItem(EDITOR_STORAGE_PREFIX + 'active', id); return true
    } catch { error.value = '草稿无法打开，当前编辑已保留。'; return false }
  }
  function accept(next: EditorDraft) {
    if (!save()) return false
    setDraft({ ...next, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }); save(); return true
  }
  function create(kind: EditorKind) { return accept(createEditorDraft(kind)) }
  function copy() {
    // Explicitly preserve this tab's work as a new draft when another tab changed it.
    setDraft({ ...JSON.parse(JSON.stringify(draft.value)), id: crypto.randomUUID(), updatedAt: new Date().toISOString() }); save()
  }
  function reloadConflict() {
    try { const raw = localStorage.getItem(key()); if (!raw) throw new Error(); setDraft(parseEditorSnapshot(raw), raw); error.value = '' }
    catch { error.value = '另一窗口的草稿已删除或无法读取；请将当前内容另存为副本。' }
  }
  function removeCurrent() {
    try {
      if (conflict.value || localStorage.getItem(key()) !== expected) { conflict.value = true; return }
      localStorage.removeItem(key()); list()
      setDraft(createEditorDraft(draft.value.kind)); save()
    } catch { error.value = '本机草稿删除失败，请重试。' }
  }
  watch(() => JSON.stringify([draft.value.metadata, draft.value.body, draft.value.posts]), () => {
    if (!ready.value || changing) return
    draft.value.updatedAt = new Date().toISOString(); dirty.value = true
    clearTimeout(timer); timer = setTimeout(save, 350)
  }, { flush: 'sync' })
  function storage(event: StorageEvent) { if ((event.key === key() && event.newValue !== expected) || (event.key === null && expected !== null)) { clearTimeout(timer); conflict.value = true } }
  function unload(event: BeforeUnloadEvent) { if (!save()) event.preventDefault() }
  onMounted(() => {
    try {
      list()
      const active = localStorage.getItem(EDITOR_STORAGE_PREFIX + 'active')
      const raw = active && localStorage.getItem(EDITOR_STORAGE_PREFIX + active)
      if (raw) setDraft(parseEditorSnapshot(raw), raw)
      else dirty.value = true
    } catch { error.value = '无法恢复本机草稿，原数据未被覆盖。请导入备份或开始新的草稿。' }
    ready.value = true
    if (dirty.value) save()
    window.addEventListener('storage', storage); window.addEventListener('beforeunload', unload); window.addEventListener('pagehide', save)
  })
  onBeforeUnmount(() => { save(); clearTimeout(timer); window.removeEventListener('storage', storage); window.removeEventListener('beforeunload', unload); window.removeEventListener('pagehide', save) })
  return { draft, locals, ready, dirty, error, conflict, savedAt, save, open, accept, create, copy, reloadConflict, removeCurrent }
}
