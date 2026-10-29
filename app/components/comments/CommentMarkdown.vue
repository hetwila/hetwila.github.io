<script lang="ts">
import { renderCommentMarkdown } from '#shared/comment-markdown'
export default defineComponent({
  props: { source: { type: String, required: true } },
  setup(props) {
    const content = computed(() => renderCommentMarkdown(props.source))
    return () => h('div', { class: 'comment-markdown' }, content.value)
  },
})
</script>
