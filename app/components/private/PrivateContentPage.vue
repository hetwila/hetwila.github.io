<script setup lang="ts">
import { privateIdPattern, privateSummaryColumns, type PrivateDocument, type PrivateDocumentSummary } from '#shared/private-content'
import { privateReadingPath } from '~/utils/private-content'
import PrivateArticle from './PrivateArticle.vue'
import PrivateForum from './PrivateForum.vue'
import AgeRatingBadge from './AgeRatingBadge.vue'
const props = defineProps<{ id: string }>()
const account = useAccount(), route = useRoute()
const manuscript = shallowRef<PrivateDocument | null>(null)
const summary = shallowRef<PrivateDocumentSummary | null>(null)
// Deliberately local to this visit and this document: no cookie, storage or profile write.
const confirmedId = ref('')
const showSensitive = computed(() => account.profile.value?.show_sensitive_content === true)
const needsConfirmation = (row: PrivateDocumentSummary) => row.age_rating !== 'general' && !showSensitive.value && confirmedId.value !== row.id
const loading = ref(false), error = ref(''), unavailable = ref(false)
let requestVersion = 0, controller: AbortController | undefined
// Keep generic-reader floor links on that same page, even after a canonical shell
// has been built, so paging within one thread does not start a new age check.
const basePath = computed(() => privateIdPattern.test(props.id) ? (route.path === '/private/read' ? `/private/read?id=${props.id}` : privateReadingPath(props.id)) : '/private')
function clear() { requestVersion++; controller?.abort(); manuscript.value = null; summary.value = null; loading.value = false; unavailable.value = false; error.value = '' }
async function load() {
  clear()
  if (!import.meta.client || document.hidden || !account.ready.value || !account.user.value) return
  if (!privateIdPattern.test(props.id)) { unavailable.value = true; return }
  const version = requestVersion, owner = account.user.value.id
  const signal = AbortSignal.any([(controller = new AbortController()).signal, AbortSignal.timeout(20000)])
  loading.value = true
  try {
    const api = await account.client()
    // The initial request deliberately excludes body and forum floors.
    const metadata = await api.from('private_documents').select(privateSummaryColumns).eq('id', props.id).abortSignal(signal).maybeSingle()
    if (version !== requestVersion || owner !== account.user.value?.id) return
    if (metadata.error) throw metadata.error
    if (!metadata.data) { unavailable.value = true; return }
    summary.value = metadata.data as PrivateDocumentSummary
    if (needsConfirmation(summary.value)) return
    const { data, error: failure } = await api.from('private_documents').select('*').eq('id', props.id).abortSignal(signal).maybeSingle()
    if (version !== requestVersion || owner !== account.user.value?.id) return
    if (failure) throw failure
    if (!data) { summary.value = null; unavailable.value = true; return }
    // A rating may have changed between requests. Never mount the new body first.
    const { body_markdown: _body, forum_posts: _posts, ...currentSummary } = data as PrivateDocument
    summary.value = currentSummary
    if (needsConfirmation(currentSummary)) return
    manuscript.value = data
    loading.value = false
    await nextTick()
    if (version !== requestVersion) return
    if (route.hash) { try { document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView() } catch { /* Invalid URL fragment. */ } }
  } catch { if (version === requestVersion) error.value = '内容暂时无法读取，请重试。' }
  finally { if (version === requestVersion) loading.value = false }
}
watch([() => props.id, () => account.user.value?.id, account.ready, showSensitive], (value, previous) => {
  if (value[0] !== previous?.[0] || value[1] !== previous?.[1] || value[3] !== previous?.[3]) confirmedId.value = ''
  void load()
}, { immediate: true, flush: 'sync' })
function confirmAge() { confirmedId.value = props.id; void load() }
function leavePage() { confirmedId.value = ''; clear() }
const visibility = () => { if (document.hidden) clear(); else void load() }
const pageShow = () => { void load() }
onMounted(async () => {
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', leavePage)
  window.addEventListener('pageshow', pageShow)
  await account.initialize()
})
onBeforeUnmount(() => { leavePage(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leavePage); window.removeEventListener('pageshow', pageShow) })
useSeoMeta({ title: () => summary.value?.title || '私有内容', robots: 'noindex, nofollow, noarchive' })
</script>
<template>
  <main id="main" class="shell py-page-block" data-pagefind-ignore="all" data-private-shell>
    <div class="mb-stack flex flex-wrap items-center justify-between gap-inline"><UButton to="/private" color="neutral" variant="link" icon="i-lucide-arrow-left" class="p-0">返回可阅读内容</UButton><UButton v-if="summary && account.isAdmin.value" :to="{ path: '/account/submissions/edit', query: { id: summary.id } }" variant="outline" color="neutral" icon="i-lucide-pencil">编辑与权限</UButton></div>
    <ClientOnly>
      <h1 v-if="!manuscript" class="section-title mb-stack">{{ summary?.title || '私有内容' }}</h1>
      <UAlert v-if="!account.configured" title="账号服务尚未配置" color="neutral" />
      <p v-else-if="!account.ready.value || loading" role="status" class="py-stack text-muted">正在确认阅读权限…</p>
      <UPageCard v-else-if="!account.user.value" title="登录后阅读"><template #title><h2>登录后阅读</h2></template><p class="text-muted">此内容仅向获得授权的用户开放。</p><UButton :to="{ path: '/account/login', query: { returnTo: route.fullPath } }">前往登录</UButton></UPageCard>
      <UAlert v-else-if="error" :title="error" color="error"><template #actions><UButton color="neutral" variant="outline" @click="load">重试</UButton></template></UAlert>
      <UEmpty v-else-if="unavailable" icon="i-lucide-lock-keyhole" title="内容不可用" description="你尚未获得阅读权限，或内容尚未发布、已被移除。" :actions="[{ label: '重新检查', onClick: load }]" />
      <UPageCard v-else-if="summary && needsConfirmation(summary)" class="mx-auto max-w-reading" aria-labelledby="age-confirmation-title">
        <div><AgeRatingBadge :rating="summary.age_rating" /></div>
        <h2 id="age-confirmation-title" class="text-card font-semibold text-highlighted">年龄确认</h2>
        <p class="leading-copy text-muted">此内容仅限年满18周岁的读者。请确认年龄后继续阅读。</p>
        <p class="leading-copy text-muted">本次确认仅用于当前这篇内容，不会修改你的默认设置。你可以前往<NuxtLink :to="{ path: '/account', hash: '#reading-preferences' }" class="text-primary underline">个人资料页的阅读偏好</NuxtLink>，设置是否默认显示敏感内容。</p>
        <div class="flex flex-wrap gap-inline"><UButton @click="confirmAge">我已年满18周岁，继续阅读</UButton><UButton to="/private" color="neutral" variant="outline">返回目录</UButton></div>
      </UPageCard>
      <template v-else-if="manuscript"><PrivateForum v-if="manuscript.kind === 'forum'" :document="manuscript" :base-path="basePath" /><PrivateArticle v-else :document="manuscript" /></template>
      <template #fallback><h1 class="section-title">私有内容</h1><p role="status" class="py-stack text-muted">请启用 JavaScript 并登录后阅读。内容会根据你的权限加载。</p></template>
    </ClientOnly>
  </main>
</template>
