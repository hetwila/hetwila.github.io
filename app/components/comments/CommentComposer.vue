<script setup lang="ts">
import { z } from 'zod'
import { COMMENT_MAX_LENGTH } from '#shared/comment'
import CommentMarkdown from './CommentMarkdown.vue'
defineProps<{ editing?: boolean; busy?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [body: string]; cancel: [] }>()
const body = defineModel<string>({ default: '' }), preview = ref(false)
const form = computed(() => ({ body: body.value }))
const schema = z.object({ body: z.string().trim().min(1, '请填写评论内容。').max(COMMENT_MAX_LENGTH, '评论最多10,000个字符。') })
</script>
<template>
  <UForm :state="form" :schema="schema" class="space-y-3" @submit="emit('submit', form.body.trim())">
    <UFormField :label="editing ? '编辑评论' : '写评论'" name="body" :hint="`${form.body.length.toLocaleString()} / 10,000`" description="支持 Markdown。标题以加粗段落显示，不支持 HTML 样式。" required>
      <UTextarea v-model="body" :maxlength="COMMENT_MAX_LENGTH" :rows="5" autoresize :maxrows="12" :disabled="busy" class="w-full" placeholder="写下你对作品的想法……" />
    </UFormField>
    <div v-if="preview" class="rounded-lg border border-default bg-muted p-4" role="region" aria-label="评论预览">
      <CommentMarkdown v-if="form.body.trim()" :source="form.body" /><p v-else class="text-caption text-muted">填写内容后即可预览。</p>
    </div>
    <UAlert v-if="error" :title="error" color="error" />
    <div class="flex flex-wrap gap-inline">
      <UButton type="submit" :loading="busy">{{ editing ? '保存修改' : '发表评论' }}</UButton>
      <UButton color="neutral" variant="outline" :aria-pressed="preview" @click="preview = !preview">{{ preview ? '收起预览' : '预览评论' }}</UButton>
      <UButton v-if="editing" color="neutral" variant="ghost" :disabled="busy" @click="emit('cancel')">取消编辑</UButton>
    </div>
  </UForm>
</template>
