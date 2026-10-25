<script setup lang="ts">
import catalog from '../../.generated/catalog.json'
const events = catalog.filter(entry => entry.entityType === 'event' && entry.worldTime.year !== undefined).sort((a, b) => a.worldTime.year! - b.worldTime.year!)
useSeoMeta({ title: '年代', description: '沿着世界纪年阅读公共禁制纪元初期的十二个历史事件。' })
</script>

<template>
  <main id="main" class="shell py-section">
    <p class="eyebrow mb-3">HISTORY / H31</p>
    <h1 class="section-title">公共空间第一次长期获得保护</h1>
    <p class="mt-4 max-w-reading text-muted leading-copy">0—99年，公共禁制从南港的长期工程逐渐扩展到更多地方。保护的分配、维护的成本，以及禁制无法解决的日常纠纷，构成了这一时期的变化。</p>
    <div class="my-stack flex flex-wrap gap-inline"><UBadge color="neutral" variant="outline">世界纪年 · 含0年</UBadge><UBadge color="neutral" variant="outline">{{ events.length }} 个事件</UBadge><UButton to="/reference/公共禁制纪元初期（H31）" variant="link" icon="i-lucide-book-open">阅读世纪原文</UButton></div>
    <ol aria-label="年代事件" class="max-w-reading space-y-stack">
      <li v-for="entry in events" :key="entry.uid" class="border-s border-accented ps-panel">
        <p class="font-serif text-card text-primary">{{ entry.worldTime.label }}</p>
        <h2 class="my-3 font-semibold text-highlighted"><NuxtLink :to="entry.path" class="hover:text-primary hover:underline">{{ entry.title }}</NuxtLink></h2>
        <p class="text-sm leading-prose text-muted">{{ entry.description }}</p>
        <p class="mt-3 text-meta text-muted">{{ entry.sourceIds.join(' · ') }}</p>
      </li>
    </ol>
    <p class="mt-section text-caption text-muted">这里按设定中的年份排列，0年是有效纪年。其他时代和不可换算的跨世界阶段尚未收录。</p>
  </main>
</template>
