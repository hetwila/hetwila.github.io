<script setup lang="ts">
const searchOpen = ref(false)
const route = useRoute()
onMounted(() => window.addEventListener('keydown', onShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
function onShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchOpen.value = !searchOpen.value
  }
}
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <NuxtLink to="/" class="brand" aria-label="赫特维拉首页">
        <img src="/favicon.svg" alt="" width="38" height="38">
        <span><strong>赫特维拉</strong><small>HETWILA ARCHIVE</small></span>
      </NuxtLink>
      <nav class="main-nav" aria-label="主导航">
        <NuxtLink to="/" :class="{ active: route.path === '/' }">开始阅读</NuxtLink>
        <NuxtLink to="/#entries" :class="{ active: route.path.startsWith('/wiki') }">设定百科</NuxtLink>
        <NuxtLink to="/wiki/h31-01">历史片段</NuxtLink>
      </nav>
      <div class="header-actions">
        <button class="search-trigger" aria-label="搜索设定" @click="searchOpen = true">
          <UIcon name="i-lucide-search" />
          <span>搜索设定</span><kbd>⌘ K</kbd>
        </button>
        <span class="version-pill">v3.0.3</span>
      </div>
    </div>
    <SearchDialog v-model:open="searchOpen" />
  </header>
</template>
