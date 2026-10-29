<script setup lang="ts">
import { COMMENT_PAGE_SIZE, commentSectionIdPattern, type ArticleComment, type CommentSectionInfo } from '#shared/comment'
import { safeReturnTo } from '#shared/account'
import CommentComposer from './CommentComposer.vue'
import CommentMarkdown from './CommentMarkdown.vue'
import CommentSettings from './CommentSettings.vue'
const props = defineProps<{ sectionId: string }>()
const account = useAccount(), route = useRoute(), toast = useToast(), headingId = useId()
const section = ref<CommentSectionInfo | null>(null), comments = ref<ArticleComment[]>([]), total = ref(0), page = ref(1)
const loading = ref(true), error = ref(''), busy = ref(false), writeError = ref(''), canPost = ref(false), composerVersion = ref(0)
const editingId = ref<string | null>(null), deleting = ref<ArticleComment | null>(null)
const draft = ref(''), editingDraft = ref('')
const loginUrl = computed(() => `/account/login?returnTo=${encodeURIComponent(safeReturnTo(route.fullPath.split('#')[0] + '#comments'))}`)
const closedReason = computed(() => !section.value?.posting_enabled ? '评论区已暂停接收新评论。' : section.value.article && !section.value.article.comments_enabled ? '这篇文章已关闭新评论。' : '')
let version = 0
async function load() {
  if (import.meta.server) return
  const current = ++version
  loading.value = true; error.value = ''
  if (!commentSectionIdPattern.test(props.sectionId)) { section.value = null; error.value = '评论区 ID 无效。'; loading.value = false; return }
  if (!account.configured) { error.value = '评论服务暂未配置。'; loading.value = false; return }
  try {
    await account.initialize()
    const api = await account.client()
    const [info, list, permission] = await Promise.all([
      api.from('comment_sections').select('*,article:comment_articles(*)').eq('id', props.sectionId).maybeSingle(),
      api.from('article_comments').select('id,section_id,author_id,body,created_at,updated_at,author:comment_authors(nickname,avatar_path)', { count: 'exact' })
        .eq('section_id', props.sectionId).order('created_at').order('id').range((page.value - 1) * COMMENT_PAGE_SIZE, page.value * COMMENT_PAGE_SIZE - 1),
      account.user.value ? api.rpc('comment_can_post', { p_section_id: props.sectionId }) : Promise.resolve({ data: false, error: null }),
    ])
    if (current !== version) return
    if (info.error || list.error || permission.error) throw info.error || list.error || permission.error
    section.value = info.data as CommentSectionInfo | null
    comments.value = list.data as unknown as ArticleComment[]; total.value = list.count ?? 0; canPost.value = permission.data === true
    if (editingId.value && !comments.value.some(comment => comment.id === editingId.value)) editingId.value = null
    const last = Math.max(1, Math.ceil(total.value / COMMENT_PAGE_SIZE))
    if (page.value > last) page.value = last
  } catch { if (current === version) error.value = '评论暂时无法读取，请稍后重试。' }
  finally { if (current === version) loading.value = false }
}
onMounted(load)
watch(() => props.sectionId, () => { section.value = null; comments.value = []; total.value = 0; page.value = 1; editingId.value = null; draft.value = ''; composerVersion.value++; void load() })
watch([page, () => account.user.value?.id], () => { editingId.value = null; writeError.value = ''; void load() })
watch(() => account.user.value?.id, () => { draft.value = ''; editingDraft.value = '' })
onBeforeUnmount(() => { version++ })
function date(value: string) { return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) }
async function save(body: string, comment?: ArticleComment) {
  if (busy.value) return
  const targetSection = props.sectionId
  busy.value = true; writeError.value = ''
  try {
    const api = await account.client()
    const result = comment
      ? await api.from('article_comments').update({ body }).eq('id', comment.id).eq('updated_at', comment.updated_at).select('id').single()
      : await api.from('article_comments').insert({ section_id: targetSection, body }).select('id').single()
    if (result.error) throw result.error
    if (targetSection !== props.sectionId) return
    editingId.value = null; composerVersion.value++; if (!comment) draft.value = ''
    if (!comment) page.value = Math.max(1, Math.ceil((total.value + 1) / COMMENT_PAGE_SIZE))
    await load(); toast.add({ title: comment ? '评论已更新' : '评论已发表', color: 'success' })
  } catch { writeError.value = comment ? '保存失败：评论可能已更新或删除，请刷新后重试。请先保留编辑框中的内容。' : '发表失败，请检查登录状态和投稿开关后重试。内容仍保留在编辑框中。' }
  finally { busy.value = false }
}
async function remove() {
  if (!deleting.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const result = await (await account.client()).from('article_comments').delete().eq('id', deleting.value.id).select('id').single()
    if (result.error) throw result.error
    if (editingId.value === deleting.value.id) editingId.value = null
    deleting.value = null; await load(); toast.add({ title: '评论已删除', color: 'success' })
  } catch { error.value = '删除失败，评论可能已被删除或权限已改变，请刷新重试。'; deleting.value = null }
  finally { busy.value = false }
}
</script>
<template>
  <section class="comment-section min-w-0 space-y-stack" :aria-labelledby="headingId" data-pagefind-ignore>
    <div class="flex flex-wrap items-center justify-between gap-inline">
      <h2 :id="headingId" class="section-title">评论<span v-if="section" class="ml-2 text-caption font-sans font-normal text-muted">{{ total }} 条</span></h2>
      <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="loading" @click="load">刷新评论</UButton>
    </div>
    <noscript><p>启用 JavaScript 后可查看和发表评论，正文阅读不受影响。</p></noscript>
    <UAlert v-if="error" :title="error" color="error" />
    <p v-if="loading && !section" role="status" class="text-caption text-muted">正在加载评论……</p>
    <p v-else-if="!section && !error" class="text-muted">此评论区不存在。</p>
    <template v-if="section">
      <CommentSettings :section="section" @changed="load" />
      <p v-if="closedReason" role="status" class="rounded-lg bg-muted p-4 text-copy">{{ closedReason }}</p>
      <div v-if="!account.user.value" class="flex flex-wrap items-center gap-inline text-copy"><span>登录后可发表评论。</span><UButton :to="loginUrl" variant="outline">登录参与讨论</UButton></div>
      <CommentComposer v-else-if="canPost" :key="`${props.sectionId}-${composerVersion}`" v-model="draft" :busy="busy" :error="!editingId ? writeError : ''" @submit="body => save(body)" />
      <p v-else-if="!closedReason" class="text-copy text-muted">当前用户组没有评论投稿权限。</p>
      <p v-if="!comments.length && !loading" class="py-6 text-center text-copy text-muted">还没有评论。</p>
      <ol v-else class="divide-y divide-default" aria-label="评论列表" :aria-busy="loading">
        <li v-for="comment in comments" :key="comment.id" class="comment-item py-stack first:pt-0 last:pb-0">
          <div class="flex items-start gap-inline">
            <UAvatar :src="account.avatarUrl(comment.author?.avatar_path)" :alt="comment.author?.nickname || '已注销用户'" icon="i-lucide-user-round" size="md" />
            <div class="min-w-0 flex-1">
              <p class="break-words text-copy font-semibold text-highlighted">{{ comment.author?.nickname || '已注销用户' }}</p>
              <p class="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted"><span>发布于 <time :datetime="comment.created_at">{{ date(comment.created_at) }}</time></span><span>更新于 <time :datetime="comment.updated_at">{{ date(comment.updated_at) }}</time></span></p>
            </div>
          </div>
          <div class="mt-4">
            <CommentComposer v-if="editingId === comment.id" :key="comment.id" v-model="editingDraft" editing :busy="busy" :error="writeError" @submit="body => save(body, comment)" @cancel="editingId = null; writeError = ''" />
            <CommentMarkdown v-else :source="comment.body" />
          </div>
          <div v-if="account.user.value?.id === comment.author_id || account.isAdmin.value" class="mt-3 flex gap-2">
            <UButton v-if="account.user.value?.id === comment.author_id && editingId !== comment.id" color="neutral" variant="ghost" :disabled="busy" @click="editingId = comment.id; editingDraft = comment.body; writeError = ''">编辑评论</UButton>
            <UButton color="error" variant="ghost" :disabled="busy" @click="deleting = comment">删除评论</UButton>
          </div>
        </li>
      </ol>
      <UPagination v-if="total > COMMENT_PAGE_SIZE" v-model:page="page" :total="total" :items-per-page="COMMENT_PAGE_SIZE" :sibling-count="1" aria-label="评论分页" />
    </template>
    <UModal :open="Boolean(deleting)" title="删除评论" description="删除后无法恢复，请确认要删除这条评论。" @update:open="value => { if (!value && !busy) deleting = null }">
      <template #body><p class="text-copy">确定删除 {{ deleting?.author?.nickname || '已注销用户' }} 的这条评论？</p></template>
      <template #footer><UButton color="error" :loading="busy" @click="remove">确认删除评论</UButton><UButton color="neutral" variant="ghost" :disabled="busy" @click="deleting = null">取消</UButton></template>
    </UModal>
  </section>
</template>
