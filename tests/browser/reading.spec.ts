import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { commentFixture } from './helpers/comments'
import { privateFixture, privateReader } from './helpers/private-content'
import { READING_RECORD_PREFIX, READING_SETTINGS_KEY, readingRecordKey, type ReadingRecord } from '../../shared/reading'

const story = '/stories/第一次选择'
const storyId = 'story:第一次选择'
const storyKey = readingRecordKey({ id: storyId })
const forum = '/forum/threads/如果再一次喜欢上你/page/1'
const saved = (page: Page, key = storyKey): Promise<ReadingRecord | null> => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key)
async function openStory(page: Page) {
  await page.goto(story)
  await page.getByRole('button', { name: '沉浸阅读：第一次选择', exact: true }).click()
  await expect(page.locator('.reader-prose p').first()).toBeVisible()
}
async function scrollBook(page: Page, ratio = 0.4) {
  await page.locator('.reader-scroll').evaluate((element, ratio) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * ratio }, ratio)
  await expect.poll(async () => (await saved(page))?.position.progress || 0).toBeGreaterThan(0.2)
}
async function visibleParagraph(page: Page) {
  return page.locator('.reader-scroll').evaluate(element => {
    const top = element.getBoundingClientRect().top
    return Array.from(element.querySelectorAll('.reader-prose p')).find(p => p.getBoundingClientRect().bottom > top)?.textContent
  })
}

test('the full-screen story preserves a single body, settings and semantic progress across reloads', async ({ page }) => {
  await commentFixture(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (/hydration/i.test(message.text())) errors.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openStory(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog).not.toContainText('很喜欢这段故事。')
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id))
  expect(new Set(ids).size).toBe(ids.length)
  await scrollBook(page)
  const paragraph = await visibleParagraph(page)
  await dialog.getByRole('button', { name: '阅读设置', exact: true }).click()
  await dialog.getByRole('combobox', { name: '正文字体', exact: true }).click()
  await page.getByRole('option', { name: '无衬线体 Sans serif', exact: true }).click()
  await dialog.getByRole('combobox', { name: '字号', exact: true }).click()
  await page.getByRole('option', { name: '26', exact: true }).click()
  await dialog.getByRole('combobox', { name: '行距', exact: true }).click()
  await page.getByRole('option', { name: '宽松', exact: true }).click()
  await dialog.getByRole('button', { name: '色彩模式', exact: true }).click()
  await page.getByRole('option', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect.poll(() => visibleParagraph(page)).toBe(paragraph)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), READING_SETTINGS_KEY)).toEqual({ font: 'sans', size: 26, lineHeight: 2.2 })
  const metrics = await page.locator('.reader-prose p').first().evaluate(p => ({ size: getComputedStyle(p).fontSize, font: getComputedStyle(p).fontFamily }))
  expect(metrics.size).toBe('26px')
  expect(metrics.font).toContain('sans-serif')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: '沉浸阅读：第一次选择', exact: true })).toBeFocused()
  const bookmark = (await saved(page))!.position
  await page.reload()
  await expect(page.getByText('已回到上次读到的位置。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '沉浸阅读：第一次选择', exact: true }).click()
  await expect.poll(() => visibleParagraph(page)).toBe(paragraph)
  await expect.poll(async () => (await saved(page))?.position.key).toBe(bookmark.key)
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-font', 'sans')
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(errors).toEqual([])
})

test('home resumes the correct book and local deletion wins over an older open tab', async ({ page, context }) => {
  await commentFixture(page)
  await openStory(page)
  await scrollBook(page)
  const before = (await saved(page))!.position
  const home = await context.newPage()
  await commentFixture(home)
  const requests: string[] = []
  home.on('request', request => { if (/supabase|\/rest\/v1|\/functions\/v1/u.test(request.url())) requests.push(request.url()) })
  await home.goto('/')
  await expect(home.getByRole('link', { name: '继续阅读：第一次选择', exact: true })).toBeVisible()
  expect(requests).toEqual([])
  await home.getByRole('link', { name: '继续阅读：第一次选择', exact: true }).click()
  await expect(home.getByRole('dialog')).toBeVisible()
  await expect.poll(async () => (await saved(home))?.position.key).toBe(before.key)
  await home.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  await home.goto('/')
  await home.getByRole('button', { name: '移除阅读记录：第一次选择', exact: true }).click()
  await expect(home.getByText('还没有阅读记录。', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '下一屏', exact: true }).click()
  await page.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  expect(await saved(page)).toBeNull()
  await home.reload()
  await expect(home.getByRole('link', { name: '继续阅读：第一次选择', exact: true })).toHaveCount(0)
  // The homepage itself only reads local storage; story comments retain their own API.
  expect(requests.filter(url => !/comment|account_profiles|auth\/v1/u.test(url))).toEqual([])
})

test('each floor fiction opens independently, shares author-view progress, and leaves chat outside the book', async ({ page }) => {
  await page.goto(forum)
  const titles = await page.locator('.fanfiction-title').allTextContents()
  await page.getByRole('button', { name: `沉浸阅读：${titles[0]}`, exact: true }).click()
  await expect(page.locator('.reader-prose .fanfiction-prose')).toHaveCount(1)
  await expect(page.locator('.reader-prose .forum-prose')).toHaveCount(0)
  await page.getByRole('button', { name: '章节目录', exact: true }).click()
  await page.getByRole('navigation', { name: '沉浸阅读章节目录', exact: true }).getByRole('button', { name: '四', exact: true }).click()
  await expect(page.locator('.reader-prose').getByRole('heading', { name: '四', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  const records = await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => JSON.parse(localStorage.getItem(key)!)), READING_RECORD_PREFIX)
  const first = records.find(record => record.position.progress > 0.1)
  expect(first).toBeTruthy()
  const authorPath = await page.getByRole('link', { name: '只看楼主', exact: true }).getAttribute('href')
  await page.goto(authorPath!)
  await page.getByRole('button', { name: `沉浸阅读：${titles[0]}`, exact: true }).click()
  await expect.poll(async () => (await saved(page, readingRecordKey(first)))?.position.key).toBe(first.position.key)
  await page.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  await page.getByRole('button', { name: `沉浸阅读：${titles[1]}`, exact: true }).click()
  await expect(page.locator('.reader-book h1')).toHaveText(titles[1]!)
  await page.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  await page.goto('/')
  await expect(page.getByRole('link', { name: `最近读过：${titles[0]}`, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: `最近读过：${titles[1]}`, exact: true })).toBeVisible()
})

test('normal reading resumes, explicit chapter links win, and resize keeps the same paragraph', async ({ page }) => {
  await commentFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(story)
  const chapter = page.locator('.story-prose h2').nth(3)
  await chapter.scrollIntoViewIfNeeded()
  await expect.poll(async () => (await saved(page))?.position.progress || 0).toBeGreaterThan(0.2)
  const bookmark = (await saved(page))!.position
  await page.reload()
  await expect(page.getByText('已回到上次读到的位置。', { exact: true })).toBeVisible()
  await expect.poll(async () => (await saved(page))?.position.key).toBe(bookmark.key)
  const anchor = await page.locator('.story-prose h2').first().getAttribute('id')
  await page.goto(`${story}#${anchor}`)
  await expect(page.locator('.story-prose h2').first()).toBeInViewport()
  await page.getByRole('button', { name: '沉浸阅读：第一次选择', exact: true }).click()
  await scrollBook(page)
  const paragraph = await visibleParagraph(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await expect.poll(() => visibleParagraph(page)).toBe(paragraph)
  await page.getByRole('button', { name: '从头读', exact: true }).click()
  await expect.poll(async () => (await saved(page))?.position.progress).toBe(0)
  await expect(page.locator('.reader-book h1')).toBeInViewport()
  await page.getByRole('button', { name: '下一屏', exact: true }).click()
  await expect.poll(() => page.locator('.reader-scroll').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
})

for (const kind of ['story', 'fanfiction'] as const) test(`private ${kind} keeps access and age checks, and never stores manuscript text`, async ({ page }) => {
  const fixture = await privateFixture(page, 'guest')
  const row = fixture.documents[0]!
  row.age_rating = 'r18'
  if (kind === 'fanfiction') {
    row.kind = 'forum'; row.body_markdown = ''
    row.forum_posts = [{ floor: 1, author: '作品楼主', isOriginalPoster: true, body: '篇前聊天。\n\n<!-- fanfiction: 私有篇目 -->\n\n## 私有篇目名称\n\n### 章节一\n\n' + Array.from({ length: 35 }, (_, i) => `私有正文第${i + 1}段。这段内容应留在后端。`).join('\n\n') + '\n\n<!-- /fanfiction -->\n\n篇后聊天。' }]
  }
  const itemId = `private:${row.id}/${kind === 'story' ? 'story' : 'post-1-fanfiction-私有篇目'}`
  await page.goto(`${privateReader}&read=${encodeURIComponent(itemId)}`)
  await expect(page.getByRole('heading', { name: '年龄确认', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, READING_RECORD_PREFIX)).toBe(0)
  await page.getByRole('button', { name: '我已年满18周岁，继续阅读' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.reader-prose')).not.toContainText('篇后聊天。')
  const initialRequests = fixture.contentRequests.length
  await page.getByRole('button', { name: '下一屏', exact: true }).click()
  await page.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  expect(fixture.contentRequests.length).toBe(initialRequests)
  const records = await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => localStorage.getItem(key)), READING_RECORD_PREFIX)
  expect(records.length).toBe(1)
  expect(records.join('')).not.toMatch(/仅限授权的手稿|私有篇目名称|私有正文/)
  expect(JSON.parse(records[0]!).ownerId).toBe(fixture.profile.id)
  await page.goto('/')
  await page.getByRole('link', { name: `继续阅读：私有${kind === 'story' ? '故事' : '同人文'}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: '年龄确认', exact: true })).toBeVisible()
  expect(fixture.profile.show_sensitive_content).toBe(false)
  await page.getByRole('button', { name: '我已年满18周岁，继续阅读' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  fixture.state.allowed = false
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.reader-prose')).toHaveCount(0)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.getByRole('heading', { name: '内容不可用', exact: true })).toBeVisible()
  expect(await page.textContent('body')).not.toContain('这段内容应留在后端')
})

test('bad local data and storage write failures do not prevent reading or applying settings', async ({ page }) => {
  await commentFixture(page)
  await page.addInitScript(({ prefix, settings }) => {
    localStorage.setItem(prefix + 'broken', '{not-json')
    localStorage.setItem(settings, JSON.stringify({ font: 'unsafe', size: 9999, lineHeight: 0 }))
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('hetwila-reading:')) throw new DOMException('Full', 'QuotaExceededError'); return setItem.call(this, key, value) }
  }, { prefix: READING_RECORD_PREFIX, settings: READING_SETTINGS_KEY })
  await openStory(page)
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('无法保存')
  await page.getByRole('button', { name: '阅读设置', exact: true }).click()
  await page.getByRole('combobox', { name: '字号', exact: true }).click()
  await page.getByRole('option', { name: '24', exact: true }).click()
  await expect.poll(() => page.locator('.reader-prose p').first().evaluate(element => getComputedStyle(element).fontSize)).toBe('24px')
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('当前设置仍然生效')
  await page.getByRole('button', { name: '退出沉浸阅读', exact: true }).click()
  await page.goto('/')
  await expect(page.getByText('还没有阅读记录。', { exact: false })).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) for (const width of [1280, 375]) {
  test(`reader controls and text are accessible at ${width}px in ${colorScheme}`, async ({ page }) => {
    await commentFixture(page)
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 812 })
    await openStory(page)
    await page.getByRole('button', { name: '阅读设置', exact: true }).click()
    const result = await new AxeBuilder({ page }).include('.reader-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations).toEqual([])
    expect(await page.locator('.reader-shell').evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy()
    await page.screenshot({ path: `test-results/reader-${width}-${colorScheme}.png` })
    if (width === 1280 && colorScheme === 'light') {
      const fullscreen = page.getByRole('button', { name: '进入系统全屏', exact: true })
      if (await fullscreen.count()) {
        await fullscreen.click()
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
        await page.getByRole('button', { name: '退出系统全屏', exact: true }).click()
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
        await expect(page.getByRole('dialog')).toBeVisible()
      }
    }
  })
}
