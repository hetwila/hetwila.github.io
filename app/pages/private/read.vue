<script setup lang="ts">
import PrivateContentPage from '~/components/private/PrivateContentPage.vue'
const route = useRoute()
</script>
<template><PrivateContentPage :id="String(route.query.id || '')" /></template>
