<script setup lang="ts">
import catalog from '../../.generated/catalog.json'
const events = catalog.filter(entry => entry.entityType === 'event' && entry.worldTime.year !== undefined).sort((a, b) => a.worldTime.year! - b.worldTime.year!)
useSeoMeta({ title: '年代', description: '沿着世界纪年阅读公共禁制初期与1747年议长选举。' })
</script>

<template>
  <main id="main" class="shell py-section">
    <p class="eyebrow mb-3">HISTORY OF HETWILA</p>
    <h1 class="section-title">沿着年代，阅读世界的变化</h1>
    <p class="mt-4 max-w-reading text-muted leading-copy">从公共禁制启用，到1747年的首次议长直选。这里按年代串起已经整理的历史片段，逐步补充更多时期。</p>
    <div class="my-stack flex flex-wrap gap-inline"><UBadge color="neutral" variant="outline">世界纪年 · 含0年</UBadge><UBadge color="neutral" variant="outline">{{ events.length }} 个事件</UBadge><UButton to="/reference/公共禁制纪元初期（H31）" variant="link" icon="i-lucide-book-open">阅读 H31 原文</UButton><UButton to="/reference/现代政治框架与共同保障（H48）" variant="link" icon="i-lucide-book-open">阅读 H48 原文</UButton></div>
    <ol aria-label="年代事件" class="max-w-reading space-y-stack">
      <li v-for="entry in events" :key="entry.uid" class="border-s border-accented ps-panel">
        <p class="font-serif text-card text-primary">{{ entry.worldTime.label }}</p>
        <h2 class="my-3 font-semibold text-highlighted"><NuxtLink :to="entry.path" class="hover:text-primary hover:underline">{{ entry.title }}</NuxtLink></h2>
        <p class="text-sm leading-prose text-muted">{{ entry.description }}</p>
        <p class="mt-3 text-meta text-muted">{{ entry.sourceIds.join(' · ') }}</p>
      </li>
    </ol>
    <p class="mt-section text-caption text-muted">这里按设定中的年份排列，0年是有效纪年。这是一份持续扩充的事件目录，年代之间的空档不代表没有发生其他事件。</p>
  </main>
</template>
