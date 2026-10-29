<script setup lang="ts">
import CommentSection from '~/components/comments/CommentSection.vue'
import { commentSectionIdPattern } from '#shared/comment'
const route = useRoute()
const sectionId = computed(() => typeof route.query.id === 'string' && commentSectionIdPattern.test(route.query.id) ? route.query.id : '')
useSeoMeta({ title: '独立评论区', robots: 'noindex, nofollow' })
</script>
<template>
  <main id="main" class="shell py-page-block" data-pagefind-ignore>
    <div class="mx-auto max-w-reading space-y-stack">
      <header><p class="eyebrow mb-2">DISCUSSION</p><h1 class="section-title">独立评论区</h1></header>
      <ClientOnly><CommentSection v-if="sectionId" id="comments" :key="sectionId" :section-id="sectionId" /><UAlert v-else title="请通过有效的评论区链接访问。" color="neutral" /><template #fallback><p class="text-muted">启用 JavaScript 后可通过评论区链接查看讨论。</p></template></ClientOnly>
    </div>
  </main>
</template>
