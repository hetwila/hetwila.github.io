<script setup lang="ts">
import { privateIdPattern, type PrivateDocument } from '#shared/private-content'
import { privateReadingPath } from '~/utils/private-content'
import PrivateArticle from './PrivateArticle.vue'
import PrivateForum from './PrivateForum.vue'
const props = defineProps<{ id: string }>()
const account = useAccount(), route = useRoute()
const manuscript = shallowRef<PrivateDocument | null>(null)
const loading = ref(false), error = ref(''), unavailable = ref(false)
let requestVersion = 0, controller: AbortController | undefined
const basePath = computed(() => privateIdPattern.test(props.id) ? privateReadingPath(props.id) : '/private')
function clear() { requestVersion++; controller?.abort(); manuscript.value = null; loading.value = false; unavailable.value = false; error.value = '' }
async function load() {
  clear()
  if (!import.meta.client || !account.ready.value || !account.user.value) return
  if (!privateIdPattern.test(props.id)) { unavailable.value = true; return }
  const version = requestVersion, owner = account.user.value.id
  const signal = AbortSignal.any([(controller = new AbortController()).signal, AbortSignal.timeout(20000)])
  loading.value = true
  try {
    const { data, error: failure } = await (await account.client()).from('private_documents').select('*').eq('id', props.id).abortSignal(signal).maybeSingle()
    if (version !== requestVersion || owner !== account.user.value?.id) return
    if (failure) throw failure
    manuscript.value = data
    unavailable.value = !data
    await nextTick()
    if (route.hash) { try { document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView() } catch { /* Invalid URL fragment. */ } }
  } catch { if (version === requestVersion) error.value = '内容暂时无法读取，请重试。' }
  finally { if (version === requestVersion) loading.value = false }
}
watch([() => props.id, () => account.user.value?.id, account.ready], load, { immediate: true, flush: 'sync' })
const visibility = () => { if (document.hidden) clear(); else void load() }
const pageShow = () => { void load() }
onMounted(async () => {
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', clear)
  window.addEventListener('pageshow', pageShow)
  await account.initialize()
})
onBeforeUnmount(() => { clear(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', pageShow) })
useSeoMeta({ title: () => manuscript.value?.title || '私有内容', robots: 'noindex, nofollow, noarchive' })
</script>
<template>
  <main id="main" class="shell py-page-block" data-pagefind-ignore="all" data-private-shell>
    <div class="mb-stack flex flex-wrap items-center justify-between gap-inline"><UButton to="/private" color="neutral" variant="link" icon="i-lucide-arrow-left" class="p-0">返回可阅读内容</UButton><UButton v-if="manuscript && account.isAdmin.value" :to="{ path: '/account/submissions/edit', query: { id: manuscript.id } }" variant="outline" color="neutral" icon="i-lucide-pencil">编辑与权限</UButton></div>
    <ClientOnly>
      <h1 v-if="!manuscript" class="section-title mb-stack">私有内容</h1>
      <UAlert v-if="!account.configured" title="账号服务尚未配置" color="neutral" />
      <p v-else-if="!account.ready.value || loading" role="status" class="py-stack text-muted">正在确认阅读权限…</p>
      <UPageCard v-else-if="!account.user.value" title="登录后阅读"><template #title><h2>登录后阅读</h2></template><p class="text-muted">此内容仅向获得授权的用户开放。</p><UButton :to="{ path: '/account/login', query: { returnTo: route.fullPath } }">前往登录</UButton></UPageCard>
      <UAlert v-else-if="error" :title="error" color="error"><template #actions><UButton color="neutral" variant="outline" @click="load">重试</UButton></template></UAlert>
      <UEmpty v-else-if="unavailable" icon="i-lucide-lock-keyhole" title="内容不可用" description="你尚未获得阅读权限，或内容尚未发布、已被移除。" :actions="[{ label: '重新检查', onClick: load }]" />
      <template v-else-if="manuscript"><PrivateForum v-if="manuscript.kind === 'forum'" :document="manuscript" :base-path="basePath" /><PrivateArticle v-else :document="manuscript" /></template>
      <template #fallback><h1 class="section-title">私有内容</h1><p role="status" class="py-stack text-muted">请启用 JavaScript 并登录后阅读。内容会根据你的权限加载。</p></template>
    </ClientOnly>
  </main>
</template>
