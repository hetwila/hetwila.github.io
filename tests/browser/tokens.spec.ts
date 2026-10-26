import { expect, test } from '@playwright/test'

for (const width of [1440, 375]) {
  test(`shared type and spacing scales reach CSS, Tailwind and Nuxt UI at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: width === 375 ? 'dark' : 'light' })
    await page.goto('/')
    await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
    const measure = () => page.evaluate(() => {
      const value = (selector: string, property: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).getPropertyValue(property))
      return {
        buttonText: value('.hero-button', 'font-size'),
        cardText: value('.entry-card [data-slot="title"]', 'font-size'),
        introText: value('.hero-description', 'font-size'),
        captionText: value('.site-footer p', 'font-size'),
        buttonPadding: value('.hero-button', 'padding-left'),
        cardPadding: value('.entry-card [data-slot="container"]', 'padding-left'),
        heroPadding: value('.hero-copy', 'padding-left'),
        sectionPadding: value('#entries', 'padding-top'),
        sectionMargin: value('section[aria-labelledby="future-title"]', 'margin-top'),
        headerHeight: value('.site-header', 'height'),
      }
    })
    const before = await measure()
    await page.evaluate(() => {
      // Simulate one larger, more spacious theme without changing templates.
      document.documentElement.style.setProperty('--spacing', '0.28125rem')
      document.documentElement.style.setProperty('--ds-type-unit', '1.125rem')
    })
    const after = await measure()
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(before[key], key).toBeGreaterThan(0)
      expect(after[key], key).toBeCloseTo(before[key] * 1.125, 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.getByRole('link', { name: '开始阅读', exact: true }).last().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('禁制')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  })
}

test('purpose tokens override UI defaults without losing text colors or changing unrelated controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
  const title = page.locator('.entry-card [data-slot="title"]').first()
  const color = await title.evaluate(element => getComputedStyle(element).color)
  const buttonPadding = await page.locator('.hero-button').evaluate(element => getComputedStyle(element).padding)
  await page.evaluate(() => {
    const style = document.documentElement.style
    style.setProperty('--ds-space-panel', '2.25rem')
    style.setProperty('--ds-text-card', '1.75rem')
    style.setProperty('--ds-radius-base', '0.5rem')
    style.setProperty('--ds-dialog-width', '36rem')
    style.setProperty('--ds-text-prose', '1.25rem')
    style.setProperty('--ds-leading-prose', '2.2')
    style.setProperty('--ds-duration-normal', '320ms')
  })
  await expect(title).toHaveCSS('font-size', '28px')
  await expect(title).toHaveCSS('color', color)
  await expect(page.locator('.entry-card').first()).toHaveCSS('border-radius', '24px')
  await expect(page.locator('.entry-card').first()).toHaveCSS('transition-duration', '0.32s, 0.32s, 0.32s')
  await expect(page.locator('.entry-card [data-slot="container"]').first()).toHaveCSS('padding', '36px')
  await expect(page.locator('.hero-button')).toHaveCSS('padding', buttonPadding)
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCSS('border-radius', '24px')
  await expect(page.getByRole('dialog')).toHaveCSS('width', '576px')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: '开始阅读', exact: true }).last().click()
  await expect(page.locator('.article-prose')).toHaveCSS('font-size', '20px')
  await expect(page.locator('.article-prose')).toHaveCSS('line-height', '44px')
  await expect(page.locator('.sources-panel [data-slot="body"]')).toHaveCSS('padding', '36px')
  await expect(page.locator('.sources-panel')).toHaveCSS('border-radius', '24px')
  // Responsive aliases and local UI overrides must retain the chosen tokens.
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.locator('.article-prose')).toHaveCSS('font-size', '20px')
  await expect(page.locator('.sources-panel [data-slot="body"]')).toHaveCSS('padding', '36px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/wiki/诺菲莉亚·薇尔希·伊拉奈德')
  await expect(page.locator('.related-card').first()).toHaveCSS('transition-duration', '0s')
})
