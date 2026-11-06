<script setup lang="ts">
import { readingIdentityKey, type ReadingItem, type ReadingPosition, type ReadingRecord, type ReadingSettings } from '#shared/reading'
import { readingBlocks, readPosition, positionDelta, type ReadingBlock } from '~/utils/reading-position'
const props = defineProps<{ item?: ReadingItem }>()
const route = useRoute(), library = useReadingLibrary()
const active = useState<string | null>('active-immersive-reader', () => null)
const identity = computed(() => props.item ? readingIdentityKey(props.item) : '')
const open = computed({ get: () => Boolean(identity.value && active.value === identity.value), set: value => { if (!value && open.value) active.value = null } })
const text = useTemplateRef<HTMLElement>('text'), destination = useTemplateRef<HTMLElement>('destination'), scroller = useTemplateRef<HTMLElement>('scroller'), shell = useTemplateRef<HTMLElement>('shell'), trigger = useTemplateRef('trigger')
const target = shallowRef<HTMLElement | null>(null)
const entry = useTemplateRef<HTMLElement>('entry')
const settingsOpen = ref(false), contentsOpen = ref(false), fullscreen = ref(false), canFullscreen = ref(false), notice = ref('')
const chapters = shallowRef<{ id: string; title: string; element: HTMLElement }[]>([])
const position = ref<ReadingPosition>({ key: '', index: 0, offset: 0, progress: 0 })
const percent = computed(() => Math.round(position.value.progress * 100))
const prefs = library.settings
const style = computed(() => ({ '--reader-scale': prefs.value.size / 16, '--reader-leading': prefs.value.lineHeight }))
let blocks: ReadingBlock[] = [], initialized = false, settling = false, seen = false, resumePending = false, returnY = 0, sequence = 0
let frameId = 0, saveTimer: ReturnType<typeof setTimeout> | undefined, observer: ResizeObserver | undefined
let session = { saved: false, removed: false }
// Keep the original identity until unmount, even when an auth change removes props.
let currentItem: ReadingItem | undefined
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
function frame() {
  if (target.value && scroller.value) {
    const rect = scroller.value.getBoundingClientRect()
    return { top: rect.top, height: scroller.value.clientHeight, bottom: rect.bottom }
  }
  const top = Math.max(0, document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0) + (entry.value?.getBoundingClientRect().height || 0)
  return { top, height: Math.max(1, innerHeight - top), bottom: innerHeight }
}
function refreshBlocks() {
  if (!text.value) return
  blocks = readingBlocks(text.value)
  chapters.value = Array.from(text.value.querySelectorAll<HTMLElement>('h2[id],h3[id],h4[id],h5[id],h6[id]')).map(element => ({ id: element.id, title: element.textContent?.trim() || '章节', element }))
}
function measure() {
  if (!initialized || settling || !text.value || !currentItem) return false
  const viewport = frame(), rect = text.value.getBoundingClientRect()
  if (!open.value && (rect.bottom <= viewport.top || rect.top >= viewport.bottom)) return false
  const next = readPosition(text.value, blocks, viewport.top, viewport.height)
  if (resumePending && !target.value && next.index === 0 && next.offset <= 0.1) return false
  resumePending = false; seen = true; position.value = next
  if (target.value && scroller.value?.scrollTop === 0) position.value = { key: '', index: 0, offset: 0, progress: 0 }
  return true
}
function persist() {
  clearTimeout(saveTimer)
  if (!currentItem || !initialized || !seen || settling) return
  const { title: _title, path: _path, ...identity } = currentItem
  library.save({ ...identity, version: 1, updatedAt: Date.now(), position: { ...position.value } } as ReadingRecord, session)
}
function onScroll() {
  if (settling || (active.value && !open.value)) return
  cancelAnimationFrame(frameId)
  frameId = requestAnimationFrame(() => { if (measure()) { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 700) } })
}
function flush() { measure(); persist() }
async function restore(bookmark: ReadingPosition, announce = false) {
  if (!text.value) return
  const version = ++sequence
  settling = true
  await nextTick(); await nextFrame()
  if (version !== sequence || !text.value) return
  refreshBlocks()
  const viewport = frame()
  if (open.value && scroller.value) {
    if (bookmark.progress === 0 && bookmark.index === 0 && bookmark.offset === 0) scroller.value.scrollTo({ top: 0, behavior: 'instant' })
    else scroller.value.scrollTo({ top: scroller.value.scrollTop + positionDelta(text.value, blocks, bookmark, viewport.top, viewport.height), behavior: 'instant' })
  } else if (bookmark.progress > 0 || bookmark.index > 0 || bookmark.offset > 0) {
    window.scrollTo({ top: window.scrollY + positionDelta(text.value, blocks, bookmark, viewport.top, viewport.height), behavior: 'instant' })
  }
  await nextFrame()
  if (version !== sequence) return
  settling = false; position.value = bookmark
  if (announce && (bookmark.index > 0 || bookmark.progress > 0)) notice.value = '已回到上次读到的位置。'
}
async function begin(automatic = false) {
  if (!props.item || open.value) return
  if (!automatic && !resumePending) flush()
  returnY = window.scrollY
  currentItem = { ...props.item }
  const saved = library.find(currentItem)
  session = { saved: Boolean(saved), removed: false }
  position.value = saved?.position || position.value
  resumePending = false; settling = true; active.value = identity.value; seen = true
}
watch(destination, async element => {
  if (!element || !open.value) return
  const bookmark = { ...position.value }
  target.value = element
  await restore(bookmark, true)
  scroller.value?.focus({ preventScroll: true })
  persist()
})
function close() { if (open.value) active.value = null }
watch(open, async value => {
  if (value) return
  // Move the live body back before the modal portal is destroyed.
  const wasSettling = settling
  settling = false; if (wasSettling) persist(); else flush()
  const bookmark = { ...position.value }
  settling = true; ++sequence; target.value = null
  if (document.fullscreenElement && shell.value?.contains(document.fullscreenElement)) await document.exitFullscreen().catch(() => {})
  await nextTick(); await nextFrame()
  if (!initialized) return
  if (bookmark.progress > 0 || bookmark.index > 0 || bookmark.offset > 0) await restore(bookmark)
  else { window.scrollTo({ top: returnY, behavior: 'instant' }); await nextFrame(); settling = false; position.value = bookmark }
  trigger.value?.$el?.focus({ preventScroll: true })
}, { flush: 'sync' })
function autoFocus(event: Event) { event.preventDefault() }
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await shell.value?.requestFullscreen()
  } catch { notice.value = '浏览器未启用系统全屏，仍可使用当前沉浸阅读。' }
}
function fullscreenChange() { fullscreen.value = Boolean(document.fullscreenElement) }
function updateSettings(change: Partial<ReadingSettings>) { library.saveSettings({ ...prefs.value, ...change }) }
watch([prefs, settingsOpen, contentsOpen], async () => {
  if (!open.value || !initialized) return
  const bookmark = { ...position.value }
  await restore(bookmark)
}, { flush: 'pre', deep: true })
function screen(direction: number) {
  const element = scroller.value
  if (element) element.scrollBy({ top: direction * element.clientHeight * 0.85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}
function jump(element: HTMLElement) {
  if (!scroller.value) return
  scroller.value.scrollTo({ top: scroller.value.scrollTop + element.getBoundingClientRect().top - frame().top, behavior: 'instant' })
  onScroll()
}
function followAnchor(event: MouseEvent) {
  if (!open.value || !(event.target instanceof Element)) return
  const link = event.target.closest('a[href]'), href = link?.getAttribute('href')
  if (!href) return
  const url = new URL(href, location.href)
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return
  let id: string
  try { id = decodeURIComponent(url.hash.slice(1)) } catch { return }
  const element = Array.from(text.value?.querySelectorAll<HTMLElement>('[id]') || []).find(node => node.id === id)
  if (element) { event.preventDefault(); event.stopPropagation(); jump(element) }
}
function fromStart() { position.value = { key: '', index: 0, offset: 0, progress: 0 }; void restore(position.value).then(persist) }
function visibility() { if (document.hidden) flush() }
onMounted(async () => {
  if (!props.item) return
  currentItem = { ...props.item }; library.load()
  const saved = library.find(currentItem)
  session.saved = Boolean(saved); resumePending = Boolean(saved); if (saved) position.value = saved.position
  await nextTick(); refreshBlocks(); initialized = true
  canFullscreen.value = Boolean(document.fullscreenEnabled)
  window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', visibility); document.addEventListener('fullscreenchange', fullscreenChange)
  if (route.query.read === currentItem.id) await begin(true)
  else {
    let hash = ''; try { hash = decodeURIComponent(route.hash.slice(1)) } catch { /* Leave malformed fragments alone. */ }
    if (saved && ((currentItem.kind === 'story' && !hash) || hash === currentItem.anchor)) { resumePending = false; await restore(saved.position, true) }
    if (currentItem.kind === 'story') { seen = true; measure(); persist() } else onScroll()
  }
  if (text.value) {
    observer = new ResizeObserver(() => { if (!settling && initialized && seen && (open.value || (text.value!.getBoundingClientRect().top < frame().bottom && text.value!.getBoundingClientRect().bottom > frame().top))) void restore({ ...position.value }) })
    observer.observe(text.value)
  }
})
watch(() => route.query.read, value => { if (initialized && value === currentItem?.id) void begin(true) })
onBeforeRouteLeave(() => { flush(); close() })
onBeforeUnmount(() => {
  flush(); initialized = false; ++sequence; clearTimeout(saveTimer); cancelAnimationFrame(frameId); observer?.disconnect()
  if (open.value) active.value = null
  window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', flush)
  document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', fullscreenChange)
})
</script>

<template>
  <div class="reading-experience">
    <ClientOnly v-if="item">
      <div ref="entry" class="reader-entry" data-pagefind-ignore>
        <UButton ref="trigger" color="neutral" variant="outline" icon="i-lucide-book-open" :aria-label="`沉浸阅读：${item.title}`" @click="begin()">沉浸阅读</UButton>
        <span v-if="notice && !open" class="text-caption text-muted" role="status">{{ notice }}</span>
        <span v-if="library.error.value && !open" class="text-caption text-error" role="status">{{ library.error.value }}</span>
      </div>
    </ClientOnly>
    <Teleport :to="target || 'body'" :disabled="!target">
      <div ref="text" :class="{ 'reader-prose article-prose': open }" @click.capture="followAnchor"><slot /></div>
    </Teleport>
    <UModal v-if="item" v-model:open="open" fullscreen :transition="false" :title="`${item.title} · 沉浸阅读`" description="阅读设置和进度仅保存在当前浏览器。按 Escape 或退出按钮返回正文。" :content="{ onOpenAutoFocus: autoFocus, onCloseAutoFocus: autoFocus }" :ui="{ content: 'reader-dialog overflow-hidden' }">
      <template #content>
        <div ref="shell" class="reader-shell" :data-font="prefs.font" :style="style">
          <header class="reader-toolbar">
            <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" aria-label="退出沉浸阅读" @click="close">退出</UButton>
            <p class="min-w-0 flex-1 truncate text-caption text-muted">{{ item.title }}</p>
            <UButton color="neutral" variant="ghost" icon="i-lucide-list" :aria-expanded="contentsOpen" aria-label="章节目录" @click="contentsOpen = !contentsOpen; settingsOpen = false">目录</UButton>
            <UButton color="neutral" variant="ghost" icon="i-lucide-settings-2" :aria-expanded="settingsOpen" aria-label="阅读设置" @click="settingsOpen = !settingsOpen; contentsOpen = false">设置</UButton>
          </header>
          <section v-if="settingsOpen" aria-label="阅读设置" class="reader-settings border-b border-default">
            <div class="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-4">
              <UFormField label="正文字体"><USelect :model-value="prefs.font" :items="[{ label: '衬线体 Serif', value: 'serif' }, { label: '无衬线体 Sans serif', value: 'sans' }]" :portal="false" class="w-full" @update:model-value="value => updateSettings({ font: value === 'sans' ? 'sans' : 'serif' })" /></UFormField>
              <UFormField label="字号"><USelect :model-value="prefs.size" :items="[16,18,20,22,24,26,28].map(value => ({ label: String(value), value }))" :portal="false" class="w-full" @update:model-value="value => updateSettings({ size: value })" /></UFormField>
              <UFormField label="行距"><USelect :model-value="prefs.lineHeight" :items="[{ label: '紧凑', value: 1.8 }, { label: '标准', value: 2 }, { label: '宽松', value: 2.2 }]" :portal="false" class="w-full" @update:model-value="value => updateSettings({ lineHeight: value })" /></UFormField>
              <UFormField label="色彩模式"><UColorModeSelect :portal="false" class="w-full" /></UFormField>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-inline"><UButton v-if="canFullscreen" color="neutral" variant="outline" icon="i-lucide-maximize" @click="toggleFullscreen">{{ fullscreen ? '退出系统全屏' : '进入系统全屏' }}</UButton><span class="text-caption text-muted">设置自动保存在本机</span></div>
          </section>
          <nav v-if="contentsOpen" class="reader-contents border-b border-default" aria-label="沉浸阅读章节目录"><ol v-if="chapters.length" class="flex flex-wrap gap-2"><li v-for="chapter in chapters" :key="chapter.id" class="min-w-0"><UButton color="neutral" variant="soft" :ui="{ label: 'whitespace-normal text-left' }" @click="jump(chapter.element)">{{ chapter.title }}</UButton></li></ol><p v-else class="text-caption text-muted">本篇没有分节标题。</p></nav>
          <div v-if="library.error.value" class="px-gutter py-2 text-caption text-error" role="status">{{ library.error.value }}</div>
          <div ref="scroller" class="reader-scroll" tabindex="0" :aria-label="`${item.title}阅读正文`" @scroll.passive="onScroll">
            <div class="reader-book">
              <header class="reader-book-title"><p class="eyebrow mb-3">{{ item.kind === 'story' ? 'STORY' : 'FANFICTION' }}</p><h1>{{ item.title }}</h1></header>
              <div ref="destination" />
              <p class="reader-ending text-caption text-muted">本篇完</p>
            </div>
          </div>
          <footer class="reader-footer">
            <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-up" aria-label="上一屏" @click="screen(-1)" />
            <div class="min-w-0 flex-1"><p class="mb-1 text-center text-caption text-muted">已读 {{ percent }}% · 进度保存于本机</p><UProgress :model-value="percent" :max="100" size="xs" aria-label="阅读进度" /></div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-down" aria-label="下一屏" @click="screen(1)" />
            <UButton color="neutral" variant="ghost" class="text-caption" @click="fromStart">从头读</UButton>
          </footer>
        </div>
      </template>
    </UModal>
  </div>
</template>
