<script setup lang="ts">
const props = defineProps<{ title: string, description?: string }>()
const account = useAccount()
onMounted(account.initialize)
useSeoMeta({ title: () => props.title, robots: 'noindex, nofollow' })
</script>
<template>
  <main id="main" class="shell py-section" data-pagefind-ignore>
    <div class="max-w-reading mx-auto">
      <p class="eyebrow mb-3">HETWILA ACCOUNT</p>
      <h1 class="section-title">{{ title }}</h1>
      <p v-if="description" class="mt-4 text-muted leading-copy">{{ description }}</p>
      <nav aria-label="用户中心导航" class="flex flex-wrap gap-inline my-stack">
        <UButton to="/account" color="neutral" variant="outline">个人中心</UButton>
        <UButton v-if="account.isAdmin.value" to="/account/admin" color="neutral" variant="outline">管理中心</UButton>
        <UButton to="/" color="neutral" variant="link">返回网站</UButton>
      </nav>
      <noscript><p class="my-stack">账号功能需要启用 JavaScript；百科、故事和论坛仍可直接阅读。</p></noscript>
      <ClientOnly>
        <UAlert v-if="!account.configured" title="账号服务尚未配置" description="管理员配置完成后即可使用注册与登录功能。" color="neutral" variant="subtle" />
        <p v-else-if="!account.ready.value" role="status" class="py-stack text-muted">正在读取登录状态…</p>
        <div v-else><UAlert v-if="account.loadError.value" :title="account.loadError.value" color="error" variant="subtle" class="mb-stack" /><slot /></div>
        <template #fallback><p role="status" class="py-stack text-muted">正在准备账号功能…</p></template>
      </ClientOnly>
    </div>
  </main>
</template>
