<script setup lang="ts">
import { FORUM_PAGE_SIZE, forumPagePath } from '#shared/forum'

const props = defineProps<{ routeKey: string, page: number, total: number, onlyAuthor: boolean, position: string }>()
</script>

<template>
  <UPagination
    as="nav"
    :aria-label="`${position}楼层分页`"
    :page="props.page"
    :total="total"
    :items-per-page="FORUM_PAGE_SIZE"
    :sibling-count="1"
    :to="page => forumPagePath(routeKey, page, onlyAuthor)"
    size="md"
    :ui="{ list: 'flex-wrap gap-2', first: 'hidden sm:inline-flex', last: 'hidden sm:inline-flex' }"
  />
</template>
