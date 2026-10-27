<script setup lang="ts">
import forum from '../../../.generated/forum.json'

const boards = [...new Map(forum.map(thread => [JSON.stringify([thread.community, thread.board]), { community: thread.community, title: thread.board }])).values()]
const posts = forum.reduce((sum, thread) => sum + thread.postCount, 0)
useSeoMeta({ title: '世界内论坛', description: '读一场世界内的讨论：历史、日常、书单与同人脑洞，按楼层慢慢展开。' })
</script>

<template>
  <main id="main" class="shell py-page-block">
    <header class="forum-heading mb-layout">
      <div>
        <p class="eyebrow mb-3">CONVERSATIONS IN HETWILA</p>
        <h1 class="section-title">世界内论坛</h1>
        <p class="mt-4 text-muted text-copy leading-copy">从一句闲聊开始，听听生活在这个世界里的人们。</p>
      </div>
      <div class="flex gap-stack text-caption text-muted">
        <p><strong class="block text-card text-highlighted tabular-nums">{{ forum.length }}</strong>收录主题</p>
        <p><strong class="block text-card text-highlighted tabular-nums">{{ posts }}</strong>楼层发言</p>
      </div>
    </header>

    <section v-for="(board, index) in boards" :key="`${board.community}/${board.title}`" class="forum-board mb-stack" :aria-labelledby="`board-${index}`">
      <header class="flex items-center gap-inline border-b border-default bg-tint p-panel">
        <UIcon name="i-lucide-messages-square" class="size-8 shrink-0 text-primary" />
        <div><p class="text-caption text-muted mb-1">{{ board.community }}</p><h2 :id="`board-${index}`" class="text-xl font-semibold text-highlighted">{{ board.title }}</h2></div>
      </header>
      <div class="forum-topic-row text-caption text-muted bg-muted border-b border-default" aria-hidden="true">
        <span>讨论主题</span><span class="hidden md:block">回复 / 参与</span><span class="hidden md:block">最后回复</span>
      </div>
      <ul>
        <li v-for="thread in forum.filter(item => item.community === board.community && item.board === board.title)" :key="thread.uid" class="forum-topic-row">
          <div class="min-w-0">
            <UBadge color="neutral" variant="subtle" size="sm" class="mb-3">{{ thread.category }}</UBadge>
            <h3 class="text-lg font-semibold leading-heading text-highlighted"><NuxtLink :to="thread.path" class="hover:text-primary hover:underline">{{ thread.title }}</NuxtLink></h3>
            <p class="mt-3 text-caption text-muted">{{ thread.author }} 发起</p>
            <p class="mt-3 text-detail text-muted leading-copy">{{ thread.description }}</p>
          </div>
          <div class="flex md:block gap-inline text-caption text-muted">
            <p><strong class="text-default tabular-nums font-medium">{{ thread.replyCount }}</strong> 回复</p>
            <p class="md:mt-2"><span class="tabular-nums">{{ thread.participantCount }}</span> 位参与者</p>
          </div>
          <div class="text-caption text-muted">
            <NuxtLink :to="thread.lastPost.path" class="inline-flex items-center gap-2 text-primary underline">第 {{ thread.lastPost.floor }} 楼 <UIcon name="i-lucide-arrow-up-right" /></NuxtLink>
            <p class="mt-2">{{ thread.lastPost.author }}</p>
          </div>
        </li>
      </ul>
    </section>
    <UEmpty v-if="!forum.length" icon="i-lucide-messages-square" title="还没有收录主题" description="新的讨论将在这里出现。" />
    <p class="mt-stack text-caption text-muted leading-copy">这里收录的是世界内论坛作品。昵称与发言属于作品中的讨论；目前开放阅读。</p>
  </main>
</template>
