<script setup lang="ts">
import { safeEditorTitle, type EditorDraft, type EditorCatalogue } from '#shared/editor'
import SourceReferences from './SourceReferences.vue'
import type { WikiMetadata } from '#shared/content-schema'
const props = defineProps<{ draft: EditorDraft; catalogue: EditorCatalogue }>()
const emit = defineEmits<{ anchor: [anchor: string] }>()
// A draft deliberately permits incomplete field values; export uses the shared schema.
type FormMetadata = Omit<WikiMetadata, 'entityType' | 'narrativeLayer'> & { entityType: WikiMetadata['entityType'] | 'story'; narrativeLayer: string; scopeUid?: string; community?: string; board?: string; originalFile?: string }
const m = computed(() => props.draft.metadata as FormMetadata)
const statuses = [{ value: 'draft', label: '草稿' }, { value: 'review', label: '待审核' }, { value: 'published', label: '已发布' }, { value: 'withdrawn', label: '已撤回' }]
const targets = computed(() => [...new Map([...props.catalogue.pages.filter(p => p.uid && p.kind !== 'forum'), ...props.catalogue.events].map(p => [p.uid!, { label: p.title + ' · ' + p.uid, value: p.uid! }])).values()])
function fillName() {
  if (!m.value.routeKey) m.value.routeKey = safeEditorTitle(m.value.title)
  if (props.draft.kind === 'forum' && !m.value.originalFile) m.value.originalFile = `${m.value.routeKey}.md`
}
function uidChanged() { if (props.draft.kind !== 'wiki') m.value.scopeUid = m.value.uid }
function addEvent() {
  const id = crypto.randomUUID()
  m.value.events.push({ uid: `event:${id}`, title: '', description: '', anchor: `event-${id}`, aliases: [], sourceIds: [], sourceRefs: [], worldTime: { label: '', precision: 'year', year: 0 } })
}
</script>
<template>
  <div class="space-y-stack">
    <UPageCard title="基本资料">
      <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="标题" required class="sm:col-span-2"><UInput v-model="m.title" class="w-full" @blur="fillName" /></UFormField>
        <UFormField label="文件名与路径" required description="不含 .md；保留中文标题。"><UInput v-model="m.routeKey" class="w-full" /></UFormField>
        <UFormField label="分类" required><UInput v-model="m.category" class="w-full" /></UFormField>
        <UFormField label="简介" required class="sm:col-span-2"><UTextarea v-model="m.description" class="w-full" :rows="3" /></UFormField>
        <template v-if="draft.kind === 'forum'"><UFormField label="社区" required><UInput v-model="m.community" class="w-full" /></UFormField><UFormField label="版块" required><UInput v-model="m.board" class="w-full" /></UFormField><UFormField label="配套原稿文件名" required class="sm:col-span-2" description="用于 sources/forum，需包含 .md。"><UInput v-model="m.originalFile" class="w-full" /></UFormField></template>
        <template v-else>
          <UFormField v-if="draft.kind === 'wiki'" label="条目类型"><USelect v-model="m.entityType" :items="[{ value: 'concept', label: '概念' }, { value: 'person', label: '人物' }, { value: 'institution', label: '机构' }, { value: 'event', label: '独立事件' }]" class="w-full" /></UFormField>
          <UFormField label="名称性质"><USelect v-model="m.nameStatus" :items="[{ value: 'official', label: '正式名称' }, { value: 'working', label: '暂定名称' }, { value: 'descriptive', label: '描述性名称' }]" class="w-full" /></UFormField>
          <UFormField v-if="draft.kind === 'wiki'" label="事实状态"><USelect v-model="m.factStatus" :items="[{ value: 'canon', label: '已确认设定' }, { value: 'open', label: '未定' }, { value: 'working', label: '工作草案' }, { value: 'deprecated', label: '已弃用' }]" class="w-full" /></UFormField>
          <UFormField label="别名" description="输入后按回车添加。" class="sm:col-span-2"><UInputTags v-model="m.aliases" class="w-full" /></UFormField>
          <UFormField label="来源编号" description="如 H31-01；只填写有依据的编号。" class="sm:col-span-2"><UInputTags v-model="m.sourceIds" class="w-full" /></UFormField>
        </template>
      </div>
    </UPageCard>
    <UPageCard v-if="draft.kind !== 'forum'" title="时代与来源" description="选择已收录责任原文及其段落。故事的事实状态自动保持为本篇虚构。">
      <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"><UFormField label="时代说明" required class="sm:col-span-2"><UInput v-model="m.worldTime.label" class="w-full" placeholder="例如：现代，或1747年" /></UFormField><UFormField label="时间精度"><USelect v-model="m.worldTime.precision" :items="[{ value: 'period', label: '时代范围' }, { value: 'year', label: '具体年份' }]" class="w-full" /></UFormField><UFormField v-if="m.worldTime.precision === 'year'" label="纪年" required description="支持0年与负数年份。"><UInput v-model="m.worldTime.year" type="number" step="1" class="w-full" /></UFormField></div>
      <SourceReferences v-model="m.sourceRefs" :catalogue="catalogue" />
    </UPageCard>
    <UPageCard v-if="draft.kind !== 'forum'" title="作品关系" description="正文中的站内链接会自动建立 mentions；这里可补充明确的主题关系。">
      <fieldset v-for="(relation, i) in m.relations" :key="i" class="grid min-w-0 grid-cols-1 gap-3 rounded-card border border-default p-4 sm:grid-cols-2"><legend class="px-2 text-caption text-muted">关系 {{ i + 1 }}</legend><UFormField :label="`关系${i + 1}类型`"><USelect v-model="relation.type" :items="[{ value: 'concerns', label: '围绕主题' }, { value: 'mentions', label: '提及' }, ...(draft.kind === 'story' ? [{ value: 'depicts', label: '描写事件' }] : [])]" class="w-full" /></UFormField><UFormField :label="`关系${i + 1}目标`"><USelectMenu v-model="relation.target" :items="relation.type === 'depicts' ? targets.filter(t => catalogue.events.some(e => e.uid === t.value)) : targets" value-key="value" class="w-full" /></UFormField><div><UButton color="neutral" variant="ghost" :aria-label="`移除关系${i + 1}`" @click="m.relations.splice(i, 1)">移除关系</UButton></div></fieldset>
      <UButton color="neutral" variant="outline" @click="m.relations.push({ type: draft.kind === 'story' ? 'depicts' : 'concerns', target: '' })">添加关系</UButton>
    </UPageCard>
    <UPageCard v-if="draft.kind === 'wiki'" title="正文中的事件" description="小事件登记到所属条目，并用正文锚点定位。没有事件时保持为空。">
      <details v-for="(event, i) in m.events" :key="i" class="rounded-card border border-default p-4" open>
        <summary class="cursor-pointer font-medium">{{ event.title || `事件 ${i + 1}` }}</summary>
        <div class="mt-4 space-y-4">
          <UFormField :label="`事件${i + 1}标题`"><UInput v-model="event.title" class="w-full" /></UFormField><UFormField :label="`事件${i + 1}简介`"><UTextarea v-model="event.description" class="w-full" /></UFormField>
          <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"><UFormField :label="`事件${i + 1}UID`"><UInput v-model="event.uid" class="w-full" /></UFormField><UFormField :label="`事件${i + 1}锚点`"><UInput v-model="event.anchor" class="w-full" /></UFormField><UFormField :label="`事件${i + 1}时代说明`"><UInput v-model="event.worldTime.label" class="w-full" /></UFormField><UFormField :label="`事件${i + 1}纪年`"><UInput v-model="event.worldTime.year" type="number" step="1" class="w-full" /></UFormField></div>
          <UFormField :label="`事件${i + 1}别名`"><UInputTags v-model="event.aliases" class="w-full" /></UFormField><UFormField :label="`事件${i + 1}来源编号`"><UInputTags v-model="event.sourceIds" class="w-full" /></UFormField><SourceReferences v-model="event.sourceRefs" :catalogue="catalogue" :label="`事件${i + 1}来源`" />
          <div class="flex flex-wrap gap-2"><UButton color="neutral" variant="outline" @click="emit('anchor', event.anchor)">在正文末尾添加锚点</UButton><UButton color="error" variant="ghost" @click="m.events.splice(i, 1)">移除此事件登记</UButton></div>
        </div>
      </details>
      <UButton color="neutral" variant="outline" @click="addEvent">添加正文事件</UButton>
    </UPageCard>
    <UPageCard title="发布与标识" description="这里的状态写入下载文件；下载或云端暂存不会直接发布内容。">
      <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"><UFormField label="发布状态"><USelect v-model="m.publicationStatus" :items="statuses" class="w-full" /></UFormField><UFormField label="可见性"><USelect v-model="m.visibility" :items="[{ value: 'public', label: '公开' }, { value: 'private', label: '私密草稿' }]" class="w-full" /></UFormField><UFormField label="修订号"><UInput v-model="m.revision" type="number" min="1" step="1" class="w-full" /></UFormField><UFormField label="设定版本"><UInput :model-value="m.settingVersion" readonly class="w-full" /></UFormField><UFormField label="稳定 UID" description="已有文章修改时保留原 UID。" class="sm:col-span-2"><UInput v-model="m.uid" class="w-full" @update:model-value="uidChanged" /></UFormField></div>
      <p class="text-caption text-muted break-all">叙事层：{{ m.narrativeLayer }}<template v-if="m.scopeUid"> · 作品范围：{{ m.scopeUid }}</template></p>
    </UPageCard>
  </div>
</template>
