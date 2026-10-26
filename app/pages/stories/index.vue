<script setup lang="ts">
import catalog from '../../../.generated/catalog.json'
const stories = catalog.filter(entry => entry.entityType === 'story')
useSeoMeta({ title: '故事书架', description: '从具体的人与经历走进赫特维拉，沿着故事中的链接阅读相关百科。' })
</script>

<template>
  <main id="main" class="shell py-section">
    <p class="eyebrow mb-3">STORIES OF HETWILA</p>
    <h1 class="section-title">故事书架</h1>
    <p class="mt-4 max-w-reading text-muted leading-copy">历史记录了结果，故事走进其中的人与生活。阅读时，可以沿着关键词查阅相关设定。</p>
    <p class="my-stack text-caption text-muted">{{ stories.length }} 篇故事 · 作者提供</p>
    <ul class="grid gap-grid md:grid-cols-2">
      <li v-for="entry in stories" :key="entry.uid">
        <UPageCard :title="entry.title" :description="entry.description" :to="entry.path" :aria-label="entry.title" class="h-full">
          <template #header><div class="flex flex-wrap gap-inline text-caption text-muted"><UBadge variant="soft">{{ entry.category }}</UBadge><span>{{ entry.worldTime.label }}</span></div></template>
          <template #title><h2>{{ entry.title }}</h2></template>
          <template #footer><span class="inline-flex items-center gap-inline text-caption text-primary">阅读故事 <UIcon name="i-lucide-arrow-right" /></span></template>
        </UPageCard>
      </li>
    </ul>
    <p v-if="!stories.length" class="py-section text-muted">尚未收录故事。</p>
    <p class="mt-stack max-w-reading text-caption text-muted leading-copy">作品与百科分别标注。对白、场景和个人感受属于叙事，历史背景可通过关联条目核对。</p>
  </main>
</template>
