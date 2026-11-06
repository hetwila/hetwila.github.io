<script setup lang="ts">
import Workspace from '~/components/editor/Workspace.client.vue'
useSeoMeta({ title: '文章与帖子编辑器', robots: 'noindex, nofollow, noarchive' })
</script>
<template>
  <main id="main" class="shell py-page-block" data-pagefind-ignore="all">
    <header class="mb-stack"><p class="eyebrow mb-3">HETWILA WRITING DESK</p><h1 class="section-title">文章与帖子编辑器</h1><p class="mt-4 text-muted leading-copy">撰写百科、故事和论坛帖子，生成可下载的 Markdown。草稿自动保存在当前浏览器，管理员可另存云端快照。</p></header>
    <ClientOnly><Workspace /><template #fallback><p role="status" class="py-stack text-muted">请启用 JavaScript 使用编辑器。本机草稿只会在你的浏览器中恢复。</p></template></ClientOnly>
  </main>
</template>
