<script setup lang="ts">
import AccountFrame from '~/components/account/AccountFrame.vue'
import PrivateContentList from '~/components/private/PrivateContentList.vue'
const account = useAccount()
</script>
<template><AccountFrame :title="account.isAdmin.value ? '内容管理与投稿' : '我的投稿'" :description="account.isAdmin.value ? '管理全部私有文章、论坛帖子和逐篇阅读权限。' : '保存草稿并查看自己的投稿。投稿资格由用户组决定。'"><PrivateContentList manage /></AccountFrame></template>
