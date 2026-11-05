<script setup lang="ts">
import { privateKinds, privateSummaryColumns, type PrivateDocumentSummary } from '#shared/private-content'
import { privateReadingPath } from '~/utils/private-content'
import AgeRatingBadge from './AgeRatingBadge.vue'
const props = defineProps<{ manage?: boolean }>()
const { account, canSubmit } = usePrivateContent(), route = useRoute()
const rows = shallowRef<PrivateDocumentSummary[]>([]), page = ref(1), total = ref(0), loading = ref(false), error = ref('')
const kind = ref(typeof route.query.kind === 'string' && route.query.kind in privateKinds ? route.query.kind : 'all')
let request = 0, controller: AbortController | undefined
async function load() {
  const current = ++request
  controller?.abort(); rows.value = []; total.value = 0; error.value = ''; loading.value = false
  if (!account.user.value || !account.ready.value) return
  const signal = (controller = new AbortController()).signal
  loading.value = true
  try {
    let query = (await account.client()).from('private_documents').select(privateSummaryColumns, { count: 'exact' })
    if (kind.value !== 'all') query = query.eq('kind', kind.value)
    if (props.manage && !account.isAdmin.value) query = query.eq('created_by', account.user.value.id)
    const { data, count, error: failure } = await query.order('created_at', { ascending: false }).order('id').range((page.value - 1) * 20, page.value * 20 - 1).abortSignal(signal)
    if (current !== request) return
    if (failure) throw failure
    rows.value = data as PrivateDocumentSummary[]; total.value = count || 0
    if (page.value > Math.max(1, Math.ceil(total.value / 20))) page.value = Math.max(1, Math.ceil(total.value / 20))
  } catch { if (current === request) error.value = '内容列表读取失败，请重试。' }
  finally { if (current === request) loading.value = false }
}
watch(kind, () => { page.value = 1 })
watch([() => account.user.value?.id, account.ready, account.isAdmin, page, kind], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { request++; controller?.abort(); rows.value = [] })
</script>
<template>
  <div class="space-y-stack">
    <UPageCard v-if="!account.user.value" title="登录后查看可阅读内容"><UButton :to="{ path: '/account/login', query: { returnTo: route.fullPath } }">前往登录</UButton></UPageCard>
    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-inline"><UFormField label="内容类型"><USelect v-model="kind" :items="[{ label: '全部类型', value: 'all' }, ...Object.entries(privateKinds).map(([value, label]) => ({ value, label }))]" /></UFormField><div class="flex gap-2"><UButton color="neutral" variant="outline" :loading="loading" @click="load">刷新列表</UButton><UButton v-if="canSubmit" to="/account/submissions/edit" icon="i-lucide-plus">新投稿</UButton></div></div>
      <UAlert v-if="error" :title="error" color="error" />
      <p v-else-if="loading" role="status" class="py-stack text-muted">正在读取内容列表…</p>
      <UEmpty v-else-if="!rows.length" icon="i-lucide-book-open" title="暂无可显示的内容" :description="manage ? '有投稿权限后，可以创建并保存第一篇内容。' : '获得阅读权限的文章和帖子会显示在这里。'" />
      <ul v-else class="space-y-4">
        <li v-for="item in rows" :key="item.id" class="rounded-card border border-default bg-raised p-panel">
          <div class="mb-3 flex flex-wrap gap-2"><UBadge variant="soft">{{ privateKinds[item.kind] }}</UBadge><AgeRatingBadge :rating="item.age_rating" /><UBadge color="neutral" variant="subtle">{{ item.status === 'draft' ? '草稿' : '已发布' }}</UBadge><span v-if="item.category" class="text-caption text-muted">{{ item.category }}</span></div>
          <h2 class="font-serif text-card leading-heading text-highlighted"><NuxtLink :to="privateReadingPath(item.id)" class="hover:text-primary hover:underline">{{ item.title }}</NuxtLink></h2>
          <p v-if="item.description && (item.age_rating === 'general' || account.profile.value?.show_sensitive_content)" class="mt-3 text-muted leading-copy whitespace-pre-line">{{ item.description }}</p>
          <p v-if="item.author_name" class="mt-3 text-caption text-muted">{{ item.author_name }}</p>
          <div v-if="manage && (account.isAdmin.value || (canSubmit && item.status === 'draft' && item.created_by === account.user.value?.id))" class="mt-4"><UButton :to="{ path: '/account/submissions/edit', query: { id: item.id } }" color="neutral" variant="outline" icon="i-lucide-pencil">{{ account.isAdmin.value ? '编辑与权限' : '编辑草稿' }}</UButton></div>
        </li>
      </ul>
      <UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" :sibling-count="1" />
    </template>
  </div>
</template>
