<script setup lang="ts">
import type { PublicDocument } from '../../shared/content-schema'

const open = defineModel<boolean>('open', { default: false })
const query = ref('')
const pending = ref(false)
const error = ref(false)
const results = ref<{ title: string, url: string, excerpt: string }[]>([])
const input = useTemplateRef('input')
let request = 0
let debounce: ReturnType<typeof setTimeout> | undefined
interface PagefindData { url: string, meta: { title: string }, excerpt: string }
interface Pagefind { search: (query: string) => Promise<{ results: { data: () => Promise<PagefindData> }[] }> }
let engine: Promise<Pagefind> | undefined
let devDocuments: Promise<PublicDocument[]> | undefined

async function search() {
  const id = ++request
  const term = query.value.trim()
  if (!term) { results.value = []; pending.value = false; return }
  pending.value = true
  error.value = false
  try {
    let found: typeof results.value
    if (import.meta.dev) {
      // Pagefind indexes generated HTML. Dev uses the same public documents for a simple substring lookup.
      devDocuments ??= (async () => {
        const manifest = await $fetch<{ catalog: string }>('/data/v1/manifest.json')
        const catalog = await $fetch<PublicDocument[]>(manifest.catalog)
        return Promise.all(catalog.map(item => $fetch<PublicDocument>(item.jsonUrl)))
      })()
      const docs = await devDocuments
      found = docs.filter(doc => [doc.title, doc.description, ...doc.aliases, ...doc.sourceIds, doc.bodyMarkdown].join(' ').toLowerCase().includes(term.toLowerCase())).map(doc => ({ title: doc.title, url: doc.path, excerpt: doc.description }))
    } else {
      const url = new URL('/pagefind/pagefind.js', window.location.origin).href
      engine ??= import(/* @vite-ignore */ url) as Promise<Pagefind>
      const response = await (await engine).search(term)
      const data = await Promise.all(response.results.slice(0, 8).map(result => result.data()))
      found = data.map(item => ({ title: item.meta.title, url: item.url, excerpt: item.excerpt.replace(/<[^>]*>/g, '') }))
    }
    if (id === request) results.value = found
  } catch {
    if (id === request) { error.value = true; results.value = [] }
    engine = undefined
    devDocuments = undefined
  } finally {
    if (id === request) pending.value = false
  }
}
watch(query, () => {
  ++request
  clearTimeout(debounce)
  debounce = setTimeout(search, 160)
})
watch(open, async (value) => {
  if (value) { await nextTick(); input.value?.inputRef?.focus() }
})
onBeforeUnmount(() => { clearTimeout(debounce); ++request })
</script>

<template>
  <UModal v-model:open="open" title="搜索设定" description="检索已收录的试读条目，或通过历史编号定位事件。" :ui="{ content: 'sm:max-w-search', body: 'p-0 sm:p-0' }">
    <template #body>
      <div class="search-field"><UInput ref="input" v-model="query" autofocus size="xl" icon="i-lucide-search" placeholder="试试「禁制」或「H31-01」" aria-label="搜索关键词" class="w-full" /></div>
      <div class="search-results" aria-live="polite">
        <p v-if="pending" class="search-message">正在查找…</p>
        <p v-else-if="error" class="search-message">搜索暂时不可用。请从首页的条目列表继续阅读。</p>
        <template v-else-if="results.length"><NuxtLink v-for="result in results" :key="result.url" :to="result.url" class="search-result" @click="open = false"><UIcon name="i-lucide-file-text" /><div><strong>{{ result.title }}</strong><p>{{ result.excerpt }}</p></div><UIcon name="i-lucide-arrow-up-right" /></NuxtLink></template>
        <p v-else-if="query.trim()" class="search-message">没有找到相关条目。试试其他关键词或事件编号。</p>
        <p v-else class="search-message">从一个名字、概念或历史编号开始。</p>
      </div>
      <div class="search-bottom">当前为试读档案，完整内容将逐步收录。<span>ESC 关闭</span></div>
    </template>
  </UModal>
</template>
