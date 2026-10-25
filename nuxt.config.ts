export default defineNuxtConfig({
  compatibilityDate: '2026-10-24',
  modules: ['@nuxt/ui', '@nuxt/content'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  ssr: true,
  app: {
    baseURL: '/',
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      titleTemplate: '%s · 赫特维拉',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [{ name: 'theme-color', content: '#f5f5ef' }],
    },
  },
  ui: { fonts: false },
  colorMode: { preference: 'light' },
  icon: { clientBundle: { scan: true }, provider: 'none' },
  content: { build: { markdown: { highlight: false } } },
  nitro: {
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes: ['/', '/wiki/ban', '/wiki/h31-01'],
    },
  },
  typescript: { strict: true },
})
