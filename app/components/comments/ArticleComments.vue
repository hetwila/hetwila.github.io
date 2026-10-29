<script setup lang="ts">
import CommentSection from './CommentSection.vue'
const props = defineProps<{ articleUid: string }>()
const account = useAccount(), sectionId = ref(''), loading = ref(true), error = ref('')
let version = 0
async function load() {
  if (import.meta.server) return
  const current = ++version
  sectionId.value = ''; error.value = ''; loading.value = true
  try {
    if (!account.configured) throw new Error('unconfigured')
    const result = await (await account.client()).from('comment_articles').select('section_id').eq('article_uid', props.articleUid).maybeSingle()
    if (current !== version) return
    if (result.error) throw result.error
    sectionId.value = result.data?.section_id || ''
  } catch { if (current === version) error.value = '评论暂时无法读取，请稍后重试。' }
  finally { if (current === version) loading.value = false }
}
onMounted(load)
watch(() => props.articleUid, load)
onBeforeUnmount(() => { version++ })
</script>
<template>
  <div id="comments" class="mt-section border-t border-default pt-stack" data-pagefind-ignore>
    <CommentSection v-if="sectionId" :section-id="sectionId" />
    <section v-else class="space-y-4" aria-label="文章评论">
      <h2 class="section-title">评论</h2>
      <noscript><p>启用 JavaScript 后可查看和发表评论，正文阅读不受影响。</p></noscript>
      <p v-if="loading" role="status" class="text-copy text-muted">正在加载评论……</p>
      <template v-else-if="error"><UAlert :title="error" color="neutral" /><UButton variant="outline" @click="load">重新加载评论</UButton></template>
      <p v-else class="text-copy text-muted">这篇故事的评论区尚未开放。</p>
    </section>
  </div>
</template>
