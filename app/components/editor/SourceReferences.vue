<script setup lang="ts">
import type { EditorCatalogue } from '#shared/editor'
type SourceRef = { path: string; anchor: string; role: 'primary' | 'supporting' }
const refs = defineModel<SourceRef[]>({ required: true })
defineProps<{ catalogue: EditorCatalogue; label?: string }>()
</script>
<template>
  <div class="min-w-0 space-y-3">
    <fieldset v-for="(item, i) in refs" :key="i" class="grid min-w-0 grid-cols-1 gap-3 rounded-card border border-default p-4 sm:grid-cols-2">
      <legend class="px-2 text-caption text-muted">{{ label || '来源' }} {{ i + 1 }}</legend>
      <UFormField :label="`${label || '来源'}${i + 1}文件`" class="sm:col-span-2"><USelectMenu v-model="item.path" :items="catalogue.sources.map(s => ({ label: s.title + ' · ' + s.path, value: s.path }))" value-key="value" placeholder="搜索来源文件" class="w-full" @update:model-value="item.anchor = ''" /></UFormField>
      <UFormField :label="`${label || '来源'}${i + 1}锚点`"><USelectMenu v-model="item.anchor" :items="catalogue.sources.find(s => s.path === item.path)?.anchors || []" placeholder="选择原文段落" class="w-full" /></UFormField>
      <UFormField :label="`${label || '来源'}${i + 1}作用`"><USelect v-model="item.role" :items="[{ label: '主要依据', value: 'primary' }, { label: '补充依据', value: 'supporting' }]" class="w-full" /></UFormField>
      <div><UButton color="neutral" variant="ghost" :aria-label="`移除${label || '来源'}${i + 1}`" @click="refs.splice(i, 1)">移除来源</UButton></div>
    </fieldset>
    <UButton color="neutral" variant="outline" icon="i-lucide-plus" @click="refs.push({ path: '', anchor: '', role: 'primary' })">添加{{ label || '来源' }}</UButton>
  </div>
</template>
