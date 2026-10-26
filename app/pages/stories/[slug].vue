<script setup lang="ts">
import catalog from '../../../.generated/catalog.json'
import graph from '../../../.generated/relations.json'
import events from '../../../.generated/events.json'

const route = useRoute()
const entry = computed(() => catalog.find(item => item.entityType === 'story' && item.routeKey === route.params.slug))
if (!entry.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到故事' })
const { data: story } = await useAsyncData(() => `story-${entry.value?.uid}`, () => queryCollection('stories').where('routeKey', '=', entry.value!.routeKey).first())
if (!story.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到故事' })
const related = computed(() => catalog.filter(item => item.entityType !== 'story' && graph.some(edge => edge.source === entry.value?.uid && edge.targetArticleUid === item.uid)))
const depicted = computed(() => events.filter(item => graph.some(edge => edge.source === entry.value?.uid && edge.target === item.uid && edge.type === 'depicts')))
const toc = computed(() => [...(story.value?.body.toc?.links ?? []), { id: 'related-wiki', text: '相关百科', depth: 2 }, { id: 'source-heading', text: '背景依据与原稿', depth: 2 }])
useSeoMeta({ title: () => story.value?.title, description: () => story.value?.description })
useHead(() => ({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${entry.value!.path}` }] }))
</script>

<template>
  <main v-if="story && entry" id="main" class="shell py-page-block">
    <UButton to="/stories" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-stack p-0 text-caption">返回故事书架</UButton>
    <UPage :ui="{ right: 'hidden lg:block' }">
      <article class="article-main mx-auto w-full max-w-reading" data-pagefind-body data-pagefind-filter="类型:故事">
        <header class="article-header">
          <p class="eyebrow mb-5">A STORY OF HETWILA</p>
          <div class="flex flex-wrap gap-inline text-caption text-muted"><UBadge variant="soft">{{ story.category }}</UBadge><span>{{ story.worldTime.label }}</span><span>作者提供</span></div>
          <h1>{{ story.title }}</h1>
          <p class="article-lead">{{ story.description }}</p>
          <div class="flex flex-wrap items-center gap-inline text-caption" data-pagefind-ignore><span class="text-muted">故事中的事件</span><UButton v-for="event in depicted" :key="event.uid" :to="event.path" variant="outline" icon="i-lucide-history">{{ event.title }}</UButton></div>
        </header>
        <UContentToc :links="toc" title="故事目录" class="mobile-toc lg:hidden" data-pagefind-ignore />
        <ContentRenderer :value="story" class="article-prose story-prose" />
        <section id="related-wiki" class="mt-section" aria-labelledby="related-wiki-heading" data-pagefind-ignore>
          <p class="eyebrow mb-2">BEYOND THE STORY</p><h2 id="related-wiki-heading" class="section-title mb-stack">相关百科</h2>
          <div class="grid gap-grid sm:grid-cols-2">
            <UPageCard v-for="item in related" :key="item.uid" :title="item.title" :description="item.description" :to="item.path" :aria-label="item.title" :ui="{ title: 'text-xl' }">
              <template #title><h3>{{ item.title }}</h3></template>
              <template #footer><span class="text-caption text-muted">{{ item.category }} · 已确定设定</span></template>
            </UPageCard>
          </div>
        </section>
        <ContentSources :sources="story.sourceRefs" :markdown-url="entry.markdownUrl" :json-url="entry.jsonUrl" :original-markdown-url="entry.originalMarkdownUrl" :original-sha256="entry.originalSha256" story />
      </article>
      <template #right><UContentToc :links="toc" title="故事目录" highlight /></template>
    </UPage>
  </main>
</template>
