<script setup lang="ts">
import type { AccountProfile } from '#shared/account'
const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ saved: [] }>()
const account = useAccount()
const selectedUsers = ref<string[]>([]), selectedGroups = ref<string[]>([]), groups = ref<string[]>([])
const users = ref<AccountProfile[]>([]), search = ref(''), loading = ref(false), saving = ref(false), searching = ref(false), error = ref(''), success = ref('')
const version = ref<number | null>(null)
let request = 0, userRequest = 0
async function load() {
  const current = ++request
  userRequest++; loading.value = false; searching.value = false
  version.value = null; selectedUsers.value = []; selectedGroups.value = []; users.value = []; error.value = ''; success.value = ''
  if (!account.isAdmin.value) return
  loading.value = true
  try {
    const api = await account.client()
    // Read the version before and after the two ACL sets to detect torn reads.
    const first = await api.from('private_documents').select('access_version').eq('id', props.documentId).single()
    const [a, b, c] = await Promise.all([
      api.from('content_user_grants').select('user_id', { count: 'exact' }).eq('document_id', props.documentId).limit(1000),
      api.from('content_group_grants').select('user_group', { count: 'exact' }).eq('document_id', props.documentId),
      api.rpc('content_account_groups'),
    ])
    const last = await api.from('private_documents').select('access_version').eq('id', props.documentId).single()
    if ([first, a, b, c, last].some(r => r.error) || first.data?.access_version !== last.data?.access_version || a.data?.length !== a.count || b.data?.length !== b.count) throw new Error('changed')
    if (current !== request) return
    selectedUsers.value = (a.data || []).map(r => r.user_id)
    selectedGroups.value = (b.data || []).map(r => r.user_group)
    groups.value = c.data || []
    version.value = last.data!.access_version
    await searchUsers()
  } catch { if (current === request) error.value = '权限读取失败或刚被修改，请重新加载后再保存。' }
  finally { if (current === request) loading.value = false }
}
async function searchUsers() {
  const current = ++userRequest
  if (!account.isAdmin.value) return
  searching.value = true
  try {
    const api = await account.client()
    let query = api.from('account_profiles').select('id,nickname,email,user_group').order('id').limit(30)
    const term = search.value.trim().replace(/[\\%_]/g, '\\$&')
    if (/^[0-9a-f-]{36}$/i.test(term)) query = query.eq('id', term)
    else if (term) query = query.ilike(term.includes('@') ? 'email' : 'nickname', `%${term}%`)
    const found = await query
    if (found.error) throw found.error
    const selected: AccountProfile[] = []
    for (let i = 0; i < selectedUsers.value.length; i += 50) {
      const result = await api.from('account_profiles').select('id,nickname,email,user_group').in('id', selectedUsers.value.slice(i, i + 50))
      if (result.error) throw result.error
      selected.push(...result.data as AccountProfile[])
    }
    if (current === userRequest) users.value = [...new Map([...selected, ...(found.data || [])].map(p => [p.id, p as AccountProfile])).values()]
  } catch { if (current === userRequest) error.value = '用户列表读取失败，请重试。' }
  finally { if (current === userRequest) searching.value = false }
}
async function save() {
  if (version.value === null || !account.isAdmin.value) return
  const current = request
  saving.value = true; error.value = ''; success.value = ''
  try {
    const { data, error: failure } = await (await account.client()).rpc('content_set_access', { p_document_id: props.documentId, p_users: selectedUsers.value, p_groups: selectedGroups.value, p_expected_version: version.value })
    if (current !== request) return
    if (failure) { error.value = failure.code === '40001' ? '权限已被另一位管理员修改。请重新加载，核对后再保存。' : '权限保存失败，请重试。'; return }
    version.value = data
    success.value = '阅读权限已保存。'
    emit('saved')
  } catch { if (current === request) error.value = '权限保存失败，请重试。' }
  finally { if (current === request) saving.value = false }
}
watch([() => props.documentId, account.isAdmin], load, { immediate: true })
onBeforeUnmount(() => { request++; userRequest++; selectedUsers.value = []; users.value = [] })
</script>
<template>
  <section aria-labelledby="private-access-heading" class="space-y-4 rounded-card border border-default bg-raised p-panel">
    <h2 id="private-access-heading" class="font-serif text-card text-highlighted">阅读权限</h2>
    <p class="text-caption leading-copy text-muted">管理员始终可以阅读。已发布的内容向下列用户或用户组开放，满足任意一项即可；全部留空时仅管理员可读。草稿不向获授权的读者展示。</p>
    <p v-if="loading" role="status">正在读取权限…</p>
    <template v-else-if="version !== null">
      <UFormField label="允许的用户组"><UCheckboxGroup v-model="selectedGroups" :items="groups.filter(g => g !== 'admin').map(g => ({ label: g, value: g }))" :disabled="saving" /></UFormField>
      <form class="flex items-end gap-2" @submit.prevent="searchUsers"><UFormField label="查找用户" description="输入昵称、邮箱或完整用户 ID；同名用户请核对身份。" class="flex-1"><UInput v-model="search" class="w-full" /></UFormField><UButton type="submit" color="neutral" variant="outline" :loading="searching">查找</UButton></form>
      <UFormField label="允许的用户"><USelectMenu v-model="selectedUsers" :items="users.map(u => ({ label: `${u.nickname} · ${u.email} · ${u.id}`, value: u.id }))" value-key="value" multiple class="w-full" placeholder="选择用户" :disabled="saving || searching" :ui="{ itemLabel: 'whitespace-normal break-all' }" /></UFormField>
      <p class="text-caption text-muted">已选 {{ selectedUsers.length }} 位用户；搜索结果最多显示30位，已选用户会保留。</p>
    </template>
    <UAlert v-if="error" :title="error" color="error" />
    <p v-if="success" role="status" class="text-primary">{{ success }}</p>
    <div class="flex flex-wrap gap-inline"><UButton :loading="saving" :disabled="version === null || loading" @click="save">保存阅读权限</UButton><UButton color="neutral" variant="outline" :disabled="saving" :loading="loading" @click="load">重新加载权限</UButton></div>
  </section>
</template>
