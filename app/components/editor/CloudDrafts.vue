<script setup lang="ts">
import { EDITOR_BUCKET, EDITOR_MAX_BYTES, editorSnapshotName, editorSnapshotTitle, parseEditorSnapshot, type EditorDraft } from '#shared/editor'
const props = defineProps<{ draft: EditorDraft }>()
const emit = defineEmits<{ restore: [draft: EditorDraft] }>()
const account = useAccount()
const rows = ref<{ name: string; updated_at?: string | null }[]>([]), loading = ref(false), saving = ref(false), error = ref(''), message = ref(''), page = ref(1), hasNext = ref(false)
const removing = ref('')
let version = 0
const active = (request: number, owner: string) => request === version && account.isAdmin.value && account.user.value?.id === owner
async function list() {
  const request = ++version, owner = account.user.value?.id
  rows.value = []; error.value = ''; loading.value = false
  if (!owner || !account.isAdmin.value) return
  loading.value = true
  try {
    const { data, error: failure } = await (await account.client()).storage.from(EDITOR_BUCKET).list(owner, { limit: 21, offset: (page.value - 1) * 20, sortBy: { column: 'name', order: 'desc' } })
    if (!active(request, owner)) return
    if (failure) throw failure
    rows.value = data.slice(0, 20); hasNext.value = data.length > 20
  } catch { if (active(request, owner)) error.value = '云端草稿读取失败，请重试。' }
  finally { if (request === version) loading.value = false }
}
async function save() {
  const request = version, owner = account.user.value?.id
  if (!owner || !account.isAdmin.value || saving.value) return
  const text = JSON.stringify(props.draft), name = editorSnapshotName(props.draft)
  if (new TextEncoder().encode(text).length > EDITOR_MAX_BYTES) { error.value = '草稿超过2 MiB，请拆分后再暂存。'; return }
  saving.value = true; error.value = ''; message.value = ''
  try {
    parseEditorSnapshot(text)
    const { error: failure } = await (await account.client()).storage.from(EDITOR_BUCKET).upload(`${owner}/${name}`, text, { contentType: 'application/json', cacheControl: '0', upsert: false })
    if (!active(request, owner)) return
    if (failure) throw failure
    message.value = '当前快照已暂存；继续编辑的内容会保存在本机。'; page.value = 1; await list()
  } catch { if (active(request, owner)) error.value = '云端暂存失败，本机草稿仍然保留，请重试。' }
  finally { saving.value = false }
}
async function restore(name: string) {
  const request = version, owner = account.user.value?.id, localId = props.draft.id
  if (!owner || !account.isAdmin.value) return
  loading.value = true; error.value = ''; message.value = ''
  try {
    const { data, error: failure } = await (await account.client()).storage.from(EDITOR_BUCKET).download(`${owner}/${name}`)
    if (!active(request, owner) || props.draft.id !== localId) return
    if (failure || !data || data.size > EDITOR_MAX_BYTES) throw failure || new Error()
    const draft = parseEditorSnapshot(await data.text())
    if (!active(request, owner) || props.draft.id !== localId) return
    emit('restore', draft)
  } catch { if (active(request, owner)) error.value = '此快照无法打开，当前草稿未被替换。' }
  finally { if (request === version) loading.value = false }
}
async function remove() {
  const request = version, owner = account.user.value?.id, name = removing.value
  if (!owner || !account.isAdmin.value || !name) return
  loading.value = true; error.value = ''
  try {
    const { error: failure } = await (await account.client()).storage.from(EDITOR_BUCKET).remove([`${owner}/${name}`])
    if (!active(request, owner)) return
    if (failure) throw failure
    removing.value = ''; await list()
  } catch { if (active(request, owner)) error.value = '删除未完成，请重试。' }
  finally { if (request === version) loading.value = false }
}
const displayName = editorSnapshotTitle
watch([() => account.user.value?.id, account.isAdmin, page], () => { message.value = ''; removing.value = ''; void list() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { version++; rows.value = [] })
</script>
<template>
  <UPageCard title="云端暂存" description="管理员可将草稿保存为独立快照，仅本人可访问；不会发布到网站。">
    <p v-if="!account.isAdmin.value" class="text-muted">登录管理员账号后可暂存到 Supabase。当前仍可使用本机自动保存和文件下载。</p>
    <template v-else>
      <div class="flex flex-wrap gap-2"><UButton :loading="saving" :disabled="loading" @click="save">暂存当前草稿</UButton><UButton variant="outline" color="neutral" :loading="loading" :disabled="saving" @click="list">刷新云端草稿</UButton></div>
      <UAlert v-if="error" :title="error" color="error" /><p v-if="message" role="status" class="text-primary">{{ message }}</p>
      <p v-if="!loading && !rows.length" class="text-muted">尚无云端草稿。</p>
      <ul class="space-y-3"><li v-for="row in rows" :key="row.name" class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-default p-4"><div class="min-w-0"><p class="break-words font-medium">{{ displayName(row.name) }}</p><time class="text-caption text-muted">{{ new Date(Number(row.name.slice(0, 13))).toLocaleString('zh-CN') }}</time></div><div class="flex gap-2"><UButton color="neutral" variant="outline" :disabled="loading || saving" :aria-label="`打开云端草稿 ${displayName(row.name)}`" @click="restore(row.name)">打开副本</UButton><UButton color="error" variant="ghost" :disabled="loading || saving" :aria-label="`删除云端草稿 ${displayName(row.name)}`" @click="removing = row.name">删除</UButton></div></li></ul>
      <div v-if="page > 1 || hasNext" class="flex gap-3"><UButton :disabled="page === 1 || loading" color="neutral" variant="outline" @click="page--">上一页</UButton><span class="self-center text-caption">第 {{ page }} 页</span><UButton :disabled="!hasNext || loading" color="neutral" variant="outline" @click="page++">下一页</UButton></div>
    </template>
    <UModal :open="Boolean(removing)" title="删除云端快照" description="仅删除这份云端快照，本机草稿仍保留。" @update:open="value => { if (!value) removing = '' }"><template #footer><UButton color="error" :loading="loading" @click="remove">确认删除</UButton><UButton color="neutral" variant="ghost" @click="removing = ''">取消</UButton></template></UModal>
  </UPageCard>
</template>
