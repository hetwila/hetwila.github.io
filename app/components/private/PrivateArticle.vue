<script setup lang="ts">
import type { PrivateDocument } from '#shared/private-content'
import { renderReadingMarkdown } from '#shared/comment-markdown'
import ReadingMarkdown from './ReadingMarkdown.vue'
import AgeRatingBadge from './AgeRatingBadge.vue'
const props = withDefaults(defineProps<{ document: PrivateDocument; privateContent?: boolean }>(), { privateContent: true })
const options = computed(() => ({ prefix: `document-${props.document.id}` }))
const toc = computed(() => renderReadingMarkdown(props.document.body_markdown, options.value).headings)
</script>
<template>
  <UPage :ui="{ right: 'hidden lg:block' }">
    <article class="article-main mx-auto w-full max-w-reading">
      <header class="article-header">
        <p class="eyebrow mb-5">{{ document.kind === 'wiki' ? 'WORLD ENCYCLOPEDIA' : 'A STORY OF HETWILA' }}</p>
        <div class="flex flex-wrap items-center gap-inline text-caption text-muted"><UBadge v-if="document.category" variant="soft">{{ document.category }}</UBadge><template v-if="privateContent"><UBadge color="neutral" variant="subtle" icon="i-lucide-lock-keyhole">私有</UBadge><AgeRatingBadge :rating="document.age_rating" /></template><span v-if="document.status === 'draft'">草稿</span></div>
        <h1>{{ document.title }}</h1>
        <p v-if="document.description" class="article-lead">{{ document.description }}</p>
        <p v-if="document.author_name" class="text-caption text-muted">{{ document.author_name }}</p>
      </header>
      <UContentToc v-if="toc.length" :links="toc" title="本页内容" class="mobile-toc lg:hidden" />
      <ReadingMarkdown :source="document.body_markdown" :options="options" class="article-prose" :class="{ 'story-prose': document.kind === 'story' }" />
    </article>
    <template #right><UContentToc v-if="toc.length" :links="toc" title="本页内容" highlight /></template>
  </UPage>
</template>
