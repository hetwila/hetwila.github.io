<script setup lang="ts">
import allContent from '../../.generated/catalog.json'
import { matchesEntry, factLabels } from '~/utils/content'

const catalog = allContent.filter(entry => entry.entityType !== 'story')

const props = defineProps<{ category?: string }>()
const query = ref('')
const categories = [...new Set(catalog.map(entry => entry.category))]
const entries = computed(() => catalog.filter(entry => (!props.category || entry.category === props.category) && matchesEntry(entry, query.value)))
</script>

<template>
  <main id="main" class="shell py-section">
    <p class="eyebrow mb-3">WORLD ENCYCLOPEDIA</p>
    <h1 class="section-title">{{ category || '设定百科' }}</h1>
    <p class="mt-4 text-muted leading-copy">从概念、别名或事件编号开始，沿着条目中的链接继续阅读。</p>
    <nav aria-label="百科分类" class="my-stack flex flex-wrap gap-inline">
      <UButton to="/wiki" :variant="!category ? 'solid' : 'outline'" :aria-current="!category ? 'page' : undefined">全部条目</UButton>
      <UButton v-for="item in categories" :key="item" :to="`/wiki/category/${item}`" :variant="category === item ? 'solid' : 'outline'" :aria-current="category === item ? 'page' : undefined">{{ item }}</UButton>
    </nav>
    <UInput v-model="query" icon="i-lucide-search" aria-label="筛选百科条目" placeholder="标题、别名或编号" class="w-full max-w-reading" />
    <p class="my-stack text-caption text-muted" aria-live="polite">{{ entries.length }} 个条目 · 设定 3.0.3</p>
    <ul class="grid gap-grid md:grid-cols-2">
      <li v-for="entry in entries" :key="entry.uid">
        <UPageCard :title="entry.title" :description="entry.description" :to="entry.path" :aria-label="entry.title" class="h-full" :ui="{ title: 'text-xl' }">
          <template #header><div class="flex flex-wrap items-center gap-inline text-caption text-muted"><UBadge variant="soft">{{ entry.category }}</UBadge><span>{{ entry.worldTime.label }}</span><span>{{ entry.sourceIds.join(' · ') }}</span></div></template>
          <template #title><h2>{{ entry.title }}</h2></template>
          <template #footer><span class="text-caption text-muted">{{ factLabels[entry.factStatus as keyof typeof factLabels] }}</span></template>
        </UPageCard>
      </li>
    </ul>
    <p v-if="!entries.length" class="py-section text-muted">没有匹配的条目。可以换一个名称或编号。</p>
    <p class="mt-stack text-caption text-muted leading-copy">当前已收录六位皇族的完整人物条目、禁制机制与公共工程历史，以及1747年选举相关制度。更多主题将随来源资料的整理逐步收录。</p>
  </main>
</template>
