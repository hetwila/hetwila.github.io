<script setup lang="ts">
import references from '../../../.generated/references.json'
useSeoMeta({ title: '来源资料', description: '核对已收录设定的责任原文、稳定锚点及来源版本。' })
</script>
<template>
  <main id="main" class="shell py-section">
    <p class="eyebrow mb-3">SOURCE LIBRARY / 3.0.3</p>
    <h1 class="section-title">回到原文，核对每一处依据</h1>
    <p class="my-stack max-w-reading text-muted leading-copy">这里提供已用于整理百科的两份来源全文。原资料中的编号与锚点保留；指向尚未收录材料的引用显示原路径，便于继续查阅完整设定集。</p>
    <UPageGrid class="sm:grid-cols-2 xl:grid-cols-2 gap-grid">
      <UPageCard v-for="source in references" :key="source.sourcePath" :title="source.title" :description="source.description" :to="source.path" :aria-label="source.title">
        <template #title><h2>{{ source.title }}</h2></template>
        <template #footer><span class="text-caption text-muted">{{ source.anchors.length }} 个原始锚点 · 设定 3.0.3</span></template>
      </UPageCard>
    </UPageGrid>
    <p class="mt-stack text-caption text-muted">当前公开原文 2 / 216 份，尚未覆盖完整设定与创作规则。百科条目由来源重组，原文保留完整上下文。</p>
  </main>
</template>
