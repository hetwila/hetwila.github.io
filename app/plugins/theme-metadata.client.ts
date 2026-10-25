// Browser chrome follows the rendered tokens too; no second color palette.
export default defineNuxtPlugin((nuxtApp) => {
  const colorMode = useColorMode()
  const themeColor = ref<string>()
  const favicon = ref<string>()

  useHead(() => ({
    meta: themeColor.value ? [{ name: 'theme-color', content: themeColor.value }] : [],
    link: favicon.value ? [{ key: 'favicon', rel: 'icon', type: 'image/svg+xml', href: favicon.value }] : [],
  }))

  async function sync() {
    await nextTick()
    themeColor.value = getComputedStyle(document.body).backgroundColor
    const mark = document.querySelector<SVGElement>('.archive-mark')
    if (!mark) return
    const clone = mark.cloneNode(true) as SVGElement
    const originals = mark.querySelectorAll('[class]')
    clone.querySelectorAll('[class]').forEach((element, index) => {
      const original = originals[index]
      if (!original) return
      const style = getComputedStyle(original)
      element.setAttribute('fill', style.fill)
      element.setAttribute('stroke', style.stroke)
      element.removeAttribute('class')
    })
    clone.removeAttribute('class')
    favicon.value = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`
  }

  nuxtApp.hook('app:mounted', sync)
  watch(() => colorMode.value, sync, { flush: 'post' })
})
