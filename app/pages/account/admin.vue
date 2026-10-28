<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import { inviteStatus, type AccountInvitation, type AccountProfile } from '#shared/account'
import AccountFrame from '~/components/account/AccountFrame.vue'
const account = useAccount(), toast = useToast()
const tab = ref('invitations'), invitations = ref<AccountInvitation[]>([]), users = ref<AccountProfile[]>([])
const page = ref(1), total = ref(0), loading = ref(false), error = ref(''), saving = ref(false), open = ref(false), deleting = ref<AccountInvitation | null>(null)
const editing = ref<AccountInvitation | null>(null)
const form = reactive({ code:'',valid_from:'',valid_until:'',note:'' })
const schema = z.object({ code:z.string().regex(/^([A-Z0-9]{6})?$/, '邀请码须为6位大写字母或数字。'),valid_from:z.string().refine(s=>Number.isFinite(Date.parse(s)), '请填写开始时间。'),valid_until:z.string().refine(s=>Number.isFinite(Date.parse(s)), '请填写结束时间。'),note:z.string().max(500) }).refine(s=>Date.parse(s.valid_until)>Date.parse(s.valid_from), { path:['valid_until'],message:'结束时间应晚于开始时间。' })
const modalError = ref('')
const timezone = ref('')
onMounted(() => { timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone })
function date(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN') : '—' }
function localInput(value: string) { const d = new Date(value); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16) }
const invitationColumns: TableColumn<AccountInvitation>[] = [
  { accessorKey:'code',header:'邀请码' }, { id:'status',header:'状态' }, { accessorKey:'valid_from',header:'生效时间',cell:({row})=>date(row.original.valid_from) },
  { accessorKey:'valid_until',header:'结束时间',cell:({row})=>date(row.original.valid_until) }, { accessorKey:'note',header:'备注' }, { id:'actions',header:'操作' },
]
const userColumns: TableColumn<AccountProfile>[] = [{id:'avatar',header:'头像'},{accessorKey:'nickname',header:'昵称'},{accessorKey:'email',header:'邮箱'},{accessorKey:'user_group',header:'用户组'},{accessorKey:'created_at',header:'注册时间',cell:({row})=>date(row.original.created_at)},{accessorKey:'id',header:'用户 ID'}]
let requestVersion = 0
async function load() {
  if (!account.isAdmin.value) return
  const version = ++requestVersion
  loading.value = true; error.value = ''
  try {
    const api = await account.client()
    const query = tab.value === 'invitations' ? api.from('account_invitations').select('*',{count:'exact'}).is('deleted_at',null) : api.from('account_profiles').select('*',{count:'exact'})
    const { data,count,error:failure } = await query.order('created_at',{ascending:false}).order('id').range((page.value-1)*20,page.value*20-1)
    if (failure) throw failure
    if (version !== requestVersion) return
    if (tab.value === 'invitations') invitations.value = data as AccountInvitation[]
    else users.value = data as AccountProfile[]
    total.value = count ?? 0
    if (page.value > Math.max(1,Math.ceil(total.value/20))) page.value = Math.max(1,Math.ceil(total.value/20))
  } catch { if (version === requestVersion) error.value = '列表读取失败，请确认管理员权限并重试。' }
  finally { if (version === requestVersion) loading.value = false }
}
watch(tab,()=>{ page.value=1 })
watch([account.isAdmin,tab,page],load,{immediate:true})
function edit(invite?: AccountInvitation) {
  editing.value = invite || null; modalError.value=''
  Object.assign(form,{code:invite?.code || '',valid_from:localInput(invite?.valid_from || new Date().toISOString()),valid_until:localInput(invite?.valid_until || new Date(Date.now()+7*86400000).toISOString()),note:invite?.note || ''})
  open.value = true
}
async function save() {
  saving.value=true; modalError.value=''
  try {
    const api = await account.client()
    const fields = { ...(form.code ? {code:form.code} : {}), valid_from:new Date(form.valid_from).toISOString(),valid_until:new Date(form.valid_until).toISOString(),note:form.note }
    let failure
    for (let attempt=0; attempt<3; attempt++) {
      const result = editing.value ? await api.from('account_invitations').update(fields).eq('id',editing.value.id).select('id').single() : await api.from('account_invitations').insert(fields).select('id').single()
      failure=result.error
      if (!failure || editing.value || form.code || failure.code!=='23505') break
    }
    if (failure) { modalError.value=failure.code==='23505' ? '邀请码已存在，请更换。' : '保存失败，请检查时间和权限。'; return }
    open.value=false; await load(); toast.add({title:'邀请码已保存',color:'success'})
  } catch { modalError.value='保存失败，请稍后重试。' }
  finally { saving.value=false }
}
async function remove() {
  if (!deleting.value) return
  saving.value=true; error.value=''
  try {
    const {error:failure}=await (await account.client()).rpc('account_delete_invitation',{target:deleting.value.id})
    if (failure) throw failure
    deleting.value=null; await load()
  } catch { error.value='删除失败，请重试。'; deleting.value=null }
  finally {saving.value=false}
}
</script>
<template>
  <AccountFrame title="管理中心" description="管理邀请码，查看已注册的用户。">
    <UPageCard v-if="!account.user.value" title="请先登录"><UButton to="/account/login?returnTo=%2Faccount%2Fadmin">前往登录</UButton></UPageCard>
    <UAlert v-else-if="!account.isAdmin.value" title="仅 admin 用户组可以访问管理中心。" color="neutral" />
    <div v-else class="space-y-stack">
      <UTabs v-model="tab" :items="[{label:'邀请码',value:'invitations'},{label:'注册用户',value:'users'}]" :content="false" />
      <div class="flex flex-wrap justify-between gap-inline"><p class="text-caption text-muted">共 {{ total }} 条 · 时间显示为 {{ timezone }}</p><div class="flex gap-2"><UButton color="neutral" variant="outline" :loading="loading" @click="load">刷新</UButton><UButton v-if="tab==='invitations'" @click="edit()">创建邀请码</UButton></div></div>
      <UAlert v-if="error" :title="error" color="error" />
      <UTable v-if="tab==='invitations'" :data="invitations" :columns="invitationColumns" :loading="loading" empty="暂无邀请码。" class="border border-default rounded-lg">
        <template #status-cell="{row}"><UBadge color="neutral" variant="soft">{{inviteStatus(row.original)}}</UBadge></template>
        <template #actions-cell="{row}"><div class="flex gap-2"><UButton color="neutral" variant="outline" @click="edit(row.original)">详情／修改</UButton><UButton color="error" variant="outline" @click="deleting=row.original">删除</UButton></div></template>
      </UTable>
      <UTable v-else :data="users" :columns="userColumns" :loading="loading" empty="暂无注册用户。" class="border border-default rounded-lg">
        <template #avatar-cell="{row}"><UAvatar :src="account.avatarUrl(row.original.avatar_path)" :alt="row.original.nickname" icon="i-lucide-user-round" /></template>
        <template #user_group-cell="{row}"><UBadge variant="soft">{{row.original.user_group}}</UBadge></template>
      </UTable>
      <UPagination v-if="total>20" v-model:page="page" :total="total" :items-per-page="20" :sibling-count="1" />
    </div>
    <UModal v-model:open="open" :title="editing ? '邀请码详情与修改' : '创建邀请码'" description="有效期按当前时区输入。每个邀请码只能成功注册一次。">
      <template #body>
        <UForm :schema="schema" :state="form" class="space-y-4" @submit="save">
          <UFormField label="邀请码" name="code" description="创建时留空可自动生成。已使用的邀请码不能修改。"><UInput v-model="form.code" maxlength="6" :disabled="Boolean(editing?.used_at)" class="w-full" @blur="form.code=form.code.toUpperCase()" /></UFormField>
          <UFormField label="开始时间" name="valid_from" required><UInput v-model="form.valid_from" type="datetime-local" class="w-full" /></UFormField>
          <UFormField label="结束时间" name="valid_until" required><UInput v-model="form.valid_until" type="datetime-local" class="w-full" /></UFormField>
          <UFormField label="备注" name="note"><UTextarea v-model="form.note" :rows="3" class="w-full" /></UFormField>
          <dl v-if="editing" class="text-caption text-muted space-y-2 break-all"><dt>ID</dt><dd>{{editing.id}}</dd><dt>创建者</dt><dd>{{editing.created_by || '系统初始化'}}</dd><dt>创建时间／更新时间</dt><dd>{{date(editing.created_at)}} / {{date(editing.updated_at)}}</dd><dt>使用者</dt><dd>{{editing.used_by || '—'}}</dd><dt>使用时间</dt><dd>{{date(editing.used_at)}}</dd><dt>状态</dt><dd>{{inviteStatus(editing)}}</dd></dl>
          <UAlert v-if="modalError" :title="modalError" color="error" />
          <div class="flex gap-inline"><UButton type="submit" :loading="saving">保存邀请码</UButton><UButton color="neutral" variant="ghost" @click="open=false">取消</UButton></div>
        </UForm>
      </template>
    </UModal>
    <UModal :open="Boolean(deleting)" title="删除邀请码" description="删除后该邀请码不能再用于注册，已注册的账号不受影响。" @update:open="value=>{if(!value)deleting=null}">
      <template #body><p>确定删除 {{deleting?.code}}？</p></template>
      <template #footer><UButton color="error" :loading="saving" @click="remove">确认删除</UButton><UButton color="neutral" variant="ghost" @click="deleting=null">取消</UButton></template>
    </UModal>
  </AccountFrame>
</template>
