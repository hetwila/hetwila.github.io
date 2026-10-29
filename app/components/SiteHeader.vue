<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const searchOpen = ref(false)
const route = useRoute()
const items = computed<NavigationMenuItem[]>(() => [
  { label: '开始阅读', to: '/', active: route.path === '/' && !route.hash },
  { label: '设定百科', to: '/wiki', active: route.path.startsWith('/wiki') },
  { label: '故事书架', to: '/stories', active: route.path.startsWith('/stories') },
  { label: '世界内论坛', to: '/forum', active: route.path.startsWith('/forum') },
  { label: '年代', to: '/timeline', active: route.path === '/timeline' },
])
defineShortcuts({ meta_k: () => { searchOpen.value = !searchOpen.value } })
</script>

<template>
  <UHeader class="site-header" :menu="{ description: '阅读设定百科、故事、论坛与年代事件。' }">
    <template #left>
      <NuxtLink to="/" class="brand" aria-label="赫特维拉 HETWILA ARCHIVE 首页">
        <ArchiveMark />
        <span><strong>赫特维拉</strong><small>HETWILA ARCHIVE</small></span>
      </NuxtLink>
    </template>

    <UNavigationMenu :items="items" variant="link" aria-label="主导航" />

    <template #right>
      <UButton color="neutral" variant="ghost" icon="i-lucide-search" aria-label="搜索设定" class="min-h-control min-w-control justify-center" @click="searchOpen = true">
        <span class="hidden xl:inline">搜索设定</span>
        <template #trailing><UKbd value="meta" class="hidden xl:inline-flex" /><UKbd value="k" class="hidden xl:inline-flex" /></template>
      </UButton>
      <UButton :to="{ path:'/account',query:route.path.startsWith('/account') ? {} : {returnTo:route.fullPath} }" color="neutral" variant="ghost" icon="i-lucide-user-round" aria-label="用户中心" class="hidden sm:inline-flex min-h-control min-w-control justify-center" />
      <UColorModeSelect aria-label="显示主题" color="neutral" variant="ghost" class="w-control sm:w-28 min-h-control" :content="{ align: 'end' }" :ui="{ value: 'hidden sm:block', trailing: 'hidden sm:flex', content: 'min-w-36' }" />
    </template>

    <template #body>
      <UNavigationMenu :items="[...items, { label:'用户中心',to:{path:'/account',query:route.path.startsWith('/account') ? {} : {returnTo:route.fullPath}} }]" orientation="vertical" aria-label="移动导航" />
      <p class="mt-8 border-t border-default pt-5 text-caption leading-prose text-muted">设定 3.0.3 · 世界观档案<br>从一个概念，走进赫特维拉。</p>
    </template>
  </UHeader>
  <SearchDialog v-model:open="searchOpen" />
</template>
