<script setup lang="ts">
import { toString } from 'mdast-util-to-string'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { FORUM_PAGE_SIZE, forumFanfictionAnchor, type ForumFanfictionEntry } from '#shared/forum'
import { parseForumBody } from '#shared/forum-body'
import { privateForumPath, type PrivateDocument } from '#shared/private-content'
import { renderReadingMarkdown } from '#shared/comment-markdown'
import ForumFanfiction from '~/components/content/ForumFanfiction.vue'
import ReadingMarkdown from './ReadingMarkdown.vue'
import AgeRatingBadge from './AgeRatingBadge.vue'
const props = defineProps<{ document: PrivateDocument; basePath: string; preview?: boolean }>()
const route = useRoute()
const page = computed(() => props.preview ? 1 : Number(route.query.page || 1))
const onlyAuthor = computed(() => !props.preview && route.query.author === '1')
const all = computed(() => props.document.forum_posts.map(post => {
  try { return { ...post, blocks: parseForumBody(post.body).blocks } }
  catch { return { ...post, blocks: [{ type: 'markdown' as const, bodyMarkdown: post.body }] } }
}))
const filtered = computed(() => all.value.filter(post => !onlyAuthor.value || post.isOriginalPoster))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / FORUM_PAGE_SIZE)))
const validPage = computed(() => Number.isSafeInteger(page.value) && page.value >= 1 && page.value <= pages.value)
const posts = computed(() => validPage.value ? filtered.value.slice((page.value - 1) * FORUM_PAGE_SIZE, page.value * FORUM_PAGE_SIZE) : [])
const path = (p = 1, author = false, floor?: number) => privateForumPath(props.basePath, p, author, floor)
const floorPath = (floor: number) => floor > 0 && floor <= all.value.length ? path(Math.ceil(floor / FORUM_PAGE_SIZE), false, floor) : undefined
const fiction = computed(() => all.value.flatMap(post => post.blocks.flatMap(block => block.type === 'fanfiction' ? [{ title: block.title, floor: post.floor, anchor: forumFanfictionAnchor(post.floor, block.key), path: `${path(Math.ceil(post.floor / FORUM_PAGE_SIZE))}#${forumFanfictionAnchor(post.floor, block.key)}` }] : [])))
function fictionProps(floor: number, key: string, body: string) {
  const anchor = forumFanfictionAnchor(floor, key)
  const index = fiction.value.findIndex(item => item.anchor === anchor)
  const entry = fiction.value[index] as ForumFanfictionEntry
  const { headings } = renderReadingMarkdown(body, { prefix: `${anchor}-section`, minimumHeading: 4, skipTitle: true })
  return { ...entry, previous: fiction.value[index - 1], next: fiction.value[index + 1], characterCount: Array.from(toString(unified().use(remarkParse).parse(body)).replace(/\s/gu, '')).length, sections: headings.map(h => ({ title: h.text, anchor: h.id, depth: h.depth })) }
}
const jumpFloor = ref('')
async function jump() { const floor = Number(jumpFloor.value); if (Number.isInteger(floor) && floorPath(floor)) await navigateTo(floorPath(floor)!) }
</script>
<template>
  <div>
    <header class="forum-thread-heading rounded-card border border-default bg-raised p-panel">
      <div class="mb-4 flex flex-wrap items-center gap-inline"><UBadge v-if="document.category" variant="soft">{{ document.category }}</UBadge><UBadge color="neutral" variant="subtle" icon="i-lucide-lock-keyhole">私有</UBadge><AgeRatingBadge :rating="document.age_rating" /><span v-if="document.status === 'draft'" class="text-caption text-muted">草稿</span></div>
      <h1 class="font-semibold text-section leading-heading text-highlighted">{{ document.title }}</h1>
      <p v-if="document.description" class="mt-4 text-detail leading-copy text-muted">{{ document.description }}</p>
      <p class="mt-5 flex flex-wrap gap-inline text-caption text-muted"><span>{{ all[0]?.author }} 发起</span><span>{{ Math.max(0, all.length - 1) }} 条回复</span><span>{{ new Set(all.map(post => post.author)).size }} 位参与者</span></p>
    </header>
    <details v-if="fiction.length" class="forum-fiction-directory mt-stack rounded-card border border-default bg-raised p-forum-post" open>
      <summary class="cursor-pointer text-detail font-medium text-highlighted">同人文目录 <span class="ml-2 text-caption text-muted">{{ fiction.length }} 篇</span></summary>
      <nav aria-label="同人文目录" class="mt-4"><ol class="grid gap-2 sm:grid-cols-2"><li v-for="entry in fiction" :key="entry.anchor"><UButton :to="entry.path" variant="ghost" color="neutral" icon="i-lucide-book-open" class="min-h-control w-full justify-start" :ui="{ label: 'whitespace-normal text-left' }">{{ entry.title }} · {{ entry.floor }}L</UButton></li></ol></nav>
    </details>
    <div v-if="!preview" class="my-stack flex flex-wrap items-center justify-between gap-grid">
      <div class="flex gap-2" role="group" aria-label="阅读范围"><UButton :to="path()" :variant="onlyAuthor ? 'outline' : 'soft'" :aria-current="!onlyAuthor ? 'true' : undefined">全部楼层</UButton><UButton :to="path(1, true)" :variant="onlyAuthor ? 'soft' : 'outline'" :aria-current="onlyAuthor ? 'true' : undefined">只看楼主</UButton></div>
      <form class="flex items-center gap-2" @submit.prevent="jump"><label for="private-jump-floor" class="text-caption text-muted">楼层</label><UInput id="private-jump-floor" v-model="jumpFloor" type="number" min="1" :max="all.length" step="1" required class="w-24" /><UButton type="submit" variant="outline" color="neutral">转到</UButton></form>
    </div>
    <div v-if="!preview" class="mb-stack flex flex-wrap items-center justify-between gap-inline"><p class="text-caption text-muted" aria-live="polite">第 {{ page }} / {{ pages }} 页 · {{ onlyAuthor ? '楼主发言' : '全部楼层' }}</p><UPagination v-if="pages > 1" :page="page" :total="filtered.length" :items-per-page="FORUM_PAGE_SIZE" :to="p => path(p, onlyAuthor)" :sibling-count="1" /></div>
    <UAlert v-if="!validPage" title="这个页码没有楼层。" color="neutral"><template #actions><UButton :to="path()">回到第一页</UButton></template></UAlert>
    <div v-else class="forum-posts" :class="{ 'mt-stack': preview }">
      <article v-for="post in posts" :id="`post-${post.floor}`" :key="post.floor" class="forum-post" :aria-labelledby="`post-${post.floor}-author`">
        <header class="forum-post-author"><UAvatar :text="Array.from(post.author)[0]" size="3xl" :color="post.isOriginalPoster ? 'primary' : 'neutral'" aria-hidden="true" /><div class="min-w-0"><h2 :id="`post-${post.floor}-author`" class="font-semibold text-detail leading-copy text-highlighted">{{ post.author }}<span class="sr-only">，第 {{ post.floor }} 楼</span></h2><UBadge v-if="post.isOriginalPoster" size="sm" variant="soft" class="mt-2">楼主</UBadge></div><NuxtLink :to="floorPath(post.floor)" :aria-label="`第 ${post.floor} 楼永久链接`" class="forum-floor-link font-mono text-caption text-muted hover:text-primary hover:underline">{{ post.floor }}L <UIcon name="i-lucide-link" class="size-3" /></NuxtLink></header>
        <div class="forum-post-content"><div class="article-prose forum-prose">
          <template v-for="(block, index) in post.blocks" :key="index">
            <ReadingMarkdown v-if="block.type === 'markdown'" :source="block.bodyMarkdown" :options="{ prefix: `post-${post.floor}-part-${index}`, minimumHeading: 3, floorLink: floorPath }" />
            <ForumFanfiction v-else v-bind="fictionProps(post.floor, block.key, block.bodyMarkdown)"><ReadingMarkdown :source="block.bodyMarkdown" :options="{ prefix: `${forumFanfictionAnchor(post.floor, block.key)}-section`, minimumHeading: 4, skipTitle: true }" /></ForumFanfiction>
          </template>
        </div></div>
      </article>
    </div>
    <nav v-if="!preview && pages > 1" aria-label="底部分页" class="mt-stack flex justify-end"><UPagination :page="page" :total="filtered.length" :items-per-page="FORUM_PAGE_SIZE" :to="p => path(p, onlyAuthor)" :sibling-count="1" /></nav>
  </div>
</template>
