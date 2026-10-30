<script setup lang="ts">
import type { ForumFanfictionEntry } from '#shared/forum'

defineProps<ForumFanfictionEntry & {
  characterCount: number
  sections: { title: string, anchor: string, depth: number }[]
  previous?: ForumFanfictionEntry
  next?: ForumFanfictionEntry
}>()
</script>

<template>
  <article :id="anchor" class="forum-fanfiction" :aria-labelledby="`${anchor}-title`">
    <header class="fanfiction-header">
      <div class="flex flex-wrap items-center justify-between gap-inline" data-pagefind-ignore>
        <p class="inline-flex items-center gap-2 text-caption text-muted"><UIcon name="i-lucide-book-open" class="size-icon text-primary" /><span>同人文</span><span aria-hidden="true">·</span><span>{{ characterCount.toLocaleString('zh-CN') }} 字</span></p>
        <UButton :to="`#${anchor}-end`" variant="link" color="neutral" trailing-icon="i-lucide-arrow-down" class="min-h-control px-0">跳过正文</UButton>
      </div>
      <h3 :id="`${anchor}-title`" class="fanfiction-title">{{ title }}</h3>
      <details v-if="sections.length" class="fanfiction-toc" data-pagefind-ignore>
        <summary class="cursor-pointer text-caption text-muted min-h-control content-center">本篇目录 · {{ sections.length }} 节</summary>
        <nav :aria-label="`${title}章节目录`" class="flex flex-wrap gap-2 pt-2">
          <UButton v-for="section in sections" :key="section.anchor" :to="`#${section.anchor}`" color="neutral" variant="soft" class="min-h-control" :ui="{ label: 'whitespace-normal text-left' }">{{ section.title }}</UButton>
        </nav>
      </details>
    </header>
    <div class="fanfiction-prose"><slot /></div>
    <footer :id="`${anchor}-end`" class="fanfiction-footer" tabindex="-1" :aria-label="`${title}正文结束`" data-pagefind-ignore>
      <div class="flex flex-wrap items-center justify-between gap-inline">
        <span class="text-caption text-muted">本篇正文结束 · 继续楼层讨论</span>
        <UButton :to="`#${anchor}`" variant="link" color="neutral" icon="i-lucide-arrow-up" class="min-h-control px-0">回到篇首</UButton>
      </div>
      <nav v-if="previous || next" :aria-label="`${title}同人文导航`" class="fanfiction-neighbors">
        <UButton v-if="previous" :to="previous.path" color="neutral" variant="outline" icon="i-lucide-arrow-left" class="min-h-control justify-start" :ui="{ label: 'whitespace-normal text-left' }">上一篇 · {{ previous.title }}</UButton>
        <UButton v-if="next" :to="next.path" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right" class="min-h-control justify-start" :ui="{ label: 'whitespace-normal text-left' }">下一篇 · {{ next.title }}</UButton>
      </nav>
      <UButton :to="path" variant="link" icon="i-lucide-link" class="min-h-control px-0" :aria-label="`${title}永久链接`">本篇链接</UButton>
    </footer>
  </article>
</template>
