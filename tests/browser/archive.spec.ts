import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

test('Chinese deep links render complete HTML and legacy addresses retain a no-JS reading path', async ({ browser, request, page: hydrated }) => {
  const manifest = await (await request.get('/data/v1/manifest.json')).json()
  const catalog = await (await request.get(manifest.catalog)).json()
  for (const entry of catalog) {
    const response = await request.get(encodeURI(entry.path))
    expect(response.status(), entry.path).toBe(200)
    expect(await response.text()).toContain(entry.title)
  }
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const [old, title] of [['ban', '禁制'], ['h31-01', '南港公共禁制启用']]) {
    await page.goto(`/wiki/${old}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('条目已更名')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://hetwila.github.io/wiki/${title}`)
    await page.getByRole('link', { name: title, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title!)
    await expect(page.locator('.article-prose')).not.toBeEmpty()
  }
  await context.close()
  await hydrated.goto('/wiki/ban?from=legacy#原理与作用边界')
  await expect.poll(() => decodeURI(hydrated.url())).toContain('/wiki/禁制?from=legacy#原理与作用边界')
  await expect(hydrated.getByRole('heading', { level: 1 })).toHaveText('禁制')
})

test('directory categories, precise search and the year-zero timeline connect the archive', async ({ page }) => {
  await page.goto('/wiki')
  await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
  await page.getByRole('textbox', { name: '筛选百科条目' }).fill('ｈ３１－１２')
  await expect(page.getByRole('link', { name: '受保护市场的债务、强占和普通暴力纠纷集中上报', exact: true })).toBeVisible()
  await expect(page.getByText('1 个条目 · 设定 3.0.3')).toBeVisible()
  await page.getByRole('link', { name: '受保护市场的债务、强占和普通暴力纠纷集中上报', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('受保护市场的债务、强占和普通暴力纠纷集中上报')
  await page.goto('/wiki')
  await page.getByRole('link', { name: '世界与超自然', exact: true }).click()
  await page.getByRole('textbox', { name: '筛选百科条目' }).fill('')
  await expect(page.getByRole('link', { name: '禁制', exact: true })).toBeVisible()
  await page.goto('/timeline')
  const events = page.getByRole('list', { name: '年代事件' }).locator(':scope > li')
  await expect(events).toHaveCount(12)
  await expect(events.first()).toContainText('0年')
  await expect(events.last()).toContainText('96年')
  await events.first().getByRole('link').click()
  await page.getByRole('link', { name: '6年 · 下一事件' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('南港受保护街区出现租金与迁居争议')
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('ｈ３１－１２')
  await expect(page.locator('.search-result').first()).toContainText('受保护市场的债务、强占和普通暴力纠纷集中上报')
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('公共禁制')
  await expect(page.locator('.search-result').first().locator('strong')).toHaveText('禁制')
})

test('source anchors, exact original downloads and incoming links are available without JavaScript', async ({ browser, request }) => {
  const manifest = await (await request.get('/data/v1/manifest.json')).json()
  const sources = await (await request.get(manifest.references)).json()
  const mapping = await (await request.get(manifest.sourceMap)).json()
  expect(mapping.anchors).toHaveLength(19)
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  for (const source of sources) {
    const bytes = await (await request.get(source.markdownUrl)).body()
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256)
    await page.goto(source.path)
    for (const anchor of source.anchors) await expect(page.locator(`[id="${anchor}"]`)).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.goto('/wiki/禁制')
  await expect(page.getByRole('region', { name: '链入本页' }).getByRole('link')).toHaveCount(12)
  await page.locator('.sources-panel').getByRole('link', { name: /04_禁制.md#cos-23/ }).click()
  await expect(page.locator('#cos-23')).toBeAttached()
  await context.close()
})
