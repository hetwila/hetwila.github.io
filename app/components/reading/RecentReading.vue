<script setup lang="ts">
import catalog from '../../../.generated/catalog.json'
import forum from '../../../.generated/forum.json'
import { readingHref, readingIdentityKey, type ReadingItem } from '#shared/reading'
import { FORUM_PAGE_SIZE } from '#shared/forum'
const library = useReadingLibrary()
const entries = computed(() => library.records.value.map(record => {
  let item: ReadingItem | undefined
  if (record.ownerId && record.documentId) {
    const path = record.kind === 'story' ? `/private/read?id=${record.documentId}` : `/private/read?id=${record.documentId}&page=${Math.ceil(record.floor! / FORUM_PAGE_SIZE)}#${record.anchor}`
    item = { ...record, title: record.kind === 'story' ? '私有故事' : '私有同人文', path }
  } else if (record.kind === 'story') {
    const story = catalog.find(entry => entry.entityType === 'story' && entry.uid === record.id)
    if (story) item = { ...record, title: story.title, path: story.path }
  } else {
    const thread = forum.find(thread => record.id === `${thread.uid}/${record.anchor}`)
    const fiction = thread?.fanfiction.find(fiction => fiction.anchor === record.anchor)
    if (fiction) item = { ...record, title: fiction.title, path: fiction.path }
  }
  return { record, item, key: readingIdentityKey(record) }
}))
</script>
<template>
  <section class="mt-section" aria-labelledby="recent-reading-title" data-pagefind-ignore="all">
    <div class="mb-stack"><p class="eyebrow mb-2">CONTINUE READING</p><h2 id="recent-reading-title" class="section-title">最近读过</h2><p class="mt-3 text-caption text-muted">阅读记录只保存在这个浏览器。移除项目也会清除它的阅读进度。</p></div>
    <ClientOnly>
      <p v-if="!library.ready.value" class="text-muted" role="status">正在读取本机记录…</p>
      <ul v-else-if="entries.length" class="grid gap-grid sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="entry in entries" :key="entry.key" class="min-w-0 rounded-card border border-default bg-raised p-panel">
          <div class="mb-3 flex items-start justify-between gap-3"><UBadge color="neutral" variant="subtle">{{ entry.record.kind === 'story' ? '故事' : '同人文' }}{{ entry.record.ownerId ? ' · 私有' : '' }}</UBadge><UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="`移除阅读记录：${entry.item?.title || '已移除的内容'}`" @click="library.remove(entry.record)" /></div>
          <h3 class="font-serif text-xl font-semibold text-highlighted break-words"><NuxtLink v-if="entry.item" :to="readingHref(entry.item)" :aria-label="`最近读过：${entry.item.title}`" class="hover:text-primary">{{ entry.item.title }}</NuxtLink><span v-else>内容已移除</span></h3>
          <p v-if="entry.record.ownerId" class="mt-2 text-caption text-muted">进入后确认阅读权限，本机记录不保存篇名或正文。</p>
          <div class="my-4"><p class="mb-2 text-caption text-muted">已读 {{ Math.round(entry.record.position.progress * 100) }}%</p><UProgress :model-value="Math.round(entry.record.position.progress * 100)" :max="100" size="xs" :aria-label="`${entry.item?.title || '内容'}阅读进度`" /></div>
          <div class="flex flex-wrap items-center justify-between gap-3"><time :datetime="new Date(entry.record.updatedAt).toISOString()" class="text-caption text-muted">{{ new Date(entry.record.updatedAt).toLocaleDateString('zh-CN') }}</time><UButton v-if="entry.item" :to="readingHref(entry.item)" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right" :aria-label="`继续阅读：${entry.item.title}`">继续阅读</UButton></div>
        </li>
      </ul>
      <p v-else class="rounded-card border border-dashed border-default p-panel text-muted">还没有阅读记录。读一篇故事或楼内同人文，下次从这里继续。</p>
      <p v-if="library.error.value" role="status" class="mt-3 text-caption text-error">{{ library.error.value }}</p>
      <template #fallback><p class="text-caption text-muted">启用 JavaScript 后可查看本机阅读记录。</p></template>
    </ClientOnly>
  </section>
</template>
