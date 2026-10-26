import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

test('theme follows the system, respects an explicit choice, and survives reloads and navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || /hydration/i.test(message.text())) errors.push(message.text())
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.getByRole('button', { name: '显示主题' }).click()
  await page.getByRole('option', { name: '浅色', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.getByRole('link', { name: '开始阅读', exact: true }).last().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
  await expect(page.locator('html')).toHaveClass(/light/)

  await page.getByRole('button', { name: '显示主题' }).click()
  await page.getByRole('option', { name: '系统', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass(/light/)
  expect(errors).toEqual([])
})

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} mode keeps pages and search accessible, including text contrast`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ colorScheme: mode })
    for (const path of ['/', '/wiki/禁制', '/wiki/南港公共禁制启用', '/wiki', '/timeline', '/reference', '/reference/公共禁制纪元初期（H31）', '/stories', '/stories/第一次选择', '/wiki/1747年议长选举']) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveClass(new RegExp(mode))
      await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations, `${mode} ${path}: ${JSON.stringify(result.violations)}`).toEqual([])
    }
    await page.getByRole('button', { name: '搜索设定', exact: true }).click()
    await page.getByRole('textbox', { name: '搜索关键词' }).fill('禁制')
    await expect(page.locator('.search-result').first()).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations, JSON.stringify(result.violations)).toEqual([])
  })
}

test('changing palette variables recolors UI components, surfaces and the illustration together', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
  const colors = () => page.evaluate(() => {
    const paint = (selector: string, property: string) => getComputedStyle(document.querySelector(selector)!).getPropertyValue(property)
    return {
      page: paint('body', 'background-color'),
      card: paint('.entry-card', 'background-color'),
      hero: paint('.hero', 'background-color'),
      button: paint('.hero-button', 'background-color'),
      brand: paint('.mark-bg', 'fill'),
      art: paint('.art-line', 'stop-color'),
      text: paint('.section-title', 'color'),
    }
  })
  const before = await colors()
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--hue-brand', '260')
    document.documentElement.style.setProperty('--hue-canvas', '260')
    document.documentElement.style.setProperty('--hue-accent', '25')
  })
  await expect.poll(async () => (await colors()).button).not.toBe(before.button)
  const after = await colors()
  for (const key of ['page', 'hero', 'button', 'brand', 'art', 'text'] as const) expect(after[key], key).not.toBe(before[key])
  // Raised white surfaces intentionally have no hue in light mode. Switching
  // themes must still update the shared Nuxt UI card and page surfaces.
  await page.getByRole('button', { name: '显示主题' }).click()
  await page.getByRole('option', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const dark = await colors()
  expect(dark.card).not.toBe(after.card)
  expect(dark.page).not.toBe(after.page)
})

test('mobile dark mode provides navigation, a usable theme menu and a readable article', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '显示主题' }).click()
  await expect(page.getByRole('option', { name: '浅色', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('link', { name: '年代', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: '南港公共禁制启用', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('南港公共禁制启用')
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})
