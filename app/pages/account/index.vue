<script setup lang="ts">
import { z } from 'zod'
import { nicknameSchema, changePasswordSchema, safeReturnTo } from '#shared/account'
import AccountFrame from '~/components/account/AccountFrame.vue'
import AvatarEditor from '~/components/account/AvatarEditor.vue'
const account = useAccount(), route = useRoute(), toast = useToast()
const state = reactive({ nickname:'' }), passwords = reactive({ oldPassword:'',password:'',confirmPassword:'' })
const avatar = ref<Blob | null>(null), cropping = ref(false), busy = ref(false), passwordBusy = ref(false), error = ref(''), passwordError = ref('')
const destination = computed(() => safeReturnTo(route.query.returnTo))
watch(account.profile, value => { if (value) state.nickname = value.nickname }, { immediate:true })
async function save() {
  busy.value = true; error.value = ''
  try {
    const { data, error: failure } = await (await account.client()).from('account_profiles').update({ nickname:state.nickname.trim() }).eq('id',account.user.value!.id).select('id').single()
    if (failure || !data) throw new Error('昵称保存失败，请重试。')
    if (avatar.value) { await account.uploadAvatar(avatar.value); avatar.value = null }
    await account.refreshProfile()
    toast.add({ title:'个人资料已保存',color:'success' })
  } catch (e) { error.value = e instanceof Error ? e.message : '保存未完成。' }
  finally { busy.value = false }
}
async function removeAvatar() {
  busy.value = true; error.value = ''
  try { await account.uploadAvatar(null); avatar.value = null; toast.add({ title:'已恢复默认头像',color:'success' }) }
  catch (e) { error.value = e instanceof Error ? e.message : '操作未完成。' }
  finally { busy.value = false }
}
async function changePassword() {
  passwordBusy.value = true; passwordError.value = ''
  try {
    const { error: failure } = await (await account.client()).auth.updateUser({ password:passwords.password,current_password:passwords.oldPassword })
    if (failure) { passwordError.value = '密码修改失败，请检查当前密码，并确保新密码符合要求。'; return }
    passwords.oldPassword = ''; passwords.password = ''; passwords.confirmPassword = ''
    toast.add({ title:'密码已修改',color:'success' })
  } catch { passwordError.value = '服务暂时不可用，请稍后重试。' }
  finally { passwordBusy.value = false }
}
async function logout() { try { await account.logout() } catch { error.value = '退出失败，请重试。' } }
</script>
<template>
  <AccountFrame title="个人中心" description="管理你的昵称、头像与登录密码。">
    <UPageCard v-if="!account.user.value" title="欢迎来到赫特维拉">
      <div class="flex flex-wrap gap-inline"><UButton :to="{path:'/account/login',query:{returnTo:destination}}">登录</UButton><UButton :to="{path:'/account/register',query:{returnTo:destination}}" variant="outline">邀请码注册</UButton></div>
    </UPageCard>
    <div v-else class="space-y-stack">
      <UPageCard v-if="account.profile.value">
        <div class="flex items-center gap-4"><UAvatar :src="account.avatarUrl(account.profile.value.avatar_path)" icon="i-lucide-user-round" :alt="account.profile.value.nickname" size="2xl" /><div class="min-w-0"><h2 class="text-xl font-semibold break-words">{{ account.profile.value.nickname }}</h2><p class="text-caption text-muted break-all">{{ account.profile.value.email }}</p><UBadge class="mt-2" variant="soft">用户组：{{ account.profile.value.user_group }}</UBadge></div></div>
        <UButton color="neutral" variant="outline" @click="logout">退出登录</UButton>
      </UPageCard>
      <UPageCard title="个人资料">
        <UForm :schema="z.object({ nickname:nicknameSchema })" :state="state" class="space-y-stack" @submit="save">
          <UFormField label="昵称" name="nickname" required><UInput v-model="state.nickname" autocomplete="nickname" class="w-full" /></UFormField>
          <UFormField label="头像"><AvatarEditor :key="account.profile.value?.avatar_path || 'default'" v-model="avatar" :current-url="account.avatarUrl(account.profile.value?.avatar_path)" @editing="cropping=$event" /></UFormField>
          <UButton v-if="account.profile.value?.avatar_path" color="neutral" variant="outline" :disabled="busy" @click="removeAvatar">恢复默认头像</UButton>
          <UAlert v-if="error" :title="error" color="error" variant="subtle" />
          <UButton type="submit" :loading="busy" :disabled="cropping">保存资料</UButton>
        </UForm>
      </UPageCard>
      <UPageCard title="修改密码" description="输入当前密码后才能设置新密码。暂不支持邮件找回。">
        <UForm :schema="changePasswordSchema" :state="passwords" class="space-y-stack" @submit="changePassword">
          <UFormField name="oldPassword" label="当前密码" required><UInput v-model="passwords.oldPassword" type="password" autocomplete="current-password" class="w-full" /></UFormField>
          <UFormField name="password" label="新密码" required><UInput v-model="passwords.password" type="password" autocomplete="new-password" class="w-full" /></UFormField>
          <UFormField name="confirmPassword" label="再次输入新密码" required><UInput v-model="passwords.confirmPassword" type="password" autocomplete="new-password" class="w-full" /></UFormField>
          <UAlert v-if="passwordError" :title="passwordError" color="error" variant="subtle" />
          <UButton type="submit" :loading="passwordBusy">修改密码</UButton>
        </UForm>
      </UPageCard>
    </div>
  </AccountFrame>
</template>
