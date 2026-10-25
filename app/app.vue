<script setup lang="ts">
import { zh_cn } from '@nuxt/ui/locale'
</script>

<template>
  <UApp :locale="zh_cn">
    <a class="skip-link" href="#main">跳到正文</a>
    <SiteHeader />
    <NuxtPage />
    <SiteFooter />
  </UApp>
</template>
