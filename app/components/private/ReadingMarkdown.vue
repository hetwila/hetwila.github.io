<script lang="ts">
import { renderReadingMarkdown, type ReadingMarkdownOptions } from '#shared/comment-markdown'
export default defineComponent({
  props: { source: { type: String, required: true }, options: { type: Object as PropType<ReadingMarkdownOptions>, required: true } },
  setup(props) {
    const content = computed(() => renderReadingMarkdown(props.source, props.options))
    return () => h('div', { class: 'reading-markdown' }, content.value.nodes)
  },
})
</script>
