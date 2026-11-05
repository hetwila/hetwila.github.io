<script setup lang="ts">
import { ageRatings, type AgeRating } from '#shared/private-content'
defineProps<{ rating: AgeRating }>()
</script>
<template>
  <UBadge :color="rating === 'r18' ? 'warning' : 'neutral'" variant="soft" :aria-label="`年龄分级：${ageRatings[rating]}`">{{ ageRatings[rating] }}</UBadge>
</template>
