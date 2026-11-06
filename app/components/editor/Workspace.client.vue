<script setup lang="ts">
import catalogueData from '../../../.generated/editor-catalogue.json'
import { createEditorBlock, editorDownloads, editorKinds, importEditorMarkdown, parseEditorSnapshot, serializeEditorDraft, serializeEditorBlocks, validateEditorDraft, EDITOR_MAX_BYTES, type EditorCatalogue, type EditorKind, type EditorDraft } from '#shared/editor'
import type { PrivateDocument } from '#shared/private-content'
import MetadataFields from './MetadataFields.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import CloudDrafts from './CloudDrafts.vue'
import PrivateArticle from '~/components/private/PrivateArticle.vue'
import PrivateForum from '~/components/private/PrivateForum.vue'
const catalogue = catalogueData as EditorCatalogue, account = useAccount()
const local = useEditorDrafts(), { draft, ready, dirty, error: localError, conflict, locals, savedAt } = local
const localOptions = computed(() => locals.value.map(d => ({ label: `${d.title} · ${editorKinds[d.kind]}`, value: d.id })))
const kindOptions = Object.entries(editorKinds).map(([value, label]) => ({ value, label }))
const activeFloor = ref(1)
const visiblePosts = computed(() => draft.value.posts.map((post, i) => ({ post, i })).slice(activeFloor.value - 1, activeFloor.value))
watch(() => [draft.value.id, draft.value.posts.length], () => { activeFloor.value = Math.min(activeFloor.value, draft.value.posts.length) || 1 })
function addFloor() { draft.value.posts.push({ id: crypto.randomUUID(), author: '', blocks: [createEditorBlock()] }); activeFloor.value = draft.value.posts.length }
const kind = ref<EditorKind>('wiki'), tab = ref('write'), error = ref(''), notice = ref(''), importBusy = ref(false), generating = ref(false), deleting = ref(false)
const pickedLocal = computed({ get: () => draft.value.id, set: id => { local.open(id); error.value = ''; notice.value = '' } })
const published = ref(''), files = ref<{ name: string; path: string; text: string }[]>([]), issues = ref<ReturnType<typeof validateEditorDraft>>([])
const allPublished = [...new Map(catalogue.pages.filter(p => p.markdownUrl).map(p => [p.uid!, { label: p.title, value: p.markdownUrl! }])).values()]
const tabs = [{ label: '撰写正文', value: 'write', slot: 'write', icon: 'i-lucide-pencil' }, { label: '元数据', value: 'metadata', slot: 'metadata', icon: 'i-lucide-settings' }, { label: '整篇预览', value: 'preview', slot: 'preview', icon: 'i-lucide-book-open' }, { label: '校验与下载', value: 'export', slot: 'export', icon: 'i-lucide-download' }, { label: '云端草稿', value: 'cloud', slot: 'cloud', icon: 'i-lucide-cloud' }]
const preview = computed<PrivateDocument>(() => ({ id: draft.value.id, kind: draft.value.kind, title: String(draft.value.metadata.title || '未命名草稿'), description: String(draft.value.metadata.description || ''), category: String(draft.value.metadata.category || ''), author_name: '', age_rating: 'general', status: draft.value.metadata.publicationStatus === 'published' ? 'published' : 'draft', body_markdown: draft.value.body, forum_posts: draft.value.posts.map((p, i) => ({ floor: i + 1, author: p.author, isOriginalPoster: p.author === draft.value.posts[0]?.author, body: serializeEditorBlocks(p.blocks) })), created_by: null, created_at: '', updated_at: '', access_version: 1 }))
watch(() => JSON.stringify(draft.value), () => { files.value = []; issues.value = [] }, { flush: 'sync' })
function download(name: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function backup() { download(`草稿-${draft.value.id}.json`, JSON.stringify(draft.value, null, 2), 'application/json') }
async function generate(autoDownload = false) {
  error.value = ''; notice.value = ''; tab.value = 'export'; generating.value = true
  const current = JSON.stringify(draft.value), snapshot = JSON.parse(current) as EditorDraft
  try {
    issues.value = validateEditorDraft(snapshot, catalogue)
    if (issues.value.some(i => i.level === 'error')) return
    const result = await editorDownloads(snapshot, catalogue)
    if (JSON.stringify(draft.value) !== current) { notice.value = '内容已变化，请重新生成下载文件。'; return }
    files.value = result
    if (autoDownload) download(result[0]!.name, result[0]!.text)
  } catch (e) { error.value = e instanceof Error ? e.message : '文件生成失败。' }
  finally { generating.value = false }
}
function restore(next: EditorDraft) { if (local.accept(next)) { notice.value = '已作为新本机草稿打开，原草稿保留。'; tab.value = 'write' } }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  error.value = ''; notice.value = ''; importBusy.value = true
  try {
    if (file.size > EDITOR_MAX_BYTES) throw new Error('文件超过2 MiB，请拆分后再导入。')
    const text = await file.text()
    restore(file.name.endsWith('.json') ? parseEditorSnapshot(text) : importEditorMarkdown(text))
  } catch (e) { error.value = e instanceof Error ? e.message : '文件导入失败，当前草稿未改变。' }
  finally { importBusy.value = false; input.value = '' }
}
async function importPublished() {
  if (!allPublished.some(p => p.value === published.value)) return
  importBusy.value = true; error.value = ''; notice.value = ''
  try {
    const response = await fetch(published.value, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error()
    restore(importEditorMarkdown(await response.text()))
  } catch { error.value = '已发布文件读取失败，请重试或从本地导入。' }
  finally { importBusy.value = false }
}
function addAnchor(anchor: string) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(anchor)) { error.value = '请先填写有效的事件锚点。'; return }
  const text = `<a id="${anchor}"></a>`
  if (!draft.value.body.includes(text)) draft.value.body += `\n\n${text}\n\n`
  notice.value = '锚点已添加到正文末尾，可在 Markdown 模式移动到对应事件段落前。'
}
const leaving = ref(false)
let leaveDecision: ((value: boolean) => void) | undefined
onBeforeRouteLeave(() => local.save() ? true : new Promise<boolean>(resolve => { leaveDecision = resolve; leaving.value = true }))
function decideLeave(value: boolean) { leaving.value = false; leaveDecision?.(value); leaveDecision = undefined }
onMounted(account.initialize)
onBeforeUnmount(() => decideLeave(false))
</script>
<template>
  <div v-if="!ready" role="status" class="py-stack text-muted">正在恢复本机草稿…</div>
  <div v-else class="space-y-stack">
    <UPageCard>
      <div class="grid items-end gap-4 md:grid-cols-3">
        <UFormField label="本机草稿"><USelectMenu v-model="pickedLocal" :items="localOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField label="新建类型"><USelect v-model="kind" :items="kindOptions" class="w-full" /></UFormField>
        <div class="flex flex-wrap gap-2"><UButton color="neutral" variant="outline" @click="local.create(kind)">新建草稿</UButton><UButton color="neutral" variant="ghost" @click="local.copy">另存副本</UButton><UButton color="error" variant="ghost" @click="deleting = true">删除本机草稿</UButton></div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-caption text-muted" role="status">{{ editorKinds[draft.kind] }} · {{ conflict ? '检测到另一窗口的修改' : dirty ? '尚未保存' : savedAt ? '已自动保存到本机 ' + new Date(savedAt).toLocaleTimeString('zh-CN') : '等待自动保存' }}</p><div class="flex flex-wrap gap-2"><UButton color="neutral" variant="outline" @click="backup">下载草稿备份</UButton><UButton icon="i-lucide-download" :loading="generating" @click="generate(true)">下载 Markdown</UButton></div></div>
      <details><summary class="cursor-pointer text-caption text-muted">导入本地文件或已发布内容</summary><div class="mt-4 grid items-end gap-4 md:grid-cols-2"><UFormField label="导入 Markdown 或草稿备份" description="支持 .md 和编辑器导出的 .json，最多2 MiB。"><UInput type="file" accept=".md,.markdown,.json" class="w-full" :disabled="importBusy" @change="importFile" /></UFormField><div class="space-y-3"><UFormField label="已发布内容"><USelectMenu v-model="published" :items="allPublished" value-key="value" placeholder="搜索已有文章或帖子" class="w-full" /></UFormField><UButton color="neutral" variant="outline" :disabled="!published" :loading="importBusy" @click="importPublished">导入为本机草稿</UButton></div></div></details>
    </UPageCard>
    <UAlert v-if="localError" :title="localError" color="error" /><UAlert v-if="error" :title="error" color="error" /><p v-if="notice" role="status" class="text-primary">{{ notice }}</p>
    <UAlert v-if="conflict" title="同一草稿已在另一窗口修改，自动保存已暂停。" description="可保留当前内容为副本，或载入另一窗口的版本。" color="warning"><template #actions><UButton color="neutral" variant="outline" @click="local.copy">保留当前内容为副本</UButton><UButton color="neutral" variant="outline" @click="local.reloadConflict">载入另一窗口版本</UButton></template></UAlert>
    <UTabs :key="draft.id" v-model="tab" :items="tabs" variant="link" :ui="{ list: 'flex-wrap', trigger: 'whitespace-nowrap' }">
      <template #write>
        <div class="mt-stack space-y-stack">
          <MarkdownEditor v-if="draft.kind !== 'forum'" v-model="draft.body" label="文章正文" :catalogue="catalogue" />
          <template v-else>
            <div class="flex flex-wrap items-end gap-3"><UFormField label="编辑楼层"><USelect v-model="activeFloor" :items="draft.posts.map((p, i) => ({ label: `第 ${i + 1} 楼 · ${p.author || '未填写昵称'}`, value: i + 1 }))" /></UFormField><UButton color="neutral" variant="outline" :disabled="activeFloor <= 1" @click="activeFloor--">上一层</UButton><UButton color="neutral" variant="outline" :disabled="activeFloor >= draft.posts.length" @click="activeFloor++">下一层</UButton><p class="self-center text-caption text-muted">共 {{ draft.posts.length }} 层 · 楼号保持原有顺序</p></div>
            <UPageCard v-for="{ post, i } in visiblePosts" :key="post.id" :title="`第 ${i + 1} 楼`">
              <UFormField :label="`第${i + 1}楼昵称`" :description="i === 0 ? '首层作者为楼主。后续相同昵称自动识别为楼主。' : undefined"><UInput v-model="post.author" class="w-full" /></UFormField>
              <div v-for="(block, b) in post.blocks" :key="block.id" class="space-y-4 border-t border-default pt-stack">
                <div v-if="block.type === 'fanfiction'" class="grid gap-4 sm:grid-cols-2"><UFormField :label="`第${i + 1}楼同人文篇名`"><UInput v-model="block.title" class="w-full" /></UFormField><UFormField :label="`第${i + 1}楼同人文标识`" description="改标题时保留此标识。"><UInput v-model="block.key" class="w-full" /></UFormField></div>
                <MarkdownEditor v-model="block.body" :label="`第${i + 1}楼${block.type === 'fanfiction' ? '同人文' : '聊天'}${b + 1}`" :catalogue="catalogue" forum />
                <UButton v-if="post.blocks.length > 1" color="neutral" variant="ghost" @click="post.blocks.splice(b, 1)">移除此段</UButton>
              </div>
              <div class="flex flex-wrap gap-2"><UButton variant="outline" color="neutral" @click="post.blocks.push(createEditorBlock())">添加聊天段落</UButton><UButton variant="outline" color="neutral" @click="post.blocks.push(createEditorBlock('fanfiction'))">添加楼内同人文</UButton></div>
            </UPageCard>
            <div class="flex flex-wrap gap-2"><UButton :disabled="draft.posts.length >= 1000" @click="addFloor">追加楼层</UButton><UButton v-if="draft.posts.length > 1" color="neutral" variant="outline" @click="draft.posts.pop()">移除最后一层</UButton></div>
          </template>
        </div>
      </template>
      <template #metadata><MetadataFields :draft="draft" :catalogue="catalogue" class="mt-stack" @anchor="addAnchor" /></template>
      <template #preview><section aria-label="整篇预览" class="mt-stack"><PrivateForum v-if="draft.kind === 'forum'" :document="preview" base-path="/editor" :private-content="false" preview /><PrivateArticle v-else :document="preview" :private-content="false" /></section></template>
      <template #export>
        <UPageCard class="mt-stack" title="校验与下载" description="检查元数据、来源、站内链接和正文结构。草稿中尚未收录的链接会列为待核对；公开发布文件必须全部通过。">
          <UButton :loading="generating" @click="generate()">生成交付文件</UButton>
          <ul v-if="issues.length" class="space-y-2" aria-label="格式检查结果"><li v-for="(issue, i) in issues" :key="i" class="break-words text-detail" :class="issue.level === 'error' ? 'text-error' : 'text-warning'">{{ issue.level === 'error' ? '需修改' : '待核对' }} · {{ issue.field }}：{{ issue.message }}</li></ul>
          <p v-if="files.length" role="status" class="text-primary">文件格式检查通过。下载后可交给维护者核对并收录。</p>
          <ul class="space-y-3"><li v-for="file in files" :key="file.path" class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-default p-4"><p class="min-w-0 break-all text-caption">{{ file.path }}</p><UButton variant="outline" color="neutral" @click="download(file.name, file.text, file.name.endsWith('.json') ? 'application/json' : 'text/markdown;charset=utf-8')">下载 {{ file.path.startsWith('sources/') ? '配套原稿' : file.name }}</UButton></li></ul>
          <p v-if="draft.kind !== 'wiki'" class="text-caption text-muted">配套原稿反映本次编辑内容；按上方路径分别保存，若浏览器为同名文件添加了序号，请恢复所列文件名。原稿登记文件需合并到现有 manifest，不要覆盖其他作品的记录。</p>
          <details><summary class="cursor-pointer text-muted">查看完整 Markdown</summary><pre class="mt-4 max-h-96 overflow-auto rounded-card bg-muted p-panel text-caption">{{ files[0]?.text || serializeEditorDraft(draft) }}</pre></details>
        </UPageCard>
      </template>
      <template #cloud><CloudDrafts :draft="draft" class="mt-stack" @restore="restore" /></template>
    </UTabs>
    <UModal v-model:open="deleting" title="删除本机草稿" description="此操作只删除当前草稿的本机副本。已下载的文件与云端快照不受影响。"><template #footer><UButton color="error" @click="local.removeCurrent(); deleting = false">确认删除</UButton><UButton color="neutral" variant="ghost" @click="deleting = false">取消</UButton></template></UModal>
    <UModal :open="leaving" title="当前修改尚未保存" description="请先下载草稿备份。继续离开会丢失尚未保存的修改。" @update:open="value => { if (!value) decideLeave(false) }"><template #footer><UButton @click="backup">下载草稿备份</UButton><UButton color="neutral" variant="outline" @click="decideLeave(false)">继续编辑</UButton><UButton color="error" variant="ghost" @click="decideLeave(true)">仍然离开</UButton></template></UModal>
  </div>
</template>
