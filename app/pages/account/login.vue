<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, safeReturnTo } from '#shared/account'
import AccountFrame from '~/components/account/AccountFrame.vue'
const account = useAccount(), route = useRoute()
const error = ref(''), busy = ref(false)
const destination = computed(() => safeReturnTo(route.query.returnTo))
async function submit(event: FormSubmitEvent<{ email:string, password:string }>) {
  const state = event.data
  busy.value = true; error.value = ''
  try {
    const { error: failure } = await (await account.client()).auth.signInWithPassword({ email: state.email.trim(), password: state.password })
    if (failure) { error.value = failure.status === 429 ? '尝试过于频繁，请稍后重试。' : '登录失败，请检查邮箱和密码。'; return }
    await account.refreshProfile()
    await navigateTo(destination.value)
  } catch { error.value = '登录服务暂时不可用，请稍后重试。' }
  finally { busy.value = false }
}
</script>
<template>
  <AccountFrame title="登录" description="使用邮箱和密码登录赫特维拉。">
    <UPageCard v-if="account.user.value" title="你已登录"><UButton :to="destination">继续阅读</UButton></UPageCard>
    <UPageCard v-else>
      <UAuthForm :schema="loginSchema" :fields="[{ name:'email',type:'email',label:'邮箱',required:true,autocomplete:'email' },{ name:'password',type:'password',label:'密码',required:true,autocomplete:'current-password' }]" :submit="{ label:'登录',loading:busy }" @submit="submit">
        <template #validation><UAlert v-if="error" :title="error" color="error" variant="subtle" /></template>
        <template #footer><p class="text-caption text-muted">暂不支持邮件找回密码。</p><UButton :to="{ path:'/account/register',query:{ returnTo:destination } }" variant="link">使用邀请码注册</UButton></template>
      </UAuthForm>
    </UPageCard>
  </AccountFrame>
</template>
