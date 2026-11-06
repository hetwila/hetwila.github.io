<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { editorLink, needsMarkdownMode, type EditorCatalogue } from '#shared/editor'
import ReadingMarkdown from '~/components/private/ReadingMarkdown.vue'
const value = defineModel<string>({ required: true })
const props = defineProps<{ label: string; catalogue: EditorCatalogue; forum?: boolean }>()
const uniqueId = useId()
const mode = ref('visual'), rich = useTemplateRef('rich'), text = useTemplateRef('text')
const forcedSource = computed(() => needsMarkdownMode(value.value))
const actualMode = computed(() => forcedSource.value && mode.value === 'visual' ? 'source' : mode.value)
const linking = ref(false), linkTarget = ref(''), linkText = ref(''), linkError = ref('')
let selection = { start: 0, end: 0 }
const items: EditorToolbarItem[][] = [
  [{ kind: 'undo', icon: 'i-lucide-undo', 'aria-label': '撤销' }, { kind: 'redo', icon: 'i-lucide-redo', 'aria-label': '重做' }],
  [{ kind: 'heading', level: 2, label: '标题', 'aria-label': '二级标题' }, { kind: 'heading', level: 3, label: '小节', 'aria-label': '小节（三级标题）' }, { kind: 'paragraph', label: '正文' }],
  [{ kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': '加粗' }, { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', 'aria-label': '斜体' }, { kind: 'blockquote', icon: 'i-lucide-quote', 'aria-label': '引用' }, { kind: 'bulletList', icon: 'i-lucide-list', 'aria-label': '无序列表' }, { kind: 'orderedList', icon: 'i-lucide-list-ordered', 'aria-label': '有序列表' }],
]
const links = computed(() => [
  ...props.catalogue.pages.filter(p => props.forum || p.kind !== 'forum').flatMap(p => [{ label: p.title, value: p.path }, ...p.anchors.map(a => ({ label: `${p.title} · ${a}`, value: `${p.path}#${a}` }))]),
])
function openLink() {
  const textarea = text.value?.textareaRef
  selection = { start: textarea?.selectionStart ?? value.value.length, end: textarea?.selectionEnd ?? value.value.length }
  linkText.value = actualMode.value === 'source' ? value.value.slice(selection.start, selection.end) : rich.value?.editor?.state.doc.textBetween(rich.value.editor.state.selection.from, rich.value.editor.state.selection.to) || ''
  linkTarget.value = ''; linkError.value = ''; linking.value = true
}
function insertLink() {
  try {
    if (!linkTarget.value.trim()) throw new Error('请选择或填写链接地址。')
    const markdown = editorLink(linkText.value || links.value.find(l => l.value === linkTarget.value)?.label || linkTarget.value, linkTarget.value)
    if (actualMode.value === 'visual' && rich.value?.editor) rich.value.editor.chain().focus().insertContent(markdown, { contentType: 'markdown' }).run()
    else value.value = value.value.slice(0, selection.start) + markdown + value.value.slice(selection.end)
    linking.value = false
  } catch (e) { linkError.value = e instanceof Error ? e.message : '无法插入链接。' }
}
</script>
<template>
  <section class="space-y-3" :aria-label="label">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold text-highlighted">{{ label }}</h2><div class="flex flex-wrap gap-2" role="group" :aria-label="`${label}编辑模式`"><UButton v-for="item in [{ value: 'visual', label: '可视编辑' }, { value: 'source', label: 'Markdown' }, { value: 'preview', label: '阅读预览' }]" :key="item.value" :variant="actualMode === item.value ? 'soft' : 'ghost'" color="neutral" :aria-pressed="actualMode === item.value" :disabled="item.value === 'visual' && forcedSource" @click="mode = item.value">{{ item.label }}</UButton></div></div>
    <p v-if="forcedSource" class="text-caption text-muted">此段包含表格、锚点或其他需保留的 Markdown 结构，使用源码编辑与阅读预览。</p>
    <UButton v-if="actualMode !== 'preview'" color="neutral" variant="outline" icon="i-lucide-link" @click="openLink">插入链接</UButton>
    <UEditor v-if="actualMode === 'visual'" ref="rich" v-slot="{ editor }" v-model="value" content-type="markdown" :mention="false" :image="false" :starter-kit="{ heading: { levels: [2, 3, 4, 5, 6] }, underline: false, link: { openOnClick: false, autolink: false, protocols: ['http', 'https'] } }" :editor-props="{ attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true' } }" :ui="{ base: 'min-h-64 p-panel focus-visible:outline-primary' }" class="rounded-card border border-default bg-raised">
      <UEditorToolbar :editor="editor" :items="items" :ui="{ root: 'flex-wrap gap-1 border-b border-default p-2' }" />
    </UEditor>
    <UTextarea v-else-if="actualMode === 'source'" ref="text" v-model="value" :aria-label="`${label} Markdown`" class="w-full font-mono" :rows="14" />
    <ReadingMarkdown v-else :source="value" :options="{ prefix: `editor-preview-${uniqueId}` }" class="article-prose rounded-card border border-default bg-raised p-panel" />
    <UModal v-model:open="linking" title="插入链接" description="选择站内文章或段落，也可以填写完整的外部网址。">
      <template #body><form :id="`editor-link-${uniqueId}`" class="space-y-4" @submit.prevent="insertLink"><UFormField label="站内目标"><USelectMenu v-model="linkTarget" :items="links" value-key="value" class="w-full" placeholder="搜索文章、来源或段落" /></UFormField><UFormField label="链接地址"><UInput v-model="linkTarget" class="w-full" /></UFormField><UFormField label="链接文字"><UInput v-model="linkText" class="w-full" placeholder="留空时使用目标名称" /></UFormField><UAlert v-if="linkError" :title="linkError" color="error" /></form></template>
      <template #footer><UButton type="submit" :form="`editor-link-${uniqueId}`">插入</UButton><UButton color="neutral" variant="ghost" @click="linking = false">取消</UButton></template>
    </UModal>
  </section>
</template>
