<script setup lang="ts">
useSeoMeta({
  title: '开始阅读',
  description: '从一个概念，走进赫特维拉。阅读禁制的运行原理与公共禁制启用的历史片段。',
})
const { data: entries } = await useAsyncData('entry-list', () => queryCollection('wiki').order('routeKey', 'ASC').all())
</script>

<template>
  <main id="main" class="shell home-page">
    <div class="edition-line"><span><i /> 一处世界，许多种读法</span><span>世界观档案 · 试读版</span></div>
    <section class="hero" aria-labelledby="welcome-title">
      <div class="hero-copy">
        <p class="eyebrow">THE HETWILA WORLD</p>
        <h1 id="welcome-title">世界辽阔，<br>从一页开始。</h1>
        <p class="hero-description">从世界运行的原理，到街巷中的日常。<br>沿着概念与故事的联系，慢慢认识赫特维拉。</p>
        <div class="hero-actions">
          <UButton to="/wiki/ban" size="xl" trailing-icon="i-lucide-arrow-up-right" class="hero-button">开始阅读</UButton>
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

    <section id="entries" class="entry-section" aria-labelledby="entries-title">
      <div class="section-heading"><div><p class="eyebrow">EXPLORE THE ARCHIVE</p><h2 id="entries-title">从这里读起</h2></div><span>{{ entries?.length ?? 0 }} 篇试读条目</span></div>
      <div class="entry-grid">
        <NuxtLink v-for="entry in entries" :key="entry.uid" :to="entry.path" class="entry-card">
          <div class="card-top"><span class="entry-icon"><UIcon :name="entry.entityType === 'event' ? 'i-lucide-history' : 'i-lucide-orbit'" /></span><span>{{ entry.category }}</span><UIcon name="i-lucide-arrow-up-right" class="card-arrow" /></div>
          <div class="card-copy"><p class="entry-code">{{ entry.entityType === 'event' ? 'H31-01 · 0年' : 'CONCEPT · 世界原理' }}</p><h3>{{ entry.title }}</h3><p>{{ entry.description }}</p></div>
          <div class="card-bottom"><span><i /> 已确定设定</span><span>阅读条目 <UIcon name="i-lucide-arrow-right" /></span></div>
        </NuxtLink>
      </div>
    </section>

    <section class="future-section" aria-labelledby="future-title">
      <div><p class="eyebrow">MORE WAYS TO EXPLORE</p><h2 id="future-title">事实之外，还有生活</h2><p>同一个世界，也可以从不同的声音中认识。</p></div>
      <div class="future-item"><UIcon name="i-lucide-book-open" /><div><h3>故事书架 <span>待收录</span></h3><p>走进事件之中，阅读更具体的人与经历。</p></div></div>
      <div class="future-item"><UIcon name="i-lucide-messages-square" /><div><h3>世界内论坛 <span>待收录</span></h3><p>日常闲谈、历史讨论，以及他们的同人作品。</p></div></div>
    </section>
    <p class="edition-note"><UIcon name="i-lucide-info" /> 这是第一版试读页面，仅收录设定 3.0.3 的两个节选条目。完整百科、故事与论坛将逐步整理。</p>
  </main>
</template>
