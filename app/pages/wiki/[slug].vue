<script setup lang="ts">
import catalog from '../../../.generated/catalog.json'

const route = useRoute()
const path = computed(() => `/wiki/${String(route.params.slug)}`)
const { data: article } = await useAsyncData(() => `wiki-${path.value}`, () => queryCollection('wiki').path(path.value).first())
if (!article.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到条目' })
const { data: entries } = await useAsyncData('wiki-navigation', () => queryCollection('wiki').all())
const exported = computed(() => catalog.find(item => item.uid === article.value?.uid))
const related = computed(() => entries.value?.filter(item => item.uid !== article.value?.uid && (
  article.value?.relations?.some(relation => relation.target === item.uid) || item.relations?.some(relation => relation.target === article.value?.uid)
)) ?? [])
const navigation = computed(() => entries.value?.map(entry => ({
  label: entry.title,
  to: entry.path,
  icon: entry.entityType === 'event' ? 'i-lucide-history' : 'i-lucide-orbit',
  active: entry.uid === article.value?.uid,
})) ?? [])
const toc = computed(() => [...(article.value?.body.toc?.links ?? []), { id: 'source-heading', text: '来源与引用', depth: 2 }])
useSeoMeta({ title: () => article.value?.title, description: () => article.value?.description })
useHead({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${path.value}` }] })
</script>

<template>
  <main v-if="article" id="main" class="shell article-layout">
    <aside class="article-sidebar" aria-label="百科导航">
      <UButton to="/#entries" color="neutral" variant="link" icon="i-lucide-arrow-left" class="p-0 text-caption">返回百科</UButton>
      <div class="sidebar-content mt-9">
        <p class="eyebrow mb-3">试读档案</p>
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
        <p class="eyebrow mb-5">{{ article.entityType === 'event' ? 'HISTORICAL RECORD / H31-01' : 'WORLD ENCYCLOPEDIA' }}</p>
        <div class="flex flex-wrap items-center gap-inline text-caption text-muted"><UBadge color="primary" variant="soft" size="sm">{{ article.category }}</UBadge><span>已确定设定</span><span>{{ article.worldTime.label }}</span></div>
        <h1>{{ article.title }}</h1>
        <p class="article-lead">{{ article.description }}</p>
        <div class="flex flex-wrap gap-inline text-meta text-muted"><span class="inline-flex items-center gap-1"><UIcon name="i-lucide-file-text" /> 统合设定节选</span><span>版本 {{ article.settingVersion }}</span><span>{{ article.sourceIds?.join(' · ') }}</span></div>
      </header>
      <UContentToc :links="toc" title="本页内容" class="mobile-toc lg:hidden" data-pagefind-ignore />
      <ContentRenderer :value="article" class="article-prose" />
      <UCard as="section" class="sources-panel mt-9" data-pagefind-ignore aria-labelledby="source-heading">
        <template #header><h2 id="source-heading" class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-book-marked" class="text-primary" /> 来源与引用</h2></template>
        <p class="mb-4 text-caption leading-prose text-muted">条目整理自作者提供的统合设定，保留原资料的定位坐标。</p>
        <ul class="space-y-3"><li v-for="source in article.sourceRefs" :key="`${source.path}#${source.anchor}`" class="flex gap-inline leading-prose"><span class="shrink-0 text-caption text-muted">{{ source.role === 'primary' ? '主定义' : '补充' }}</span><code>{{ source.path }}#{{ source.anchor }}</code></li></ul>
        <template #footer><div class="flex flex-wrap gap-5">
          <UButton v-if="exported" :to="exported.markdownUrl" external variant="link" icon="i-lucide-file-down" class="p-0 text-caption">读取 Markdown</UButton>
          <UButton v-if="exported" :to="exported.jsonUrl" external variant="link" icon="i-lucide-braces" class="p-0 text-caption">读取 JSON</UButton>
        </div></template>
      </UCard>
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
