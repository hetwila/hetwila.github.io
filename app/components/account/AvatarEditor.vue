<script setup lang="ts">
import type Cropper from 'cropperjs'
const model = defineModel<Blob | null>({ default: null })
const emit = defineEmits<{ editing: [value: boolean] }>()
const props = defineProps<{ currentUrl?: string }>()
const file = ref<File | null>(null), error = ref(''), editing = ref(false), busy = ref(false), preview = ref('')
const host = useTemplateRef<HTMLDivElement>('host')
watch(editing, value => emit('editing', value))
let cropper: Cropper | undefined, originalUrl = '', imageWidth = 0, generation = 0
function cleanup() { if (originalUrl) URL.revokeObjectURL(originalUrl); originalUrl = ''; cropper = undefined; host.value?.replaceChildren() }
watch(file, async value => {
  const version = ++generation
  error.value = ''
  if (!value) return
  if (!['image/jpeg','image/png','image/webp'].includes(value.type) || value.size > 10 * 1024 * 1024) { error.value = '请选择不超过10 MB的 JPEG、PNG 或 WebP 图片。'; return }
  cleanup(); editing.value = true; busy.value = true
  await nextTick()
  if (version !== generation) return
  originalUrl = URL.createObjectURL(value)
  try {
    const image = new Image(); image.src = originalUrl; image.alt = '待裁剪的头像'
    await image.decode()
    if (version !== generation) return
    if (image.naturalWidth * image.naturalHeight > 32000000) throw new Error('图片分辨率过高，请先缩小至3200万像素以内。')
    imageWidth = image.naturalWidth
    const { default: CropperClass } = await import('cropperjs')
    if (version !== generation) return
    cropper = new CropperClass(image, { container: host.value!, template: '<cropper-canvas style="height:100%"><cropper-image initial-center-size="contain"></cropper-image><cropper-selection initial-coverage="0.5" aspect-ratio="1" movable resizable keyboard><cropper-grid role="grid" covered></cropper-grid><cropper-crosshair centered></cropper-crosshair><cropper-handle action="move" plain></cropper-handle><cropper-handle action="se-resize"></cropper-handle></cropper-selection></cropper-canvas>' })
    await cropper.getCropperImage()!.$ready()
    if (version !== generation) return
    const selection = cropper.getCropperSelection()!, canvas = cropper.getCropperCanvas()!, imageElement = cropper.getCropperImage()!
    selection.themeColor = 'var(--ui-primary)'
    selection.addEventListener('change', ((event: CustomEvent) => {
      const c = canvas.getBoundingClientRect(), i = imageElement.getBoundingClientRect(), s = event.detail
      if (s.x < i.left-c.left-0.5 || s.y < i.top-c.top-0.5 || s.x+s.width > i.right-c.left+0.5 || s.y+s.height > i.bottom-c.top+0.5) event.preventDefault()
    }) as EventListener)
    const c = canvas.getBoundingClientRect(), i = imageElement.getBoundingClientRect(), size = Math.min(i.width, i.height)
    selection.$change(i.left-c.left+(i.width-size)/2, i.top-c.top+(i.height-size)/2, size, size, 1)
  } catch (e) { if (version === generation) { error.value = e instanceof Error ? e.message : '图片无法读取。'; editing.value = false; cleanup() } }
  finally { if (version === generation) busy.value = false }
})
function move(x: number, y: number) { cropper?.getCropperSelection()?.$move(x, y) }
function zoom(change: number) { cropper?.getCropperSelection()?.$zoom(change) }
async function confirm() {
  if (!cropper) return
  busy.value = true
  try {
    const selection = cropper.getCropperSelection()!, image = cropper.getCropperImage()!
    const scale = image.getBoundingClientRect().width / imageWidth
    const size = Math.max(1, Math.min(256, Math.floor(selection.width / scale)))
    const canvas = await selection.$toCanvas({ width: size, height: size })
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片编码失败。')), 'image/png'))
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(blob); model.value = blob; editing.value = false; cleanup()
  } catch { error.value = '裁剪失败，请重新选择图片。' }
  finally { busy.value = false }
}
function cancel() { generation++; busy.value = false; editing.value = false; file.value = null; cleanup() }
onBeforeUnmount(() => { generation++; cleanup(); if (preview.value) URL.revokeObjectURL(preview.value) })
</script>
<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4"><UAvatar :src="preview || props.currentUrl" icon="i-lucide-user-round" alt="头像预览" size="2xl" /><p class="text-caption text-muted">可选。未设置时使用默认头像。<br>保存为正方形，最大256×256像素。</p></div>
    <UFileUpload v-model="file" accept="image/png,image/jpeg,image/webp" label="选择头像" description="JPEG、PNG 或 WebP，最大10 MB" :preview="false" />
    <p v-if="error" role="alert" class="text-error text-caption">{{ error }}</p>
    <div v-if="editing" class="space-y-4">
      <p class="text-caption leading-copy">拖动裁剪框调整位置或尺寸，也可以使用下方按钮。确认后才会使用裁剪结果。</p>
      <div ref="host" class="h-80 overflow-hidden border border-default rounded-lg bg-muted" aria-label="头像裁剪区域" />
      <div class="flex flex-wrap gap-2" aria-label="裁剪控制">
        <UButton v-for="direction in [{ name:'向左',x:-5,y:0,icon:'i-lucide-arrow-left' },{ name:'向上',x:0,y:-5,icon:'i-lucide-arrow-up' },{ name:'向下',x:0,y:5,icon:'i-lucide-arrow-down' },{ name:'向右',x:5,y:0,icon:'i-lucide-arrow-right' }]" :key="direction.name" :aria-label="direction.name" :icon="direction.icon" color="neutral" variant="outline" :disabled="busy" @click="move(direction.x,direction.y)" />
        <UButton color="neutral" variant="outline" :disabled="busy" @click="zoom(-0.1)">缩小裁剪框</UButton><UButton color="neutral" variant="outline" :disabled="busy" @click="zoom(0.1)">放大裁剪框</UButton>
      </div>
      <div class="flex gap-inline"><UButton :loading="busy" @click="confirm">确认裁剪</UButton><UButton color="neutral" variant="ghost" @click="cancel">取消裁剪</UButton></div>
    </div>
  </div>
</template>
