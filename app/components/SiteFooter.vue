<template>
  <UFooter class="site-footer" :ui="{ container: 'py-6 lg:py-8 gap-5', left: 'gap-3', right: 'gap-4' }">
    <template #left><span class="footer-mark">H</span><span class="text-xs text-muted">赫特维拉 · 世界观档案</span></template>
    <p class="text-xs text-muted">设定 3.0.3 ／ 初版试读</p>
    <template #right>
      <nav aria-label="资源链接" class="flex gap-5 text-xs text-muted">
        <a href="/llms.txt" class="inline-flex items-center gap-1 hover:text-primary">机器阅读入口 <UIcon name="i-lucide-arrow-up-right" /></a>
        <a href="/data/v1/manifest.json" class="inline-flex items-center gap-1 hover:text-primary">数据清单 <UIcon name="i-lucide-arrow-up-right" /></a>
      </nav>
    </template>
  </UFooter>
</template>
