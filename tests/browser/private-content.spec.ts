import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { existsSync } from 'node:fs'
import { privateFixture, privateId, privateReader } from './helpers/private-content'

test('private pages contain only a neutral static shell and request no manuscript before login', async ({ page, browser }) => {
  const fixture = await privateFixture(page)
  const path = existsSync(`.output/public/private/${privateId}/index.html`) ? `/private/${privateId}` : privateReader
  const response = await page.goto(path)
  expect(response?.status()).toBe(200)
  const html = await response!.text()
  expect(html).not.toContain('仅限授权的手稿')
  expect(html).not.toContain('最后一段私有文章')
  await expect(page.getByRole('heading', { name: '登录后阅读' })).toBeVisible()
  expect(fixture.contentRequests.filter(r => r.path === 'private_documents')).toHaveLength(0)
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow, noarchive')
  const context = await browser.newContext({ javaScriptEnabled: false })
  const nojs = await context.newPage()
  await nojs.goto(path)
  await expect(nojs.getByText('请启用 JavaScript 并登录后阅读。内容会根据你的权限加载。')).toBeVisible()
  expect(await nojs.textContent('main')).not.toContain('仅限授权的手稿')
  await context.close()
})

test('authorized reading uses article typography, heading anchors and safe Markdown; revocation clears content', async ({ page }) => {
  const fixture = await privateFixture(page, 'guest')
  await page.goto(privateReader)
  await expect(page.getByRole('heading', { name: '仅限授权的手稿' })).toBeVisible()
  await expect(page.getByText('最后一段私有文章。')).toBeVisible()
  await expect(page.locator('article .article-prose h2').first()).toHaveText('开始阅读')
  expect(await page.evaluate(() => (window as any).privateXss)).toBeUndefined()
  await expect(page.locator('main a[href^="javascript:"]')).toHaveCount(0)
  await page.locator('.article-prose').getByRole('link', { name: '回到开始' }).click()
  await expect(page).toHaveURL(/#document-.*开始阅读|#document-.*%/)
  fixture.state.allowed = false
  await page.reload()
  await expect(page.getByRole('heading', { name: '内容不可用' })).toBeVisible()
  await expect(page.getByText('最后一段私有文章。')).toHaveCount(0)
  fixture.state.allowed = true
  await page.getByRole('button', { name: '重新检查' }).click()
  await expect(page.getByRole('heading', { name: '仅限授权的手稿' })).toBeVisible()
  await page.getByRole('link', { name: '用户中心', exact: true }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('link', { name: '登录', exact: true })).toBeVisible()
  await page.goto(privateReader)
  await expect(page.getByRole('heading', { name: '登录后阅读' })).toBeVisible()
  await expect(page.getByText('最后一段私有文章。')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('私有正文')
})

test('private forum supports chat, embedded fiction, original floors, author filter and cross-page links', async ({ page }) => {
  const fixture = await privateFixture(page, 'guest')
  const row = fixture.documents[0]!
  row.kind = 'forum'; row.title = '私有论坛主题'; row.body_markdown = ''
  row.forum_posts = Array.from({ length: 21 }, (_, index) => ({ floor: index + 1, author: index === 0 || index === 20 ? '作品楼主' : '作品读者', isOriginalPoster: index === 0 || index === 20, body: `第${index + 1}层聊天。` }))
  row.forum_posts[0]!.body = '篇前聊天，见21L。\n\n<!-- fanfiction: 第一篇 -->\n\n## 第一篇长文\n\n### 一\n\n长文内部出现2L保持原文。\n\n<!-- /fanfiction -->\n\n篇后聊天。'
  row.forum_posts[20]!.body = '<!-- fanfiction: 第二篇 -->\n\n## 第二篇长文\n\n### 一\n\n第二篇的正文。\n\n<!-- /fanfiction -->'
  await page.goto(privateReader)
  await expect(page.locator('.forum-posts > article')).toHaveCount(20)
  await expect(page.locator('.forum-fanfiction')).toHaveCount(1)
  await expect(page.getByText('篇后聊天。')).toBeVisible()
  await expect(page.locator('.fanfiction-prose a')).toHaveCount(0)
  await page.getByRole('link', { name: '下一篇 · 第二篇长文' }).click()
  await expect(page).toHaveURL(/page=2#post-21-fanfiction/)
  await expect(page.locator('#post-21 .fanfiction-title')).toHaveText('第二篇长文')
  await page.reload()
  await expect(page.locator('#post-21')).toBeVisible()
  await page.getByRole('link', { name: '只看楼主', exact: true }).click()
  await expect(page.locator('.forum-posts > article')).toHaveCount(2)
  await expect(page.locator('#post-21')).toBeAttached()
  await page.getByRole('link', { name: '第 21 楼永久链接' }).click()
  await expect(page).toHaveURL(/page=2#post-21$/)
})

test('admin can submit, preview, recover a failed save and configure each manuscript access', async ({ page }) => {
  const fixture = await privateFixture(page, 'admin')
  await page.goto('/account/submissions/edit')
  await page.getByLabel('标题', { exact: true }).fill('新投稿测试')
  await page.getByLabel('正文 Markdown', { exact: true }).fill('## 第一节\n\n一篇新的私有故事。')
  await page.getByRole('button', { name: '预览排版' }).click()
  await expect(page.getByRole('region', { name: '投稿预览' }).getByRole('heading', { name: '第一节' })).toBeVisible()
  fixture.state.failWrites = true
  await page.getByRole('button', { name: '保存投稿', exact: true }).click()
  await expect(page.getByText('保存未完成。', { exact: false })).toBeVisible()
  await expect(page.getByLabel('正文 Markdown', { exact: true })).toHaveValue('## 第一节\n\n一篇新的私有故事。')
  fixture.state.failWrites = false
  await page.getByRole('button', { name: '保存投稿', exact: true }).click()
  await expect(page).toHaveURL(/\/account\/submissions\/edit\?id=/)
  await expect(page.getByRole('heading', { name: '阅读权限', exact: true })).toBeVisible()
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('新投稿测试')
  await page.getByRole('checkbox', { name: 'guest', exact: true }).check()
  await page.getByRole('button', { name: '保存阅读权限', exact: true }).click()
  await expect(page.getByText('阅读权限已保存。', { exact: true })).toBeVisible()
  expect(fixture.state.groupGrants).toEqual(['guest'])
  await page.getByLabel('允许的用户', { exact: true }).click()
  await page.getByRole('option', { name: /测试读者.*reader@example.test/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存阅读权限', exact: true }).click()
  await expect.poll(() => fixture.state.userGrants.length).toBe(1)
  fixture.state.accessStale = true
  await page.getByRole('button', { name: '保存阅读权限', exact: true }).click()
  await expect(page.getByText('权限已被另一位管理员修改。', { exact: false })).toBeVisible()
  fixture.state.stale = true
  await page.getByLabel('标题', { exact: true }).fill('不可覆盖的修改')
  await page.getByRole('button', { name: '保存投稿', exact: true }).click()
  await expect(page.getByText('保存未完成。', { exact: false })).toBeVisible()
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('不可覆盖的修改')
  expect(fixture.documents.at(-1)?.title).toBe('新投稿测试')
})

test('guests have no submission controls and list/read errors offer recovery without exposing stale text', async ({ page }) => {
  const fixture = await privateFixture(page, 'guest')
  await page.goto('/private')
  await expect(page.getByRole('link', { name: '仅限授权的手稿', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '新投稿', exact: true })).toHaveCount(0)
  await page.goto('/account/submissions/edit')
  await expect(page.getByText('当前用户组没有此内容的投稿或编辑权限。')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存投稿', exact: true })).toHaveCount(0)
  fixture.state.failReads = true
  await page.goto(privateReader)
  await expect(page.getByText('内容暂时无法读取，请重试。')).toBeVisible({ timeout: 15000 })
  fixture.state.failReads = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('最后一段私有文章。')).toBeVisible()
})

test('forum submission preserves mixed prose and warns before discarding an unsaved manuscript', async ({ page }) => {
  const fixture = await privateFixture(page, 'admin')
  await page.goto('/account/submissions/edit')
  await page.getByLabel('内容类型', { exact: true }).click()
  await page.getByRole('option', { name: '论坛帖子', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('新论坛投稿')
  await page.getByLabel('第1楼昵称', { exact: true }).fill('原稿楼主')
  const body = '开场聊天。\n\n<!-- fanfiction: 篇一 -->\n\n## 篇一\n\n### 开始\n\n新篇章正文。\n\n<!-- /fanfiction -->\n\n收尾聊天。'
  await page.getByLabel('第1楼正文', { exact: true }).fill(body)
  await page.getByRole('button', { name: '添加楼层', exact: true }).click()
  await page.getByLabel('第2楼昵称', { exact: true }).fill('讨论者')
  await page.getByLabel('第2楼正文', { exact: true }).fill('继续讨论。')
  await page.getByRole('button', { name: '预览排版' }).click()
  await expect(page.locator('.forum-fanfiction')).toHaveCount(1)
  await page.getByRole('link', { name: '返回投稿列表', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '有未保存的修改' })).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByLabel('第1楼正文', { exact: true })).toHaveValue(body)
  await page.getByRole('button', { name: '保存投稿', exact: true }).click()
  await expect(page).toHaveURL(/\/account\/submissions\/edit\?id=/)
  expect(fixture.documents.at(-1)?.forum_posts).toEqual([
    { floor: 1, author: '原稿楼主', body, isOriginalPoster: true },
    { floor: 2, author: '讨论者', body: '继续讨论。', isOriginalPoster: false },
  ])
  await page.getByRole('link', { name: '阅读', exact: true }).click()
  await expect(page.getByRole('heading', { name: '新论坛投稿', exact: true })).toBeVisible()
  await expect(page.getByText('继续讨论。', { exact: true })).toBeVisible()
})

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`private reading and submission are accessible at ${viewport.width} in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.emulateMedia({ colorScheme })
    await privateFixture(page, 'admin')
    await page.goto(privateReader)
    await expect(page.getByText('最后一段私有文章。')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/private-reading-${viewport.width}-${colorScheme}.png`, fullPage: true })
    await page.goto(`/account/submissions/edit?id=${privateId}`)
    await expect(page.getByRole('heading', { name: '阅读权限', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/private-editor-${viewport.width}-${colorScheme}.png`, fullPage: true })
  })
}
