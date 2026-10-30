import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readPublicForum } from '../../scripts/lib/forum'
import { markdownText } from '../../scripts/lib/markdown'
import { forumPagePath, forumFanfictionEntries } from '../../shared/forum'

const key = '如果再一次喜欢上你'
const source = (await readPublicForum(new URL('../..', import.meta.url).pathname)).find(thread => thread.metadata.routeKey === key)!
const entries = forumFanfictionEntries(key, source.posts)

test('fiction and surrounding chat remain complete with working chapter links without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/forum')
  await page.getByRole('link', { name: source.metadata.title, exact: true }).click()
  await expect(page.locator('.forum-post')).toHaveCount(2)
  await expect(page.locator('.forum-fanfiction')).toHaveCount(2)
  for (const post of source.posts) {
    const floor = page.locator(`#post-${post.floor}`)
    const text = await floor.locator('.fanfiction-title, .fanfiction-prose').allTextContents()
    const fiction = post.blocks.find(block => block.type === 'fanfiction')!
    expect(markdownText(text.join(''))).toBe(markdownText(fiction.bodyMarkdown))
    expect((await floor.locator('.forum-prose > p').allTextContents()).map(markdownText)).toEqual(post.blocks.filter(block => block.type === 'markdown').map(block => markdownText(block.bodyMarkdown)))
  }
  const first = page.locator('.forum-fanfiction').first()
  await first.locator('summary').click()
  await first.getByRole('navigation', { name: `${entries[0]!.title}章节目录` }).getByRole('link', { name: '五', exact: true }).click()
  await expect(first.getByRole('heading', { name: '五', exact: true })).toBeInViewport()
  await first.getByRole('link', { name: '跳过正文', exact: true }).click()
  await expect(first.locator('footer')).toBeInViewport()
  await first.getByRole('link', { name: `下一篇 · ${entries[1]!.title}`, exact: true }).click()
  await expect(page.locator('.fanfiction-title').last()).toBeInViewport()
  await page.getByRole('link', { name: '只看楼主', exact: true }).click()
  await expect(page.locator('.forum-fanfiction')).toHaveCount(2)
  await page.getByRole('link', { name: `${entries[1]!.title}永久链接`, exact: true }).click()
  await expect.poll(() => decodeURI(page.url())).toContain(entries[1]!.path)
  await expect(page.locator('.fanfiction-title').last()).toBeInViewport()
  await context.close()
})

test('fiction exports expose ordered blocks and remain inside the forum scope', async ({ request }) => {
  const manifest = await (await request.get('/data/v1/manifest.json')).json()
  const catalog = await (await request.get(manifest.forum)).json()
  const entry = catalog.find((item: { routeKey: string }) => item.routeKey === key)
  const thread = await (await request.get(entry.jsonUrl)).json()
  expect(thread.fanfiction).toEqual(entries)
  expect(thread.posts).toEqual(source.posts)
  for (const post of thread.posts) {
    expect(post.blocks.map((block: { type: string }) => block.type)).toEqual(['markdown', 'fanfiction', 'markdown'])
    expect(post.bodyMarkdown).not.toContain('<!-- fanfiction:')
    expect(post.scopeUid).toBe(source.metadata.uid)
  }
  for (const url of [manifest.catalog, manifest.relations, manifest.events]) expect(await (await request.get(url)).text()).not.toContain(key)
})

test('keyboard navigation, section deep links, search and client navigation preserve the reading context', async ({ page }) => {
  const errors: string[] = []
  const backendRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' || /hydration/i.test(message.text())) errors.push(message.text()) })
  page.on('request', request => { if (/supabase|\/rest\/v1|\/functions\/v1/u.test(request.url())) backendRequests.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/forum')
  await page.getByRole('link', { name: source.metadata.title, exact: true }).click()
  const directory = page.getByRole('navigation', { name: '同人文目录', exact: true })
  await directory.getByRole('link').last().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.fanfiction-title').last()).toBeInViewport()
  const second = page.locator('.forum-fanfiction').last()
  await second.locator('summary').focus()
  await page.keyboard.press('Enter')
  await second.getByRole('navigation', { name: `${entries[1]!.title}章节目录` }).getByRole('link', { name: '六', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(second.getByRole('heading', { name: '六', exact: true })).toBeInViewport()
  await page.reload()
  await expect(second.getByRole('heading', { name: '六', exact: true })).toBeInViewport()
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id))
  expect(new Set(ids).size).toBe(ids.length)
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  // Search for a literal phrase from the attachment, not only the topic title.
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('希望明天也能让她开心')
  const result = page.locator('.search-result').filter({ hasText: '世界内论坛' }).first()
  await expect(result).toBeVisible()
  await result.click()
  await expect(page.locator('.forum-fanfiction')).toHaveCount(2)
  expect(backendRequests).toEqual([])
  expect(errors).toEqual([])
})

for (const colorScheme of ['light', 'dark'] as const) for (const width of [1280, 375]) {
  test(`fiction reading is accessible at ${width}px in ${colorScheme} mode`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    await page.goto(forumPagePath(key))
    await page.locator('.forum-fanfiction').first().locator('summary').click()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    const metrics = await page.locator('.fanfiction-prose p').first().evaluate(element => {
      const style = getComputedStyle(element)
      return { font: style.fontFamily, size: parseFloat(style.fontSize), leading: parseFloat(style.lineHeight), width: element.clientWidth }
    })
    expect(metrics.font).toContain('serif')
    expect(metrics.size).toBeGreaterThanOrEqual(17)
    expect(metrics.leading / metrics.size).toBeGreaterThanOrEqual(1.95)
    await page.screenshot({ path: `test-results/fanfiction-${width}-${colorScheme}.png` })
  })
}
