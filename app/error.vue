<script setup lang="ts">
import { zh_cn } from '@nuxt/ui/locale'
defineProps<{ error: { statusCode?: number } }>()
</script>
<template>
  <UApp :locale="zh_cn">
    <main id="main" class="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <ArchiveMark />
      <p class="eyebrow">HETWILA ARCHIVE · {{ error.statusCode || 500 }}</p>
      <h1 class="section-title">{{ error.statusCode === 404 ? '这一页尚未收录' : '页面暂时无法打开' }}</h1>
      <p class="text-sm leading-7 text-muted">回到阅读入口，继续寻找世界中的线索。</p>
      <UButton to="/" icon="i-lucide-arrow-left">返回首页</UButton>
      <UColorModeSelect aria-label="显示主题" color="neutral" variant="ghost" />
    </main>
  </UApp>
</template>
