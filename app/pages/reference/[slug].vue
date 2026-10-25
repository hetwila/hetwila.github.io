<script setup lang="ts">
import references from '../../../.generated/references.json'
import catalog from '../../../.generated/catalog.json'
const route = useRoute()
const source = computed(() => references.find(item => item.path === `/reference/${String(route.params.slug)}`))
if (!source.value) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
const { data: article } = await useAsyncData(() => `reference-${source.value?.sourcePath}`, () => queryCollection('reference').path(source.value!.path).first())
if (!article.value) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
const entries = computed(() => catalog.filter(entry => entry.sourceRefs.some(ref => ref.path === source.value?.sourcePath)))
useSeoMeta({ title: () => source.value?.title, description: () => source.value?.description })
useHead(() => ({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${source.value!.path}` }] }))
</script>
<template>
  <main v-if="article && source" id="main" class="shell py-section">
    <div class="max-w-reading mx-auto">
      <UButton to="/reference" color="neutral" variant="link" icon="i-lucide-arrow-left" class="p-0 mb-stack">来源资料</UButton>
      <p class="eyebrow">SOURCE TEXT / 3.0.3</p>
      <h1 class="font-serif text-title text-highlighted my-stack">{{ source.title }}</h1>
      <p class="text-caption text-muted break-all">{{ source.sourcePath }}</p>
      <p class="my-4 text-caption text-muted leading-copy">来源全文按原结构呈现。未收录的原文引用显示为路径坐标；下载文件保留附件中的原始字节。</p>
      <UButton :to="source.markdownUrl" external variant="outline" icon="i-lucide-file-down">读取原始 Markdown</UButton>
      <UContentToc :links="article.body.toc?.links" title="原文目录" class="my-stack" />
      <ContentRenderer :value="article" class="article-prose source-prose" />
      <section class="mt-section" aria-labelledby="source-entries">
        <h2 id="source-entries" class="section-title mb-stack">由此整理的百科条目</h2>
        <ul class="space-y-3"><li v-for="entry in entries" :key="entry.uid"><NuxtLink :to="entry.path" class="text-primary underline decoration-primary/40 hover:decoration-primary">{{ entry.title }}</NuxtLink></li></ul>
      </section>
      <details class="mt-stack text-caption text-muted"><summary class="cursor-pointer">来源校验值（SHA-256）</summary><p class="mt-3 break-all font-mono">{{ source.sha256 }}</p></details>
    </div>
  </main>
</template>
