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
useSeoMeta({ title: () => article.value?.title, description: () => article.value?.description })
useHead({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${path.value}` }] })
</script>

<template>
  <main v-if="article" id="main" class="shell article-layout">
    <aside class="article-sidebar" aria-label="百科导航">
      <NuxtLink to="/#entries" class="back-link"><UIcon name="i-lucide-arrow-left" /> 返回百科</NuxtLink>
      <p class="eyebrow">试读档案</p>
      <nav><NuxtLink v-for="entry in entries" :key="entry.uid" :to="entry.path" :class="{ selected: entry.uid === article.uid }"><UIcon :name="entry.entityType === 'event' ? 'i-lucide-history' : 'i-lucide-orbit'" />{{ entry.title }}</NuxtLink></nav>
      <div class="sidebar-note"><UIcon name="i-lucide-library" /><p>设定基线 <strong>3.0.3</strong></p><small>沿着正文中的链接，继续探索相关概念。</small></div>
    </aside>
    <article class="article-main" data-pagefind-body :data-pagefind-filter="`类型:${article.category}`">
      <header class="article-header">
        <p class="eyebrow">{{ article.entityType === 'event' ? 'HISTORICAL RECORD / H31-01' : 'WORLD ENCYCLOPEDIA' }}</p>
        <div class="article-badges"><UBadge color="primary" variant="soft" size="sm">{{ article.category }}</UBadge><span>已确定设定</span><span>{{ article.worldTime.label }}</span></div>
        <h1>{{ article.title }}</h1>
        <p class="article-lead">{{ article.description }}</p>
        <div class="article-meta"><span><UIcon name="i-lucide-file-text" /> 统合设定节选</span><span>版本 {{ article.settingVersion }}</span><span>{{ article.sourceIds?.join(' · ') }}</span></div>
      </header>
      <ContentRenderer :value="article" class="article-prose" />
      <section class="sources-panel" data-pagefind-ignore aria-labelledby="source-heading">
        <h2 id="source-heading"><UIcon name="i-lucide-book-marked" /> 来源与引用</h2>
        <p>条目整理自作者提供的统合设定，保留原资料的定位坐标。</p>
        <ul><li v-for="source in article.sourceRefs" :key="`${source.path}#${source.anchor}`"><span>{{ source.role === 'primary' ? '主定义' : '补充' }}</span><code>{{ source.path }}#{{ source.anchor }}</code></li></ul>
        <div class="export-links"><a v-if="exported" :href="exported.markdownUrl"><UIcon name="i-lucide-file-down" /> 读取 Markdown</a><a v-if="exported" :href="exported.jsonUrl"><UIcon name="i-lucide-braces" /> 读取 JSON</a></div>
      </section>
      <section v-if="related.length" class="related-section" data-pagefind-ignore aria-labelledby="related-heading"><p class="eyebrow">CONTINUE READING</p><h2 id="related-heading">沿着线索，继续阅读</h2><NuxtLink v-for="entry in related" :key="entry.uid" :to="entry.path"><div><small>{{ entry.category }}</small><h3>{{ entry.title }}</h3><p>{{ entry.description }}</p></div><UIcon name="i-lucide-arrow-up-right" /></NuxtLink></section>
    </article>
    <aside class="article-toc" aria-label="本页目录"><p>本页内容</p><nav><a v-for="link in article.body.toc?.links" :key="link.id" :href="`#${link.id}`">{{ link.text }}</a><a href="#source-heading">来源与引用</a></nav><div class="toc-footnote">一个概念，<br>是通往世界的一扇门。</div></aside>
  </main>
</template>
