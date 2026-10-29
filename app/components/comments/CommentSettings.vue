<script setup lang="ts">
import type { CommentSectionInfo } from '#shared/comment'
const props = defineProps<{ section: CommentSectionInfo }>()
const emit = defineEmits<{ changed: [] }>()
const account = useAccount(), saving = ref(false), error = ref('')
async function change(kind: 'section' | 'article', value: boolean) {
  saving.value = true; error.value = ''
  try {
    const api = await account.client()
    const result = kind === 'section'
      ? await api.from('comment_sections').update({ posting_enabled: value }).eq('id', props.section.id).select('id').single()
      : await api.from('comment_articles').update({ comments_enabled: value }).eq('article_uid', props.section.article!.article_uid).select('article_uid').single()
    if (result.error) throw result.error
    emit('changed')
  } catch { error.value = '设置未保存，请确认管理员权限后重试。' }
  finally { saving.value = false }
}
</script>
<template>
  <div v-if="account.isAdmin.value" class="space-y-3 rounded-lg border border-default bg-muted p-4">
    <p class="text-caption font-semibold text-highlighted">评论管理</p>
    <USwitch :model-value="section.posting_enabled" label="允许评论区投稿" :disabled="saving" @update:model-value="value => change('section', value)" />
    <USwitch v-if="section.article" :model-value="section.article.comments_enabled" label="允许这篇文章被评论" :disabled="saving" @update:model-value="value => change('article', value)" />
    <p class="text-caption text-muted">关闭任一开关后停止接收新评论，保留历史评论及作者的编辑、删除操作。</p>
    <UAlert v-if="error" :title="error" color="error" />
  </div>
</template>
