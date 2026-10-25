import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

test('read from the entry page through both linked concepts without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('世界辽阔')
  await expect(page.getByText('2 篇试读条目')).toBeVisible()
  await page.getByRole('link', { name: '开始阅读', exact: true }).last().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
  await page.locator('.article-prose').getByRole('link', { name: /H31-01/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('南港公共禁制启用')
  await expect(page.locator('.article-prose')).toContainText('0年')
  await page.locator('.article-prose').getByRole('link', { name: '禁制', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
  expect(errors).toEqual([])
})

test('Chinese search and event IDs use the generated Pagefind index', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const input = dialog.getByRole('textbox', { name: '搜索关键词' })
  await input.fill('禁制')
  await expect(dialog.locator('.search-result').first()).toBeVisible()
  await expect(dialog).not.toContainText('搜索暂时不可用')
  await input.fill('H31-01')
  await expect(dialog.locator('.search-result').filter({ hasText: '南港公共禁制启用' }).first()).toBeVisible()
  await dialog.locator('.search-result').filter({ hasText: '南港公共禁制启用' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('南港公共禁制启用')
  await expect(dialog).not.toBeVisible()
})

test('public articles remain readable and linked with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4173/wiki/ban')
  await expect(page.locator('main')).toContainText('能力强度不能通过简单增加')
  await page.locator('.article-prose').getByRole('link', { name: /H31-01/ }).click()
  await expect(page.locator('main')).toContainText('当时参与者首先关心工程能否可靠运行')
  await expect(page.getByRole('link', { name: '读取 Markdown' })).toBeVisible()
  await context.close()
})

test('machine readers discover, verify and read the same two public documents with HTTP alone', async ({ request }) => {
  const response = await request.get('/data/v1/manifest.json')
  expect(response.ok()).toBeTruthy()
  const manifest = await response.json()
  const catalog = await (await request.get(manifest.catalog)).json()
  expect(catalog).toHaveLength(2)
  for (const item of catalog) {
    const md = await request.get(item.markdownUrl)
    expect(md.ok()).toBeTruthy()
    const bytes = await md.body()
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files[item.markdownUrl])
    const doc = await (await request.get(item.jsonUrl)).json()
    expect(doc.uid).toBe(item.uid)
    expect(bytes.toString()).toContain(doc.bodyMarkdown)
    expect(doc.publicationStatus).toBe('published')
    expect(doc.visibility).toBe('public')
    if (item.uid === 'event:h31-01') expect(doc.worldTime.year).toBe(0)
  }
  expect(await (await request.get('/llms.txt')).text()).toContain('并非完整设定集')
})

test('mobile layouts fit the viewport and the search dialog supports keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: '搜索设定' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.goto('/wiki/h31-01')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('unbuilt routes return 404, while both article deep links return 200', async ({ request }) => {
  expect((await request.get('/wiki/ban')).status()).toBe(200)
  expect((await request.get('/wiki/h31-01')).status()).toBe(200)
  expect((await request.get('/wiki/not-a-published-entry')).status()).toBe(404)
})
