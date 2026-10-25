<script setup lang="ts">
import catalog from '../../../.generated/catalog.json'
import graph from '../../../.generated/relations.json'
import references from '../../../.generated/references.json'
import { factLabels } from '~/utils/content'

const route = useRoute()
const entry = computed(() => catalog.find(item => item.routeKey === route.params.slug || item.redirects.includes(String(route.params.slug))))
if (!entry.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到条目' })
const { data: article } = await useAsyncData(() => `wiki-${entry.value?.uid}`, () => queryCollection('wiki').where('routeKey', '=', entry.value!.routeKey).first())
if (!article.value) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到条目' })
const exported = entry
const legacy = computed(() => entry.value && route.params.slug !== entry.value.routeKey)
onMounted(() => watch(() => route.fullPath, () => {
  if (legacy.value) navigateTo({ path: entry.value!.path, hash: route.hash, query: route.query }, { replace: true })
}, { immediate: true }))
const related = computed(() => catalog.filter(item => graph.some(edge => edge.source === entry.value?.uid && edge.target === item.uid)))
const backlinks = computed(() => catalog.filter(item => graph.some(edge => edge.target === entry.value?.uid && edge.source === item.uid)))
const navigation = computed(() => [...new Set(catalog.map(item => item.category))].map(category => ({ label: category, to: `/wiki/category/${category}`, icon: category === '历史与变革' ? 'i-lucide-history' : 'i-lucide-orbit' })))
const events = catalog.filter(item => item.entityType === 'event' && item.worldTime.year !== undefined).sort((a, b) => a.worldTime.year! - b.worldTime.year!)
const eventIndex = computed(() => events.findIndex(item => item.uid === entry.value?.uid))
const previous = computed(() => eventIndex.value > 0 ? events[eventIndex.value - 1] : undefined)
const next = computed(() => eventIndex.value >= 0 ? events[eventIndex.value + 1] : undefined)
const sourceUrl = (path: string, anchor: string) => `${references.find(item => item.sourcePath === path)!.path}#${anchor}`
const toc = computed(() => [...(article.value?.body.toc?.links ?? []), { id: 'source-heading', text: '来源与引用', depth: 2 }, ...(backlinks.value.length ? [{ id: 'backlinks-heading', text: '链入本页', depth: 2 }] : [])])
useSeoMeta({ title: () => article.value?.title, description: () => article.value?.description, robots: () => legacy.value ? 'noindex, follow' : 'index, follow' })
useHead(() => ({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${entry.value!.path}` }] }))
</script>

<template>
  <main v-if="legacy && entry" id="main" class="shell py-section">
    <UPageCard title="条目已更名" :description="`请前往中文标题页面：${entry.title}。`" class="max-w-reading mx-auto">
      <template #title><h1>条目已更名</h1></template>
      <UButton :to="entry.path" trailing-icon="i-lucide-arrow-right">{{ entry.title }}</UButton>
      <p class="text-caption text-muted">旧地址仍保留此阅读入口。</p>
    </UPageCard>
  </main>
  <main v-else-if="article" id="main" class="shell article-layout">
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
      <UCard as="section" class="sources-panel mt-9" data-pagefind-ignore aria-labelledby="source-heading">
        <template #header><h2 id="source-heading" class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-book-marked" class="text-primary" /> 来源与引用</h2></template>
        <p class="mb-4 text-caption leading-prose text-muted">条目整理自作者提供的统合设定，保留原资料的定位坐标。</p>
        <ul class="space-y-3"><li v-for="source in article.sourceRefs" :key="`${source.path}#${source.anchor}`" class="flex gap-inline leading-prose"><span class="shrink-0 text-caption text-muted">{{ source.role === 'primary' ? '主定义' : '补充' }}</span><NuxtLink :to="sourceUrl(source.path, source.anchor)" class="text-primary underline decoration-primary/40 hover:decoration-primary min-w-0"><code>{{ source.path }}#{{ source.anchor }}</code></NuxtLink></li></ul>
        <template #footer><div class="flex flex-wrap gap-5">
          <UButton v-if="exported" :to="exported.markdownUrl" external variant="link" icon="i-lucide-file-down" class="p-0 text-caption">读取 Markdown</UButton>
          <UButton v-if="exported" :to="exported.jsonUrl" external variant="link" icon="i-lucide-braces" class="p-0 text-caption">读取 JSON</UButton>
        </div></template>
      </UCard>
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
