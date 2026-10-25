<script setup lang="ts">
import catalog from '../../../../.generated/catalog.json'
const route = useRoute()
const category = computed(() => String(route.params.category))
if (!catalog.some(entry => entry.category === category.value)) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
useSeoMeta({ title: () => category.value, description: () => `浏览“${category.value}”主题下的已收录条目。` })
</script>
<template><WikiDirectory :category="category" /></template>
