<script setup lang="ts">
import type Cropper from 'cropperjs'
import type { CropperHandle } from 'cropperjs'
const model = defineModel<Blob | null>({ default: null })
const emit = defineEmits<{ editing: [value: boolean] }>()
const props = defineProps<{ currentUrl?: string }>()
const file = ref<File | null>(null), error = ref(''), editing = ref(false), busy = ref(false), preview = ref('')
const host = useTemplateRef<HTMLDivElement>('host')
const helpId = useId()
const drawing = ref(true), coverage = ref(80)
watch(editing, value => emit('editing', value))
let cropper: Cropper | undefined, originalUrl = '', imageWidth = 0, imageHeight = 0, generation = 0
let resizeObserver: ResizeObserver | undefined
function cleanup() {
  resizeObserver?.disconnect(); resizeObserver = undefined
  cropper?.destroy(); cropper = undefined
  if (originalUrl) URL.revokeObjectURL(originalUrl)
  originalUrl = ''; host.value?.replaceChildren()
}
function imageBounds() {
  const c = cropper!.getCropperCanvas()!.getBoundingClientRect(), i = cropper!.getCropperImage()!.getBoundingClientRect()
  return { x: i.left - c.left, y: i.top - c.top, width: i.width, height: i.height }
}
function setDrawing(value: boolean) {
  drawing.value = value
  const handle = cropper?.getCropperSelection()?.querySelector<CropperHandle>('[data-crop-drag]')
  if (handle) handle.action = value ? 'select' : 'move'
}
function reset() {
  if (!cropper) return
  const b = imageBounds(), size = Math.min(b.width, b.height) * 0.8
  cropper.getCropperSelection()!.$change(b.x + (b.width - size) / 2, b.y + (b.height - size) / 2, size, size)
  setDrawing(true)
}
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
    imageWidth = image.naturalWidth; imageHeight = image.naturalHeight
    const { default: CropperClass } = await import('cropperjs')
    if (version !== generation) return
    cropper = new CropperClass(image, { container: host.value!, template: `
      <cropper-canvas>
        <cropper-image initial-center-size="contain"></cropper-image>
        <cropper-shade theme-color="var(--ds-crop-shade)"></cropper-shade>
        <cropper-handle action="select" plain></cropper-handle>
        <cropper-selection aspect-ratio="1" movable resizable zoomable precise>
          <cropper-grid theme-color="var(--ds-crop-line-light)" aria-hidden="true" covered></cropper-grid>
          <cropper-handle action="select" data-crop-drag plain></cropper-handle>
          ${['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map(direction => `<cropper-handle action="${direction}-resize"></cropper-handle>`).join('')}
        </cropper-selection>
      </cropper-canvas>` })
    await cropper.getCropperImage()!.$ready()
    if (version !== generation) return
    const selection = cropper.getCropperSelection()!, canvas = cropper.getCropperCanvas()!, imageElement = cropper.getCropperImage()!
    // Clamp to the actual image, including the letterbox margins of tall/wide images.
    // Correct an overflowing gesture instead of rejecting it and appearing unresponsive.
    selection.addEventListener('change', ((event: CustomEvent) => {
      const b = imageBounds(), s = event.detail, max = Math.min(b.width, b.height)
      const size = Math.min(max, Math.max(b.width / imageWidth, s.width))
      const x = Math.max(b.x, Math.min(s.x, b.x + b.width - size)), y = Math.max(b.y, Math.min(s.y, b.y + b.height - size))
      if (Math.abs(x - s.x) > 0.01 || Math.abs(y - s.y) > 0.01 || Math.abs(size - s.width) > 0.01) {
        event.preventDefault()
        selection.$change(x, y, size, size)
        return
      }
      coverage.value = Math.max(1, Math.round(size / max * 100))
    }) as EventListener)
    // Keep the original drag anchor in all four directions. Cropper's default
    // select-to-resize handoff offsets upward/leftward selections on the first move.
    let drawStart: { x: number, y: number } | undefined
    canvas.addEventListener('action', ((event: CustomEvent) => {
      const { action, startX, startY, endX, endY } = event.detail
      if (action !== 'select') return
      event.preventDefault()
      const c = canvas.getBoundingClientRect(), b = imageBounds(), left = c.left + window.scrollX, top = c.top + window.scrollY
      drawStart ??= { x: Math.max(b.x, Math.min(startX - left, b.x + b.width)), y: Math.max(b.y, Math.min(startY - top, b.y + b.height)) }
      const dx = endX - left - drawStart.x, dy = endY - top - drawStart.y
      const size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)),
        dx < 0 ? drawStart.x - b.x : b.x + b.width - drawStart.x,
        dy < 0 ? drawStart.y - b.y : b.y + b.height - drawStart.y)
      selection.$change(dx < 0 ? drawStart.x - size : drawStart.x, dy < 0 ? drawStart.y - size : drawStart.y, size, size)
    }) as EventListener, { capture: true })
    canvas.addEventListener('actionend', () => { drawStart = undefined; setDrawing(false) })
    reset()
    // Preserve the chosen part of the original image across viewport/orientation changes.
    let canvasWidth = canvas.clientWidth, canvasHeight = canvas.clientHeight
    resizeObserver = new ResizeObserver(() => {
      if (canvasWidth === canvas.clientWidth && canvasHeight === canvas.clientHeight) return
      const b = imageBounds(), x = (selection.x - b.x) / b.width, y = (selection.y - b.y) / b.height, width = selection.width / b.width
      canvasWidth = canvas.clientWidth; canvasHeight = canvas.clientHeight
      const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight)
      imageElement.$setTransform(scale, 0, 0, scale, (canvasWidth - imageWidth) / 2, (canvasHeight - imageHeight) / 2)
      const next = imageBounds(), size = width * next.width
      selection.$change(next.x + x * next.width, next.y + y * next.height, size, size)
    })
    resizeObserver.observe(canvas)
  } catch (e) { if (version === generation) { error.value = e instanceof Error ? e.message : '图片无法读取。'; editing.value = false; cleanup() } }
  finally { if (version === generation) busy.value = false }
})
function resize(value: number | number[] | undefined) {
  const selection = cropper?.getCropperSelection()
  if (!selection || typeof value !== 'number') return
  const b = imageBounds(), size = Math.min(b.width, b.height) * value / 100
  selection.$change(selection.x + (selection.width - size) / 2, selection.y + (selection.height - size) / 2, size, size)
}
function onKeydown(event: KeyboardEvent) {
  const selection = cropper?.getCropperSelection()
  if (!selection || busy.value || event.altKey || event.ctrlKey || event.metaKey) return
  const step = event.shiftKey ? 10 : 1
  switch (event.key) {
    case 'ArrowLeft': selection.$move(-step, 0); break
    case 'ArrowRight': selection.$move(step, 0); break
    case 'ArrowUp': selection.$move(0, -step); break
    case 'ArrowDown': selection.$move(0, step); break
    case '+': case '=': selection.$zoom(0.05); break
    case '-': case '_': selection.$zoom(-0.05); break
    default: return
  }
  event.preventDefault()
}
async function confirm() {
  if (!cropper) return
  const version = generation
  busy.value = true
  try {
    const selection = cropper.getCropperSelection()!, image = cropper.getCropperImage()!
    const scale = image.getBoundingClientRect().width / imageWidth
    const size = Math.max(1, Math.min(256, Math.floor(selection.width / scale)))
    const canvas = await selection.$toCanvas({ width: size, height: size })
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片编码失败。')), 'image/png'))
    if (version !== generation) return
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(blob); model.value = blob; editing.value = false; cleanup()
  } catch { error.value = '裁剪失败，请重新选择图片。' }
  finally { if (version === generation) busy.value = false }
}
function cancel() { generation++; busy.value = false; editing.value = false; file.value = null; cleanup() }
onBeforeUnmount(() => { generation++; cleanup(); if (preview.value) URL.revokeObjectURL(preview.value) })
</script>
<template>
  <div class="avatar-editor space-y-4">
    <div class="flex items-center gap-4"><UAvatar :src="preview || props.currentUrl" icon="i-lucide-user-round" alt="头像预览" size="2xl" /><p class="text-caption text-muted">可选。未设置时使用默认头像。<br>保存为正方形，最大256×256像素。</p></div>
    <UFileUpload v-model="file" accept="image/png,image/jpeg,image/webp" label="选择头像" description="JPEG、PNG 或 WebP，最大10 MB" :preview="false" />
    <p v-if="error" role="alert" class="text-error text-caption">{{ error }}</p>
    <div v-if="editing" class="space-y-4">
      <p :id="helpId" class="text-caption leading-copy">在图片上拖拽框选任意部分；拖动边角调整大小，框选后拖动框内移动。也可用滑块或滚轮调整大小。键盘聚焦裁剪区域后，用方向键移动、＋／－调整大小。</p>
      <div ref="host" class="avatar-cropper h-80 sm:h-96 p-4 overflow-hidden border border-default rounded-lg bg-muted" role="group" tabindex="0" aria-label="头像裁剪区域" :aria-describedby="helpId" :aria-busy="busy" @keydown="onKeydown" />
      <UFormField label="选框大小" :hint="`${coverage}%`">
        <USlider :model-value="coverage" :min="1" :max="100" :disabled="busy" aria-label="选框大小" :aria-valuetext="`${coverage}%`" @update:model-value="resize" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-inline" aria-label="裁剪控制">
        <UButton icon="i-lucide-crop" :variant="drawing ? 'soft' : 'outline'" :aria-pressed="drawing" :disabled="busy" @click="setDrawing(!drawing)">重新框选</UButton>
        <UButton color="neutral" variant="ghost" :disabled="busy" @click="reset">重置选框</UButton>
        <span role="status" class="text-caption text-muted">{{ drawing ? '拖拽图片以框选' : '拖动选框以移动' }}</span>
      </div>
      <div class="flex gap-inline"><UButton :loading="busy" @click="confirm">确认裁剪</UButton><UButton color="neutral" variant="ghost" @click="cancel">取消裁剪</UButton></div>
    </div>
  </div>
</template>
