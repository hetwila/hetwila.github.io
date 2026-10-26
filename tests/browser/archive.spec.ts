import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

test('Chinese deep links render complete HTML and removed event pages return 404', async ({ browser, request }) => {
  const manifest = await (await request.get('/data/v1/manifest.json')).json()
  const catalog = await (await request.get(manifest.catalog)).json()
  for (const entry of catalog) {
    const response = await request.get(encodeURI(entry.path))
    expect(response.status(), entry.path).toBe(200)
    expect(await response.text()).toContain(entry.title)
  }
  for (const old of ['ban', 'h31-01', '南港公共禁制启用', '南港受保护街区出现租金与迁居争议']) {
    expect((await request.get(encodeURI(`/wiki/${old}`))).status(), old).toBe(404)
  }
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/timeline')
  await page.getByRole('list', { name: '年代事件' }).getByRole('link').first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
  await expect.poll(() => decodeURI(page.url())).toContain('/wiki/禁制#h31-01')
  await expect(page.locator('#h31-01')).toBeAttached()
  await expect.poll(() => page.evaluate(() => {
    const top = document.getElementById('h31-01')!.getBoundingClientRect().top
    return top >= document.querySelector('.mobile-toc')!.getBoundingClientRect().bottom && top < innerHeight
  })).toBeTruthy()
  await expect(page.locator('.article-prose')).toContainText('现行纪元后来以此为起点')
  await context.close()
})

test('directory categories, precise search and the year-zero timeline connect the archive', async ({ page }) => {
  await page.goto('/wiki')
  await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
  await page.getByRole('textbox', { name: '筛选百科条目' }).fill('ｈ３１－１２')
  await expect(page.getByRole('link', { name: '禁制', exact: true })).toBeVisible()
  await expect(page.getByText('1 个条目 · 设定 3.0.3')).toBeVisible()
  await page.getByRole('link', { name: '禁制', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
  await page.goto('/wiki')
  await page.getByRole('link', { name: '世界与超自然', exact: true }).click()
  await page.getByRole('textbox', { name: '筛选百科条目' }).fill('')
  await expect(page.getByRole('link', { name: '禁制', exact: true })).toBeVisible()
  await page.goto('/timeline')
  const events = page.getByRole('list', { name: '年代事件' }).locator(':scope > li')
  await expect(events).toHaveCount(13)
  await expect(events.first()).toContainText('0年')
  await expect(events.last()).toContainText('1747年')
  await events.first().getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
  await expect.poll(() => decodeURI(page.url())).toContain('#h31-01')
  await page.goto('/timeline')
  await events.nth(1).getByRole('link').click()
  await expect.poll(() => decodeURI(page.url())).toContain('/wiki/禁制#h31-02')
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('ｈ３１－１２')
  await expect(page.locator('.search-result').first()).toContainText('受保护市场的债务、强占和普通暴力纠纷集中上报')
  await expect(page.locator('.search-result').first()).toHaveAttribute('href', '/wiki/禁制#h31-12')
  await page.locator('.search-result').first().click()
  await expect.poll(() => decodeURI(page.url())).toContain('/wiki/禁制#h31-12')
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('公共禁制')
  await expect(page.locator('.search-result').first().locator('strong')).toHaveText('禁制')
})

test('source anchors, exact original downloads and embedded event paragraphs are available without JavaScript', async ({ browser, request }) => {
  const manifest = await (await request.get('/data/v1/manifest.json')).json()
  const sources = await (await request.get(manifest.references)).json()
  const mapping = await (await request.get(manifest.sourceMap)).json()
  expect(mapping.anchors).toHaveLength(151)
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  for (const source of sources) {
    const bytes = await (await request.get(source.markdownUrl)).body()
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256)
    await page.goto(source.path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    for (const anchor of source.anchors) await expect(page.locator(`[id="${anchor}"]`)).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.goto('/wiki/禁制')
  for (let i = 1; i <= 12; i++) await expect(page.locator(`#h31-${String(i).padStart(2, '0')}`)).toHaveCount(1)
  await page.locator('.sources-panel').getByRole('link', { name: /04_禁制.md#cos-23/ }).click()
  await expect(page.locator('#cos-23')).toBeAttached()
  await context.close()
})
