<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { privateDocumentSchema, privateKinds, ageRatings, type AgeRating, privateIdPattern, privateContentPath, type PrivateDocument, type PrivateForumPost, type PrivateKind } from '#shared/private-content'
import { privateReadingPath } from '~/utils/private-content'
import AccountFrame from '~/components/account/AccountFrame.vue'
import PrivateArticle from '~/components/private/PrivateArticle.vue'
import PrivateForum from '~/components/private/PrivateForum.vue'
import PrivateAccess from '~/components/private/PrivateAccess.vue'
const { account, canSubmit } = usePrivateContent(), route = useRoute()
const id = computed(() => typeof route.query.id === 'string' ? route.query.id : '')
const form = reactive({ kind: 'story' as PrivateKind, age_rating: 'general' as AgeRating, title: '', description: '', category: '', author_name: '', body_markdown: '', forum_posts: [] as PrivateForumPost[], status: 'draft' as 'draft' | 'published' })
const original = shallowRef<PrivateDocument | null>(null)
const loading = ref(false), saving = ref(false), error = ref(''), message = ref(''), preview = ref(false), deleting = ref(false), dirty = ref(false)
const discarding = ref(false)
let discardDecision: ((value: boolean) => void) | undefined
function confirmDiscard() {
  if (!dirty.value) return Promise.resolve(true)
  if (saving.value || discardDecision) return Promise.resolve(false)
  discarding.value = true
  return new Promise<boolean>(resolve => { discardDecision = resolve })
}
function finishDiscard(value: boolean) { discarding.value = false; discardDecision?.(value); discardDecision = undefined }
async function reloadContent() { if (await confirmDiscard()) await load() }
onBeforeRouteLeave(confirmDiscard)
let request = 0, settingForm = false
const editable = computed(() => account.isAdmin.value || (canSubmit.value && (!original.value || (original.value.created_by === account.user.value?.id && original.value.status === 'draft'))))
const previewDocument = computed<PrivateDocument>(() => ({ id: original.value?.id || '00000000-0000-4000-8000-000000000000', created_by: account.user.value?.id || null, created_at: '', updated_at: '', access_version: 1, ...form }))
function reset() {
  settingForm = true
  Object.assign(form, { kind: 'story', age_rating: 'general', title: '', description: '', category: '', author_name: '', body_markdown: '', forum_posts: [], status: 'draft' })
  original.value = null; dirty.value = false; preview.value = false
  settingForm = false
}
async function load() {
  const current = ++request
  reset(); error.value = ''; message.value = ''; loading.value = false; saving.value = false
  if (!account.user.value || !account.ready.value || !id.value) return
  if (!privateIdPattern.test(id.value)) { error.value = '内容地址无效。'; return }
  loading.value = true
  try {
    const { data, error: failure } = await (await account.client()).from('private_documents').select('*').eq('id', id.value).maybeSingle()
    if (current !== request) return
    if (failure || !data) throw failure || new Error('unavailable')
    original.value = data
    settingForm = true
    for (const key of ['kind', 'age_rating', 'title', 'description', 'category', 'author_name', 'body_markdown', 'forum_posts', 'status'] as const) Object.assign(form, { [key]: structuredClone(data[key]) })
    dirty.value = false; settingForm = false
  } catch { if (current === request) error.value = '内容不可用或读取失败。请确认权限后重试。' }
  finally { if (current === request) loading.value = false }
}
watch(form, () => { if (!settingForm) { dirty.value = true; message.value = '' } }, { deep: true, flush: 'sync' })
watch([id, () => account.user.value?.id, account.ready], load, { immediate: true, flush: 'sync' })
function chooseKind() {
  if (form.kind === 'forum' && !form.forum_posts.length) form.forum_posts = [{ floor: 1, author: '', body: '', isOriginalPoster: true }]
}
function normalizePosts() { form.forum_posts.forEach((post, i) => { post.floor = i + 1; post.isOriginalPoster = post.author.trim() === form.forum_posts[0]?.author.trim() }) }
function addFloor() { form.forum_posts.push({ floor: form.forum_posts.length + 1, author: '', body: '', isOriginalPoster: false }) }
const submissionState = computed(() => ({ ...form, body_markdown: form.kind === 'forum' ? '' : form.body_markdown, forum_posts: form.kind === 'forum' ? form.forum_posts : [] }))
async function save(event: FormSubmitEvent<any>) {
  if (!editable.value || (id.value && !original.value)) return
  saving.value = true; error.value = ''; message.value = ''
  const current = request
  try {
    const api = await account.client()
    const fields = privateDocumentSchema.parse(event.data)
    const { kind, ...update } = fields
    const result = original.value
      ? await api.from('private_documents').update(update).eq('id', original.value.id).eq('updated_at', original.value.updated_at).select('*').maybeSingle()
      : await api.from('private_documents').insert({ ...fields, kind }).select('*').single()
    if (current !== request) return
    if (result.error || !result.data) { error.value = '保存未完成。内容可能已在别处修改，或你的权限已变化。草稿仍保留在此页，请复制正文后再重新加载。'; return }
    original.value = result.data
    dirty.value = false
    message.value = '内容已保存。你可以继续编辑或设置阅读权限。'
    if (!id.value) { await navigateTo({ path: '/account/submissions/edit', query: { id: result.data.id } }, { replace: true }); message.value = '内容已保存。请在下方设置阅读权限。' }
  } catch { if (current === request) error.value = '保存失败，草稿仍保留在此页，请重试。' }
  finally { if (current === request) saving.value = false }
}
async function accessSaved() {
  // Refresh only the revision; never discard an unsaved manuscript after ACL edits.
  if (!original.value) return
  const previous = original.value
  const { data, error: failure } = await (await account.client()).from('private_documents').select('access_version').eq('id', previous.id).single()
  if (!failure && original.value === previous) original.value = { ...previous, ...data }
}
async function remove() {
  if (!original.value) return
  saving.value = true; error.value = ''
  try {
    const { data, error: failure } = await (await account.client()).from('private_documents').delete().eq('id', original.value.id).eq('updated_at', original.value.updated_at).select('id').maybeSingle()
    if (failure || !data) throw failure || new Error('conflict')
    dirty.value = false; await navigateTo('/account/submissions')
  } catch { error.value = '删除未完成，内容可能已变更。请重新加载后再试。' }
  finally { saving.value = false; deleting.value = false }
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) event.preventDefault() }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { request++; reset(); finishDiscard(false); window.removeEventListener('beforeunload', beforeUnload) })
</script>
<template>
  <AccountFrame :title="id ? '编辑投稿' : '新投稿'" description="用 Markdown 撰写文章，或按楼层整理论坛作品。内容仅向获授权的读者开放。">
    <UPageCard v-if="!account.user.value" title="请先登录"><UButton :to="{ path: '/account/login', query: { returnTo: route.fullPath } }">前往登录</UButton></UPageCard>
    <p v-else-if="loading" role="status">正在读取投稿…</p>
    <UAlert v-else-if="!editable" title="当前用户组没有此内容的投稿或编辑权限。" color="neutral" />
    <div v-else class="space-y-stack">
      <UAlert v-if="error" :title="error" color="error" />
      <p v-if="message" role="status" class="text-primary">{{ message }}</p>
      <div class="flex flex-wrap gap-inline"><UButton to="/account/submissions" variant="link" color="neutral" icon="i-lucide-arrow-left">返回投稿列表</UButton><UButton v-if="original" :to="privateReadingPath(original.id)" variant="outline" color="neutral">阅读</UButton><UButton v-if="original" variant="outline" color="neutral" :disabled="saving" @click="reloadContent">重新加载内容</UButton></div>
      <template v-if="!id || original">
        <UForm :schema="privateDocumentSchema" :state="submissionState" class="space-y-5" @submit="save">
          <UFormField label="内容类型" name="kind"><USelect v-model="form.kind" :items="Object.entries(privateKinds).map(([value, label]) => ({ value, label }))" :disabled="Boolean(original) || saving" @update:model-value="chooseKind" /></UFormField>
          <UFormField label="年龄分级" name="age_rating" description="一般或 R-18。分级会显示在目录和阅读页；论坛分级适用于整帖所有楼层。"><USelect v-model="form.age_rating" :items="Object.entries(ageRatings).map(([value, label]) => ({ value, label }))" :disabled="saving" /></UFormField>
          <UFormField label="标题" name="title" required><UInput v-model="form.title" class="w-full" maxlength="200" :disabled="saving" /></UFormField>
          <UFormField label="简介" name="description"><UTextarea v-model="form.description" class="w-full" :rows="3" :disabled="saving" /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2"><UFormField label="分类" name="category"><UInput v-model="form.category" class="w-full" :disabled="saving" /></UFormField><UFormField label="作品署名" name="author_name"><UInput v-model="form.author_name" class="w-full" :disabled="saving" /></UFormField></div>
          <UFormField v-if="form.kind !== 'forum'" label="正文 Markdown" name="body_markdown" required description="使用二级标题组织章节。支持列表、表格、引用和代码；HTML 与组件语法按普通文字显示。"><UTextarea v-model="form.body_markdown" class="w-full font-mono" :rows="20" :disabled="saving" /></UFormField>
          <UFormField v-else label="论坛楼层" name="forum_posts" required description="昵称属于作品中的人物，与网站账号分开。楼号按顺序保留；同人文可用与公开论坛相同的边界标记嵌在聊天之间。">
            <div class="space-y-4">
              <fieldset v-for="(post, index) in form.forum_posts" :key="index" class="space-y-3 rounded-card border border-default p-panel"><legend class="px-2 text-caption text-muted">第 {{ post.floor }} 楼</legend><UFormField :label="`第${post.floor}楼昵称`" required><UInput v-model="post.author" class="w-full" :disabled="saving" @update:model-value="normalizePosts" /></UFormField><UFormField :label="`第${post.floor}楼正文`" required><UTextarea v-model="post.body" class="w-full font-mono" :rows="10" :disabled="saving" /></UFormField></fieldset>
              <div class="flex gap-2"><UButton type="button" variant="outline" :disabled="saving || form.forum_posts.length >= 1000" @click="addFloor">添加楼层</UButton><UButton v-if="form.forum_posts.length > 1" type="button" color="neutral" variant="ghost" :disabled="saving" @click="form.forum_posts.pop()">移除最后一层</UButton></div>
              <details class="text-caption text-muted"><summary class="cursor-pointer">同人文格式示例</summary><pre class="mt-3 overflow-x-auto rounded-card bg-muted p-panel">聊天内容。

&lt;!-- fanfiction: 篇目标识 --&gt;

## 同人文篇名

### 第一节

正文。

&lt;!-- /fanfiction --&gt;

继续聊天。</pre></details>
            </div>
          </UFormField>
          <UFormField v-if="account.isAdmin.value" label="发布状态" name="status" description="草稿仅供管理与编辑；发布后按本篇阅读权限开放。"><USelect v-model="form.status" :items="[{ label: '草稿', value: 'draft' }, { label: '已发布', value: 'published' }]" :disabled="saving" /></UFormField>
          <div class="flex flex-wrap items-center gap-inline"><UButton type="submit" :loading="saving">保存投稿</UButton><UButton type="button" color="neutral" variant="outline" :aria-expanded="preview" @click="preview = !preview">{{ preview ? '收起预览' : '预览排版' }}</UButton><span v-if="dirty" class="text-caption text-muted">有未保存的修改</span></div>
        </UForm>
        <section v-if="preview" aria-label="投稿预览" class="border-t border-default pt-stack"><PrivateForum v-if="form.kind === 'forum'" :document="previewDocument" base-path="/private/read" preview /><PrivateArticle v-else :document="previewDocument" :reader-enabled="false" /></section>
        <PrivateAccess v-if="original && account.isAdmin.value" :document-id="original.id" @saved="accessSaved" />
        <div v-if="original" class="space-y-3 border-t border-default pt-stack"><p class="text-caption leading-copy text-muted">已保存的内容可立即通过“阅读”打开；独立地址会在下次网站部署时生成。</p><p class="break-all text-caption text-muted">独立地址：{{ privateContentPath(original.id) }}</p><UButton color="error" variant="outline" :disabled="saving" @click="deleting = true">删除投稿</UButton></div>
      </template>
    </div>
    <UModal v-model:open="deleting" title="删除投稿" description="正文与阅读授权会被永久删除。已有链接将显示内容不可用。"><template #footer><UButton color="error" :loading="saving" @click="remove">确认删除</UButton><UButton color="neutral" variant="ghost" :disabled="saving" @click="deleting = false">取消</UButton></template></UModal>
    <UModal :open="discarding" title="有未保存的修改" description="离开或重新加载会丢失当前尚未保存的内容。" @update:open="value => { if (!value) finishDiscard(false) }"><template #footer><UButton color="neutral" variant="outline" @click="finishDiscard(false)">继续编辑</UButton><UButton color="error" variant="outline" @click="finishDiscard(true)">放弃修改</UButton></template></UModal>
  </AccountFrame>
</template>
