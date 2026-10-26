<script setup lang="ts">
import references from '../../.generated/references.json'
import type { ContentMetadata } from '../../shared/content-schema'
withDefaults(defineProps<{
  sources: ContentMetadata['sourceRefs']
  markdownUrl?: string
  jsonUrl?: string
  originalMarkdownUrl?: string
  originalSha256?: string
  story?: boolean
}>(), { story: false })
const sourceUrl = (path: string, anchor: string) => `${references.find(item => item.sourcePath === path)!.path}#${anchor}`
</script>

<template>
  <UCard as="section" class="sources-panel mt-9" data-pagefind-ignore aria-labelledby="source-heading">
    <template #header><h2 id="source-heading" class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-book-marked" class="text-primary" /> {{ story ? '背景依据与原稿' : '来源与引用' }}</h2></template>
    <p class="mb-4 text-caption leading-prose text-muted">{{ story ? '故事由作者提供。以下设定资料用于核对历史背景，具体对白与场景属于本篇叙事。阅读版仅整理章节并增加链接。' : '条目整理自作者提供的统合设定，保留原资料的定位坐标。' }}</p>
    <ul class="space-y-3"><li v-for="source in sources" :key="`${source.path}#${source.anchor}`" class="flex gap-inline leading-prose"><span class="shrink-0 text-caption text-muted">{{ source.role === 'primary' ? '主定义' : '补充' }}</span><NuxtLink :to="sourceUrl(source.path, source.anchor)" class="text-primary underline decoration-primary/40 hover:decoration-primary min-w-0"><code>{{ source.path }}#{{ source.anchor }}</code></NuxtLink></li></ul>
    <details v-if="originalSha256" class="mt-stack text-caption text-muted"><summary class="cursor-pointer">原稿校验值（SHA-256）</summary><code class="mt-3 block break-all">{{ originalSha256 }}</code></details>
    <template #footer><div class="flex flex-wrap gap-5">
      <UButton v-if="originalMarkdownUrl" :to="originalMarkdownUrl" external variant="link" icon="i-lucide-file-down" class="p-0 text-caption">下载作者原稿</UButton>
      <UButton v-if="markdownUrl" :to="markdownUrl" external variant="link" icon="i-lucide-file-text" class="p-0 text-caption">读取 Markdown</UButton>
      <UButton v-if="jsonUrl" :to="jsonUrl" external variant="link" icon="i-lucide-braces" class="p-0 text-caption">读取 JSON</UButton>
    </div></template>
  </UCard>
</template>
