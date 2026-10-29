<script setup lang="ts">
import { registerSchema, safeReturnTo } from '#shared/account'
import AccountFrame from '~/components/account/AccountFrame.vue'
import AvatarEditor from '~/components/account/AvatarEditor.vue'
const account = useAccount(), route = useRoute(), toast = useToast()
const state = reactive({ email:'',password:'',confirmPassword:'',nickname:'',inviteCode:'' })
const avatar = ref<Blob | null>(null), token = ref(''), error = ref(''), busy = ref(false), created = ref(false), cropping = ref(false)
const challengeVersion = ref(0)
const destination = computed(() => safeReturnTo(route.query.returnTo))
const captchaConfigured = Boolean(useRuntimeConfig().public.turnstile.siteKey)
function resetChallenge() { token.value = ''; challengeVersion.value++ }
async function submit() {
  if (!created.value && !token.value) { error.value = '请先完成人机验证。'; return }
  busy.value = true; error.value = ''
  try {
    if (!created.value) {
      await account.invoke('account-register', { email:state.email.trim(),password:state.password,nickname:state.nickname.trim(),inviteCode:state.inviteCode.trim(),turnstileToken:token.value })
      created.value = true
    }
    const { error: loginError } = await (await account.client()).auth.signInWithPassword({ email:state.email.trim(),password:state.password })
    if (loginError) { error.value = '账号已经创建，自动登录未完成。可以重试登录，无需再次使用邀请码。'; return }
    await account.refreshProfile()
    if (avatar.value) {
      try { await account.uploadAvatar(avatar.value) }
      catch { toast.add({ title:'账号已创建，头像上传未完成',description:'可在个人中心重新设置头像。',color:'warning' }) }
    }
    await navigateTo(destination.value)
  } catch (e) { error.value = e instanceof Error ? e.message : '注册未完成，请重试。' }
  finally { busy.value = false; if (!created.value) resetChallenge() }
}
</script>
<template>
  <AccountFrame title="注册" description="使用邀请码加入。新账号的用户组为 guest。">
    <UPageCard v-if="account.user.value && !busy" title="你已登录"><UButton :to="destination">继续阅读</UButton></UPageCard>
    <UPageCard v-else>
      <UForm :schema="registerSchema" :state="state" class="space-y-stack" @submit="submit">
        <UFormField name="email" label="邮箱" required><UInput v-model="state.email" type="email" autocomplete="email" :disabled="created" class="w-full" /></UFormField>
        <UFormField name="nickname" label="昵称" description="昵称可以与其他用户相同，最多50个字符。" required><UInput v-model="state.nickname" autocomplete="nickname" :disabled="created" class="w-full" /></UFormField>
        <UFormField name="password" label="密码" description="至少8个字符，最多72字节。" required><UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" /></UFormField>
        <UFormField name="confirmPassword" label="再次输入密码" required><UInput v-model="state.confirmPassword" type="password" autocomplete="new-password" class="w-full" /></UFormField>
        <UFormField name="inviteCode" label="邀请码" description="6位大写字母或数字，仅可使用一次。" required><UInput v-model="state.inviteCode" maxlength="6" autocapitalize="characters" :disabled="created" class="w-full" @blur="state.inviteCode = state.inviteCode.trim().toUpperCase()" /></UFormField>
        <UFormField label="头像"><AvatarEditor v-model="avatar" @editing="cropping = $event" /></UFormField>
        <div v-if="!created">
          <NuxtTurnstile v-if="captchaConfigured" :key="challengeVersion" v-model="token" :options="{ action:'register',size:'flexible','expired-callback':()=>token='','error-callback':()=>token='' }" />
          <UAlert v-else title="人机验证尚未配置，暂不能注册。" color="warning" />
        </div>
        <UAlert v-if="error" :title="error" color="error" variant="subtle" />
        <p class="text-caption text-muted leading-copy">目前无需邮件验证，暂不支持通过邮件找回密码。</p>
        <UButton type="submit" :loading="busy" :disabled="cropping || (!created && (!token || !captchaConfigured))" block>{{ created ? '登录并继续' : '注册并继续' }}</UButton>
        <UButton :to="{ path:'/account/login',query:{ returnTo:destination } }" variant="link">已有账号，前往登录</UButton>
      </UForm>
    </UPageCard>
  </AccountFrame>
</template>
