<script setup lang="ts">
defineProps<{ error: { statusCode?: number } }>()
</script>
<template>
  <UApp><main class="error-page"><p class="eyebrow">HETWILA ARCHIVE · {{ error.statusCode || 500 }}</p><h1>{{ error.statusCode === 404 ? '这一页尚未收录' : '页面暂时无法打开' }}</h1><p>回到阅读入口，继续寻找世界中的线索。</p><UButton to="/" icon="i-lucide-arrow-left">返回首页</UButton></main></UApp>
</template>
