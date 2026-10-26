import { existsSync, readFileSync } from 'node:fs'

const routeFile = new URL('./.generated/routes.json', import.meta.url)
const routes: string[] = existsSync(routeFile) ? JSON.parse(readFileSync(routeFile, 'utf8')) : ['/', '/wiki', '/stories', '/timeline', '/reference']

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
      link: [{ key: 'favicon', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  ui: { fonts: false },
  colorMode: { preference: 'system', fallback: 'light', classSuffix: '', storageKey: 'hetwila-color-mode' },
  icon: { clientBundle: { scan: true }, provider: 'none' },
  content: { build: { markdown: { highlight: false } } },
  nitro: {
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes,
    },
  },
  typescript: { strict: true },
})
