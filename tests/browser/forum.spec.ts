import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readPublicForum } from '../../scripts/lib/forum'
import { markdownText } from '../../scripts/lib/markdown'
import { forumPagePath } from '../../shared/forum'

const key = '皇族历史同人讨论'
const [source] = await readPublicForum(new URL('../..', import.meta.url).pathname)

test('all 204 floors and author-only reading are complete without JavaScript', async ({ browser }) => {
  test.setTimeout(60_000)
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  await page.goto('/forum')
  await page.getByRole('link', { name: source!.metadata.title, exact: true }).click()
  let count = 0
  for (let number = 1; number <= 11; number++) {
    await expect(page.locator('.forum-post').first()).toHaveAttribute('id', `post-${(number - 1) * 20 + 1}`)
    const expected = source!.posts.slice((number - 1) * 20, number * 20)
    const texts = await page.locator('.forum-prose').allTextContents()
    expect(texts.map(text => text.replace(/\s+/gu, ''))).toEqual(expected.map(post => markdownText(post.bodyMarkdown)))
    expect(await page.locator('.forum-post-author h2').allTextContents()).toEqual(expected.map(post => `${post.author}，第 ${post.floor} 楼`))
    await expect(page.locator('.forum-prose a[href^="/wiki"], .forum-prose a[href^="/stories"]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    count += texts.length
    if (number < 11) await page.getByRole('navigation', { name: '顶部楼层分页' }).getByRole('link', { name: '下一页', exact: true }).click()
  }
  expect(count).toBe(204)
  await page.getByRole('link', { name: '只看楼主', exact: true }).click()
  await expect(page.locator('.forum-post')).toHaveCount(17)
  expect(await page.locator('.forum-post').evaluateAll(posts => posts.map(post => post.id))).toEqual(source!.posts.filter(post => post.isOriginalPoster).map(post => `post-${post.floor}`))
  await page.getByRole('link', { name: '第 180 楼永久链接', exact: true }).click()
  await expect(page.locator('#post-180')).toBeInViewport()
  await expect(page.locator('.forum-post')).toHaveCount(20)
  await context.close()
})

test('mobile forum navigation, floor mentions, keyboard pagination and search retain their destinations', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' || /hydration/i.test(message.text())) errors.push(message.text()) })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await page.getByRole('dialog').getByRole('link', { name: '世界内论坛', exact: true }).click()
  await page.getByRole('link', { name: source!.metadata.title, exact: true }).click()
  const next = page.getByRole('navigation', { name: '顶部楼层分页' }).getByRole('link', { name: '下一页', exact: true })
  await next.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.forum-post').first()).toHaveAttribute('id', 'post-21')
  await page.getByRole('spinbutton', { name: '楼层', exact: true }).fill('61')
  await page.getByRole('button', { name: '转到', exact: true }).click()
  await expect.poll(() => decodeURI(page.url())).toContain('/page/4#post-61')
  await expect(page.locator('#post-61')).toBeInViewport()
  await page.locator('#post-61').getByRole('link', { name: '60L', exact: true }).click()
  await expect.poll(() => decodeURI(page.url())).toContain('/page/3#post-60')
  await expect(page.locator('#post-60')).toBeInViewport()
  await page.getByRole('link', { name: '只看楼主', exact: true }).click()
  await expect(page.locator('.forum-post')).toHaveCount(17)
  await page.reload()
  await expect(page.locator('.forum-post')).toHaveCount(17)
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: '搜索设定', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索关键词' }).fill('我收回刚才的谢谢')
  const result = page.locator('.search-result').filter({ hasText: '世界内论坛' }).first()
  await expect(result).toBeVisible()
  await expect(result).toHaveAttribute('href', /\/page\/11/)
  await result.click()
  await expect(page.locator('#post-204')).toBeAttached()
  expect(errors).toEqual([])
})

test('forum HTTP exports remain independent, preserve the exact original and expose every floor to AI', async ({ request }) => {
  const manifest = await (await request.get('/data/v1/manifest.json')).json()
  expect(manifest).toMatchObject({ forumThreadCount: 1, forumPostCount: 204, documentCount: 12 })
  const [entry] = await (await request.get(manifest.forum)).json()
  const thread = await (await request.get(entry.jsonUrl)).json()
  expect(thread).toMatchObject({ narrativeLayer: 'in-world-discussion', scopeUid: entry.uid, postCount: 204, replyCount: 203, participantCount: 24 })
  expect(thread.posts).toHaveLength(204)
  expect(thread.pages).toHaveLength(12)
  expect(thread.posts.at(-1)).toMatchObject({ floor: 204, author: '一位不愿具名的共和派', bodyMarkdown: '我收回刚才的谢谢。', path: `${forumPagePath(key, 11)}#post-204` })
  const bytes = await (await request.get(entry.originalMarkdownUrl)).body()
  expect(bytes.equals(await readFile(new URL(`../../sources/forum/${entry.originalFile}`, import.meta.url)))).toBeTruthy()
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.originalSha256)
  expect(manifest.files[entry.originalMarkdownUrl]).toBe(entry.originalSha256)
  for (const path of [manifest.catalog, manifest.relations, manifest.events, manifest.sourceMap]) {
    expect(await (await request.get(path)).text()).not.toContain('thread:')
    expect(await (await request.get(path)).text()).not.toContain('post:')
  }
  for (const path of [forumPagePath(key, 0), forumPagePath(key, 12), forumPagePath(key, 2, true), forumPagePath('不存在的主题')]) expect((await request.get(path)).status(), path).toBe(404)
})

for (const colorScheme of ['light', 'dark'] as const) for (const width of [1280, 375]) {
  test(`forum stays readable and accessible at ${width}px in ${colorScheme} mode`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/forum', forumPagePath(key), forumPagePath(key, 1, true), forumPagePath(key, 11)]) {
      await page.goto(path)
      await expect(page.getByRole('button', { name: '显示主题' })).toBeEnabled()
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations, `${width} ${path}: ${JSON.stringify(result.violations)}`).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    }
  })
}
