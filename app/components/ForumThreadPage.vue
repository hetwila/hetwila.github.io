<script setup lang="ts">
import forum from '../../.generated/forum.json'
import { FORUM_PAGE_SIZE, forumPagePath, forumPostPath } from '#shared/forum'

const props = defineProps<{ onlyAuthor?: boolean }>()
const route = useRoute()
const thread = forum.find(item => item.routeKey === route.params.slug)
const page = Number(route.params.page)
if (!thread || !/^[1-9]\d*$/.test(String(route.params.page)) || !Number.isSafeInteger(page)
  || page > (props.onlyAuthor ? thread.authorPageCount : thread.pageCount)) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到论坛主题或页码' })
}
const currentPath = forumPagePath(thread.routeKey, page, props.onlyAuthor)
const { data: posts } = await useAsyncData(`forum-${thread.uid}-${Boolean(props.onlyAuthor)}-${page}`, () => {
  const query = queryCollection('forumPosts').where('threadUid', '=', thread.uid)
  if (props.onlyAuthor) query.where('isOriginalPoster', '=', true)
  return query.order('floor', 'ASC').skip((page - 1) * FORUM_PAGE_SIZE).limit(FORUM_PAGE_SIZE).all()
})
if (!posts.value?.length) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '未找到楼层' })
const jumpFloor = ref('')
async function jump() {
  const floor = Number(jumpFloor.value)
  if (Number.isInteger(floor) && floor > 0 && floor <= thread!.postCount) await navigateTo(forumPostPath(thread!.routeKey, floor))
}
const breadcrumbs = [
  { label: '世界内论坛', to: '/forum' },
  { label: thread.community },
  { label: thread.board },
  { label: thread.category },
]
const total = props.onlyAuthor ? thread.authorPostCount : thread.postCount
useSeoMeta({
  title: `${thread.title} · ${props.onlyAuthor ? '只看楼主 · ' : ''}第 ${page} 页`,
  description: thread.description,
  robots: props.onlyAuthor ? 'noindex, follow' : 'index, follow',
})
useHead({ link: [{ rel: 'canonical', href: `https://hetwila.github.io${currentPath}` }] })
</script>

<template>
  <main id="main" class="shell py-page-block" :data-pagefind-ignore="onlyAuthor ? 'all' : undefined">
    <UBreadcrumb :items="breadcrumbs" class="mb-stack" :ui="{ list: 'flex-wrap', link: 'whitespace-normal text-caption', item: 'min-w-0' }" />
    <header class="forum-thread-heading rounded-card border border-default bg-raised p-panel">
      <div class="flex flex-wrap gap-inline items-center mb-4"><UBadge variant="soft">{{ thread.category }}</UBadge><span class="text-caption text-muted">世界内论坛 · 收录主题</span></div>
      <h1 class="font-semibold text-section leading-heading text-highlighted" data-pagefind-meta="title">{{ thread.title }}</h1>
      <p v-if="thread.fanfiction.length" class="mt-4 text-detail leading-copy text-muted">{{ thread.description }}</p>
      <p class="mt-5 flex flex-wrap gap-inline text-caption text-muted"><span>{{ thread.author }} 发起</span><span>{{ thread.replyCount }} 条回复</span><span>{{ thread.participantCount }} 位参与者</span></p>
    </header>

    <details v-if="thread.fanfiction.length" class="forum-fiction-directory mt-stack rounded-card border border-default bg-raised p-forum-post" open data-pagefind-ignore>
      <summary class="cursor-pointer text-detail font-medium text-highlighted">同人文目录 <span class="ml-2 text-caption font-normal text-muted">{{ thread.fanfiction.length }} 篇 · 按楼层顺序</span></summary>
      <nav aria-label="同人文目录" class="mt-4">
        <ol class="grid gap-2 sm:grid-cols-2">
          <li v-for="entry in thread.fanfiction" :key="entry.anchor">
            <UButton :to="entry.path" variant="ghost" color="neutral" icon="i-lucide-book-open" class="min-h-control w-full justify-start" :ui="{ label: 'whitespace-normal text-left' }">{{ entry.title }}<span class="ml-2 text-caption text-muted">{{ entry.floor }}L</span></UButton>
          </li>
        </ol>
      </nav>
    </details>

    <div class="my-stack flex flex-wrap items-center justify-between gap-grid">
      <div class="flex flex-wrap gap-2" role="group" aria-label="阅读范围">
        <UButton :to="forumPagePath(thread.routeKey)" :variant="onlyAuthor ? 'outline' : 'soft'" :color="onlyAuthor ? 'neutral' : 'primary'" :aria-current="!onlyAuthor ? 'true' : undefined" class="min-h-control">全部楼层</UButton>
        <UButton :to="forumPagePath(thread.routeKey, 1, true)" :variant="onlyAuthor ? 'soft' : 'outline'" :color="onlyAuthor ? 'primary' : 'neutral'" :aria-current="onlyAuthor ? 'true' : undefined" class="min-h-control">只看楼主</UButton>
      </div>
      <ClientOnly>
        <form class="flex items-center gap-2" @submit.prevent="jump">
          <label for="jump-floor" class="text-caption text-muted">楼层</label>
          <UInput id="jump-floor" v-model="jumpFloor" type="number" min="1" :max="thread.postCount" step="1" required placeholder="楼层号" class="w-24" :ui="{ base: 'min-h-control' }" />
          <UButton type="submit" variant="outline" color="neutral" class="min-h-control">转到</UButton>
        </form>
      </ClientOnly>
    </div>
    <div class="mb-stack flex flex-wrap justify-between items-center gap-inline">
      <p class="text-caption text-muted" aria-live="polite">第 {{ page }} / {{ onlyAuthor ? thread.authorPageCount : thread.pageCount }} 页 · {{ onlyAuthor ? '楼主发言' : '全部楼层' }} · {{ posts![0]!.floor }}—{{ posts!.at(-1)!.floor }} 楼</p>
      <ForumPagination :route-key="thread.routeKey" :page="page" :total="total" :only-author="Boolean(onlyAuthor)" position="顶部" />
    </div>

    <div class="forum-posts" :data-pagefind-body="!onlyAuthor ? '' : undefined" data-pagefind-filter="类型:论坛">
      <article v-for="post in posts" :id="`post-${post.floor}`" :key="post.uid" class="forum-post" :aria-labelledby="`post-${post.floor}-author`">
        <header class="forum-post-author">
          <UAvatar :text="Array.from(post.author)[0]" size="3xl" :color="post.isOriginalPoster ? 'primary' : 'neutral'" aria-hidden="true" />
          <div class="min-w-0">
            <h2 :id="`post-${post.floor}-author`" class="font-semibold text-detail leading-copy text-highlighted">{{ post.author }}<span class="sr-only">，第 {{ post.floor }} 楼</span></h2>
            <UBadge v-if="post.isOriginalPoster" size="sm" variant="soft" class="mt-2">楼主</UBadge>
          </div>
          <NuxtLink :to="post.path" :aria-label="`第 ${post.floor} 楼永久链接`" class="forum-floor-link font-mono text-caption text-muted hover:text-primary hover:underline" data-pagefind-ignore>{{ post.floor }}L <UIcon name="i-lucide-link" class="size-3" /></NuxtLink>
        </header>
        <div class="forum-post-content"><ContentRenderer :value="post" class="article-prose forum-prose" /></div>
      </article>
    </div>

    <div class="my-stack flex flex-wrap justify-between items-center gap-grid">
      <UButton to="/forum" color="neutral" variant="link" icon="i-lucide-arrow-left" class="p-0 min-h-control">返回主题列表</UButton>
      <ForumPagination :route-key="thread.routeKey" :page="page" :total="total" :only-author="Boolean(onlyAuthor)" position="底部" />
    </div>
    <footer class="border-t border-default pt-stack text-caption leading-copy text-muted">
      <p>本帖为世界内论坛作品，保留原有昵称、楼层与发言。当前仅供阅读。</p>
      <details class="mt-3">
        <summary class="cursor-pointer w-fit">原文与结构化数据</summary>
        <div class="mt-4 flex flex-wrap gap-inline">
          <UButton :to="thread.originalMarkdownUrl" external variant="outline" color="neutral" icon="i-lucide-download">下载原稿</UButton>
          <UButton :to="thread.markdownUrl" external variant="link">完整 Markdown</UButton>
          <UButton :to="thread.jsonUrl" external variant="link">楼层 JSON</UButton>
        </div>
        <p class="mt-3 break-all">原稿 SHA-256：<code>{{ thread.originalSha256 }}</code></p>
      </details>
    </footer>
  </main>
</template>
