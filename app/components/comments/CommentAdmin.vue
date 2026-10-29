<script setup lang="ts">
import { z } from 'zod'
import type { CommentSectionInfo } from '#shared/comment'
import CommentSettings from './CommentSettings.vue'
const account = useAccount(), sections = ref<CommentSectionInfo[]>([]), loading = ref(false), error = ref(''), page = ref(1), total = ref(0)
const open = ref(false), saving = ref(false), form = reactive({ title: '' }), createError = ref('')
const schema = z.object({ title: z.string().trim().min(1, '请填写评论区名称。').max(100, '名称最多100个字符。') })
let version = 0
async function load() {
  if (!account.isAdmin.value) return
  const current = ++version
  loading.value = true; error.value = ''
  try {
    const result = await (await account.client()).from('comment_sections').select('*,article:comment_articles(*)', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range((page.value - 1) * 20, page.value * 20 - 1)
    if (current !== version) return
    if (result.error) throw result.error
    sections.value = result.data as CommentSectionInfo[]; total.value = result.count ?? 0
  } catch { if (current === version) error.value = '评论区列表读取失败，请重试。' }
  finally { if (current === version) loading.value = false }
}
async function create() {
  saving.value = true; createError.value = ''
  try {
    const result = await (await account.client()).from('comment_sections').insert({ title: form.title.trim() }).select('id').single()
    if (result.error) throw result.error
    open.value = false; form.title = ''; page.value = 1; await load()
  } catch { createError.value = '创建失败，请检查管理员权限后重试。' }
  finally { saving.value = false }
}
watch([account.isAdmin, page], load, { immediate: true })
onBeforeUnmount(() => { version++ })
</script>
<template>
  <div class="space-y-stack">
    <div class="flex flex-wrap items-center justify-between gap-inline"><p class="text-copy text-muted">共 {{ total }} 个评论区</p><div class="flex gap-inline"><UButton variant="outline" color="neutral" :loading="loading" @click="load">刷新评论区</UButton><UButton @click="open = true; createError = ''">创建独立评论区</UButton></div></div>
    <UAlert v-if="error" :title="error" color="error" />
    <p v-if="!sections.length && !loading" class="text-muted">暂无评论区。</p>
    <div v-for="section in sections" :key="section.id" class="space-y-4 rounded-lg border border-default p-4 sm:p-6">
      <div class="flex flex-wrap justify-between gap-inline"><h2 class="text-body font-semibold text-highlighted">{{ section.title }}</h2><UButton :to="`/comments?id=${section.id}`" variant="outline">查看评论区</UButton></div>
      <dl class="space-y-2 text-caption"><div><dt class="text-muted">评论区 ID</dt><dd class="break-all font-mono">{{ section.id }}</dd></div><div><dt class="text-muted">关联文章</dt><dd v-if="section.article"><NuxtLink :to="section.article.path" class="text-primary underline">{{ section.article.title }}</NuxtLink><span class="ml-2 break-all text-muted">{{ section.article.article_uid }}</span></dd><dd v-else>独立评论区</dd></div></dl>
      <CommentSettings :section="section" @changed="load" />
    </div>
    <UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" :sibling-count="1" />
    <UModal v-model:open="open" title="创建独立评论区" description="无需关联文章，创建后可通过独立链接或评论组件使用。">
      <template #body><UForm :schema="schema" :state="form" class="space-y-4" @submit="create"><UFormField name="title" label="评论区名称" required><UInput v-model="form.title" :maxlength="100" class="w-full" /></UFormField><UAlert v-if="createError" :title="createError" color="error" /><div class="flex gap-inline"><UButton type="submit" :loading="saving">创建评论区</UButton><UButton color="neutral" variant="ghost" :disabled="saving" @click="open = false">取消</UButton></div></UForm></template>
    </UModal>
  </div>
</template>
