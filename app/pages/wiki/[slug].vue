<script setup lang="ts">
import catalog from '../../../.generated/catalog.json'
import graph from '../../../.generated/relations.json'
import events from '../../../.generated/events.json'
import { factLabels } from '~/utils/content'

const route = useRoute()
const entry = computed(() => catalog.find(item => item.entityType !== 'story' && item.routeKey === route.params.slug))
if (!entry.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到条目' })
const { data: article } = await useAsyncData(() => `wiki-${entry.value?.uid}`, () => queryCollection('wiki').where('routeKey', '=', entry.value!.routeKey).first())
if (!article.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到条目' })
const exported = entry
const related = computed(() => catalog.filter(item => item.entityType !== 'story' && graph.some(edge => edge.source === entry.value?.uid && edge.targetArticleUid === item.uid)))
const backlinks = computed(() => catalog.filter(item => item.entityType !== 'story' && graph.some(edge => edge.targetArticleUid === entry.value?.uid && edge.source === item.uid)))
const navigation = computed(() => [...new Set(catalog.filter(item => item.entityType !== 'story').map(item => item.category))].map(category => ({ label: category, to: `/wiki/category/${category}`, icon: category === '历史与变革' ? 'i-lucide-history' : 'i-lucide-orbit' })))
const eventIndex = computed(() => events.findIndex(item => item.uid === entry.value?.uid))
const previous = computed(() => eventIndex.value > 0 ? events[eventIndex.value - 1] : undefined)
const next = computed(() => eventIndex.value >= 0 ? events[eventIndex.value + 1] : undefined)
const relatedStories = computed(() => catalog.filter(item => item.entityType === 'story' && graph.some(edge => edge.source === item.uid && edge.targetArticleUid === entry.value?.uid)))
const toc = computed(() => [...(article.value?.body.toc?.links ?? []), { id: 'source-heading', text: '来源与引用', depth: 2 }, ...(relatedStories.value.length ? [{ id: 'related-stories', text: '相关故事', depth: 2 }] : []), ...(backlinks.value.length ? [{ id: 'backlinks-heading', text: '链入本页', depth: 2 }] : [])])
useSeoMeta({ title: () => article.value?.title, description: () => article.value?.description })
useHead(() => ({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${entry.value!.path}` }] }))
</script>

<template>
  <main v-if="article" id="main" class="shell article-layout">
    <aside class="article-sidebar" aria-label="百科导航">
      <UButton to="/wiki" color="neutral" variant="link" icon="i-lucide-arrow-left" class="p-0 text-caption">返回百科</UButton>
      <div class="sidebar-content mt-9">
        <p class="eyebrow mb-3">主题目录</p>
        <UNavigationMenu :items="navigation" orientation="vertical" :ui="{ link: 'text-caption', linkLabel: 'whitespace-normal' }" />
        <div class="mt-8 border-t border-default pt-6 text-caption text-muted">
          <UIcon name="i-lucide-library" class="mb-3 size-icon text-primary" />
          <p>设定基线 <strong class="font-medium text-default">3.0.3</strong></p>
          <p class="mt-3 leading-prose">沿着正文中的链接，继续探索相关概念。</p>
        </div>
      </div>
    </aside>
    <article class="article-main" data-pagefind-body :data-pagefind-filter="`类型:${article.category}`">
      <header class="article-header">
        <p class="eyebrow mb-5">{{ article.entityType === 'event' ? `HISTORICAL RECORD / ${article.sourceIds?.join(' · ')}` : 'WORLD ENCYCLOPEDIA' }}</p>
        <div class="flex flex-wrap items-center gap-inline text-caption text-muted"><UBadge color="primary" variant="soft" size="sm">{{ article.category }}</UBadge><span>{{ factLabels[article.factStatus] }}</span><span>{{ article.worldTime.label }}</span></div>
        <h1>{{ article.title }}</h1>
        <p v-if="article.aliases?.length" class="mb-3 text-caption text-muted">别名：{{ article.aliases?.join('、') }}</p>
        <p class="article-lead">{{ article.description }}</p>
        <div class="flex flex-wrap gap-inline text-meta text-muted"><span class="inline-flex items-center gap-1"><UIcon name="i-lucide-file-text" /> 统合设定节选</span><span>版本 {{ article.settingVersion }}</span><span>{{ article.sourceIds?.join(' · ') }}</span></div>
      </header>
      <UContentToc :links="toc" title="本页内容" class="mobile-toc lg:hidden" data-pagefind-ignore />
      <ContentRenderer :value="article" class="article-prose" />
      <ContentSources :sources="article.sourceRefs" :markdown-url="exported?.markdownUrl" :json-url="exported?.jsonUrl" />
      <section v-if="relatedStories.length" id="related-stories" class="mt-section" aria-labelledby="related-stories-heading" data-pagefind-ignore>
        <p class="eyebrow mb-2">READ THE STORY</p><h2 id="related-stories-heading" class="section-title mb-stack">相关故事</h2>
        <p class="mb-stack text-caption text-muted">这些作品描写或提及本条目。具体对白与场景属于故事叙事。</p>
        <UPageCard v-for="item in relatedStories" :key="item.uid" :title="item.title" :description="item.description" :to="item.path" :aria-label="item.title" class="related-card">
          <template #header><UBadge variant="soft">{{ item.worldTime.label }} · {{ item.category }}</UBadge></template>
          <template #title><h3>{{ item.title }}</h3></template>
        </UPageCard>
      </section>
      <nav v-if="previous || next" aria-label="相邻年代事件" class="my-stack flex flex-wrap justify-between gap-inline" data-pagefind-ignore>
        <UButton v-if="previous" :to="previous.path" color="neutral" variant="outline" icon="i-lucide-arrow-left">{{ previous.worldTime.label }} · 上一事件</UButton>
        <UButton v-if="next" :to="next.path" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right">{{ next.worldTime.label }} · 下一事件</UButton>
      </nav>
      <section v-if="backlinks.length" aria-labelledby="backlinks-heading" class="mt-section" data-pagefind-ignore>
        <h2 id="backlinks-heading" class="section-title mb-stack">链入本页</h2>
        <p class="text-caption text-muted mb-4">以下条目通过正文或明确关系引用本页。</p>
        <ul class="space-y-3"><li v-for="item in backlinks" :key="item.uid"><NuxtLink :to="item.path" class="text-primary underline decoration-primary/40 hover:decoration-primary">{{ item.title }}</NuxtLink><span class="ms-3 text-caption text-muted">{{ item.worldTime.label }}</span></li></ul>
      </section>
      <section v-if="related.length" class="mt-section" data-pagefind-ignore aria-labelledby="related-heading">
        <p class="eyebrow mb-2">CONTINUE READING</p><h2 id="related-heading" class="mb-stack font-serif text-card text-highlighted">沿着线索，继续阅读</h2>
        <UPageCard v-for="entry in related" :key="entry.uid" :title="entry.title" :description="entry.description" :to="entry.path" class="related-card" :ui="{ title: 'text-xl' }">
          <template #header><div class="flex items-center justify-between text-caption text-muted"><span>{{ entry.category }}</span><UIcon name="i-lucide-arrow-up-right" class="size-icon" /></div></template>
          <template #title><h3>{{ entry.title }}</h3></template>
        </UPageCard>
      </section>
    </article>
    <aside class="article-toc" aria-label="本页目录">
      <UContentToc :links="toc" title="本页内容" highlight />
      <p class="mt-8 border-t border-default pt-5 font-serif text-caption leading-prose text-muted">一个概念，<br>是通往世界的一扇门。</p>
    </aside>
  </main>
</template>
