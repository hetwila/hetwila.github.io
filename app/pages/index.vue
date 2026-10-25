<script setup lang="ts">
useSeoMeta({
  title: '开始阅读',
  description: '从一个概念，走进赫特维拉。阅读禁制的运行原理与公共禁制启用的历史片段。',
})
const { data: entries } = await useAsyncData('entry-list', () => queryCollection('wiki').order('routeKey', 'ASC').all())
</script>

<template>
  <main id="main" class="shell home-page">
    <div class="my-6 flex items-center justify-between gap-4 text-[11px] text-muted sm:my-8">
      <span class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-primary" /> 一处世界，许多种读法</span>
      <UBadge color="neutral" variant="outline" size="sm">世界观档案 · 试读版</UBadge>
    </div>
    <section class="hero" aria-labelledby="welcome-title">
      <div class="hero-copy">
        <p class="eyebrow">THE HETWILA WORLD</p>
        <h1 id="welcome-title">世界辽阔，<br>从一页开始。</h1>
        <p class="hero-description">从世界运行的原理，到街巷中的日常。<br>沿着概念与故事的联系，慢慢认识赫特维拉。</p>
        <div class="flex flex-wrap items-center gap-6">
          <UButton to="/wiki/ban" size="xl" trailing-icon="i-lucide-arrow-up-right" class="hero-button bg-hero-action text-hero-action-text hover:bg-hero-action-hover active:bg-hero-action-hover px-5 py-3 text-sm gap-6">开始阅读</UButton>
          <a href="#entries" class="hero-secondary">浏览试读条目 <span>↓</span></a>
        </div>
        <p class="hero-footnote"><span class="small-line" /> 当前收录：禁制与公共工程的历史</p>
      </div>
      <ArchiveArt />
    </section>

    <section class="reading-path" aria-label="推荐阅读路线">
      <div class="path-label"><UIcon name="i-lucide-route" /><span>第一次来？<small>沿着一条线索阅读</small></span></div>
      <NuxtLink to="/wiki/ban"><span class="step-no">01</span><span>理解一个概念<small>禁制如何运作</small></span><UIcon name="i-lucide-arrow-right" /></NuxtLink>
      <NuxtLink to="/wiki/h31-01"><span class="step-no">02</span><span>看见一次转折<small>公共空间获得保护</small></span><UIcon name="i-lucide-arrow-right" /></NuxtLink>
    </section>

    <section id="entries" class="pt-12 sm:pt-16" aria-labelledby="entries-title">
      <div class="mb-6 flex items-end justify-between gap-4">
        <div><p class="eyebrow mb-2">EXPLORE THE ARCHIVE</p><h2 id="entries-title" class="section-title">从这里读起</h2></div>
        <span class="pb-1 text-xs text-muted">{{ entries?.length ?? 0 }} 篇试读条目</span>
      </div>
      <UPageGrid class="sm:grid-cols-2 xl:grid-cols-2 gap-5">
        <UPageCard v-for="entry in entries" :key="entry.uid" :title="entry.title" :description="entry.description" :to="entry.path" :aria-label="entry.title" class="entry-card">
          <template #header>
            <div class="flex items-center gap-3 text-xs text-muted">
              <span class="entry-icon"><UIcon :name="entry.entityType === 'event' ? 'i-lucide-history' : 'i-lucide-orbit'" class="size-5" /></span>
              <span>{{ entry.category }}</span>
              <UIcon name="i-lucide-arrow-up-right" class="ms-auto size-5 text-dimmed" />
            </div>
          </template>
          <template #title>
            <p class="mb-2 font-sans text-[10px] font-medium tracking-wider text-muted">{{ entry.entityType === 'event' ? 'H31-01 · 0年' : 'CONCEPT · 世界原理' }}</p>
            <h3>{{ entry.title }}</h3>
          </template>
          <template #footer>
            <div class="flex items-center justify-between gap-3 text-xs text-muted">
              <span class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-primary" /> 已确定设定</span>
              <span class="inline-flex items-center gap-2">阅读条目 <UIcon name="i-lucide-arrow-right" /></span>
            </div>
          </template>
        </UPageCard>
      </UPageGrid>
    </section>

    <section class="mt-12 grid gap-7 border-y border-default py-8 lg:grid-cols-[1.2fr_1fr_1fr] lg:py-10" aria-labelledby="future-title">
      <div><p class="eyebrow mb-2">MORE WAYS TO EXPLORE</p><h2 id="future-title" class="font-serif text-xl font-semibold text-highlighted">事实之外，还有生活</h2><p class="mt-3 text-xs leading-6 text-muted">同一个世界，也可以从不同的声音中认识。</p></div>
      <div class="flex gap-4"><UIcon name="i-lucide-book-open" class="mt-1 size-5 shrink-0 text-primary" /><div><h3 class="flex items-center gap-3 text-sm font-semibold text-highlighted">故事书架 <UBadge color="neutral" variant="subtle" size="sm">待收录</UBadge></h3><p class="mt-3 text-xs leading-6 text-muted">走进事件之中，阅读更具体的人与经历。</p></div></div>
      <div class="flex gap-4"><UIcon name="i-lucide-messages-square" class="mt-1 size-5 shrink-0 text-primary" /><div><h3 class="flex items-center gap-3 text-sm font-semibold text-highlighted">世界内论坛 <UBadge color="neutral" variant="subtle" size="sm">待收录</UBadge></h3><p class="mt-3 text-xs leading-6 text-muted">日常闲谈、历史讨论，以及他们的同人作品。</p></div></div>
    </section>
    <p class="edition-note"><UIcon name="i-lucide-info" /> 这是第一版试读页面，仅收录设定 3.0.3 的两个节选条目。完整百科、故事与论坛将逐步整理。</p>
  </main>
</template>
