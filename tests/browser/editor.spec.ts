import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import matter from 'gray-matter'
import { accountFixture, userId } from './helpers/accounts'
import { createEditorDraft, createEditorBlock, EDITOR_STORAGE_PREFIX, type EditorDraft } from '../../shared/editor.ts'
import { wikiSchema } from '../../shared/content-schema.ts'
import { parseForumPosts } from '../../shared/forum-posts.ts'
import { parseForumBody } from '../../shared/forum-body.ts'

function article() {
  const draft = createEditorDraft('wiki')
  Object.assign(draft.metadata, { title: '编辑器测试', routeKey: '编辑器测试', description: '用于浏览器校验', category: '测试', worldTime: { label: '纪年0年', precision: 'year', year: 0 }, sourceRefs: [{ path: '07_历代历史/H31.md', anchor: 'h31-01', role: 'primary' }] })
  draft.body = '最初的正文。'
  return draft
}
async function importDraft(page: Page, draft: EditorDraft) {
  const previous = await page.evaluate(prefix => localStorage.getItem(prefix + 'active'), EDITOR_STORAGE_PREFIX)
  const detail = page.locator('details').filter({ has: page.getByText('导入本地文件或已发布内容', { exact: true }) })
  if (!(await detail.getAttribute('open') !== null)) await page.getByText('导入本地文件或已发布内容', { exact: true }).click()
  await page.getByLabel('导入 Markdown 或草稿备份').setInputFiles({ name: 'draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) })
  await expect.poll(() => page.evaluate(prefix => localStorage.getItem(prefix + 'active'), EDITOR_STORAGE_PREFIX)).not.toBe(previous)
  await expect(page.getByText('已作为新本机草稿打开，原草稿保留。')).toBeVisible()
}
async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: '已自动保存到本机' })).toBeVisible() }
async function cloudFixture(page: Page) {
  await accountFixture(page, 'admin')
  const snapshots = new Map<string, string>(), requests: { method: string; path: string; authorization?: string }[] = []
  const failures = { upload: false, restore: false }
  await page.route('https://account.example.test/storage/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method(), path = decodeURIComponent(url.pathname)
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push({ method, path, authorization: req.headers().authorization })
    const send = (json: unknown, status = 200) => route.fulfill({ status, json, headers })
    if (path === '/storage/v1/object/list/editor-drafts') {
      const body = req.postDataJSON()
      expect(body.prefix).toBe(userId)
      return send([...snapshots.keys()].sort().reverse().slice(body.offset, body.offset + body.limit).map(name => ({ name: name.slice(userId.length + 1), id: name, metadata: {}, updated_at: new Date().toISOString() })))
    }
    if (path === '/storage/v1/object/editor-drafts' && method === 'DELETE') {
      for (const name of req.postDataJSON().prefixes) snapshots.delete(name)
      return send([])
    }
    const name = path.replace(/^\/storage\/v1\/object\/(?:authenticated\/)?editor-drafts\//u, '')
    if (method === 'POST') {
      if (failures.upload) return send({ message: 'fixture failure' }, 503)
      expect(name).toMatch(new RegExp(`^${userId}/[0-9]{13}-[A-Za-z0-9_-]+-[0-9a-f-]{36}\\.json$`))
      expect(req.headers()['x-upsert']).toBe('false')
      expect(req.headers()['content-type']).toBe('application/json')
      snapshots.set(name, req.postData()!)
      return send({ Key: `editor-drafts/${name}`, Id: name })
    }
    if (method === 'GET') return failures.restore ? send({ message: 'fixture failure' }, 503) : route.fulfill({ headers, contentType: 'application/json', body: snapshots.get(name)!, status: snapshots.has(name) ? 200 : 404 })
    throw new Error(`Unexpected storage request ${method} ${path}`)
  })
  return { snapshots, requests, failures }
}

test('public visual editor persists body/metadata/links and downloads schema-valid Markdown', async ({ page }) => {
  await accountFixture(page)
  await page.goto('/editor'); await importDraft(page, article())
  const body = page.getByRole('textbox', { name: '文章正文', exact: true })
  await body.fill('直观编辑后的正文。')
  await page.getByRole('button', { name: '插入链接', exact: true }).click()
  await page.getByLabel('链接地址', { exact: true }).fill('/wiki/禁制#h31-01')
  await page.getByLabel('链接文字', { exact: true }).fill('纪年0年')
  await page.getByRole('button', { name: '插入', exact: true }).click()
  await expect(body.getByRole('link')).toHaveText('纪年0年')
  await page.getByRole('tab', { name: '元数据', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('改过标题的文章')
  await page.getByLabel('文件名与路径', { exact: true }).fill('改过标题的文章')
  await page.getByLabel('修订号', { exact: true }).fill('2')
  await saved(page); await page.reload()
  await expect(page.getByRole('textbox', { name: '文章正文', exact: true })).toContainText('直观编辑后的正文。')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Markdown', exact: true }).click()
  const file = await downloaded, raw = await readFile((await file.path())!, 'utf8'), parsed = matter(raw)
  expect(file.suggestedFilename()).toBe('改过标题的文章.md')
  expect(wikiSchema.parse(parsed.data).revision).toBe(2)
  expect(parsed.data.worldTime.year).toBe(0)
  expect(parsed.content).toContain('直观编辑后的正文。')
  expect(decodeURI(parsed.content)).toContain('/wiki/禁制#h31-01')
  await page.getByRole('tab', { name: '整篇预览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '改过标题的文章', exact: true })).toBeVisible()
  await expect(page.getByText('私有内容', { exact: true })).toHaveCount(0)
})

test('forum editor exports mixed floor content and keeps long imported threads lightweight', async ({ page }) => {
  await accountFixture(page); await page.goto('/editor')
  const draft = createEditorDraft('forum')
  Object.assign(draft.metadata, { title: '测试帖子', routeKey: '测试帖子', description: '浏览器测试', community: '测试社区', board: '交流', category: '同人', originalFile: '测试帖子.md' })
  draft.posts[0]!.author = '测试楼主'; draft.posts[0]!.blocks[0]!.body = '开场。'
  await importDraft(page, draft)
  await page.getByRole('button', { name: '添加楼内同人文', exact: true }).click()
  await page.getByLabel('第1楼同人文篇名', { exact: true }).fill('测试文章')
  const fiction = page.getByRole('region', { name: '第1楼同人文2', exact: true })
  await fiction.getByRole('button', { name: 'Markdown', exact: true }).click()
  await page.getByRole('textbox', { name: '第1楼同人文2 Markdown', exact: true }).fill('### 第一节\n\n楼中的文章内容。')
  await page.getByRole('button', { name: '追加楼层', exact: true }).click()
  await page.getByLabel('第2楼昵称', { exact: true }).fill('回复者')
  await page.getByRole('textbox', { name: '第2楼聊天1', exact: true }).fill('正常聊天。')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Markdown', exact: true }).click()
  const posts = parseForumPosts(matter(await readFile((await (await downloaded).path())!, 'utf8')).content)
  expect(posts.map(p => p.author)).toEqual(['测试楼主', '回复者'])
  expect(parseForumBody(posts[0]!.bodyMarkdown).blocks.map(b => b.type)).toEqual(['markdown', 'fanfiction'])
  expect(posts[1]!.bodyMarkdown).toBe('正常聊天。')
  const long = createEditorDraft('forum'); Object.assign(long.metadata, draft.metadata)
  long.posts = Array.from({ length: 205 }, (_, i) => ({ id: crypto.randomUUID(), author: `作者${i}`, blocks: [{ ...createEditorBlock(), body: `正文${i}` }] }))
  await importDraft(page, long)
  await expect(page.locator('.tiptap')).toHaveCount(1)
  await expect(page.getByText('共 205 层 · 楼号保持原有顺序')).toBeVisible()
})

test('damaged imports and quota failures preserve current work, backups remain downloadable', async ({ page }) => {
  await accountFixture(page); await page.goto('/editor'); await importDraft(page, article())
  await page.getByLabel('导入 Markdown 或草稿备份').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') })
  await expect(page.getByRole('textbox', { name: '文章正文', exact: true })).toContainText('最初的正文。')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('hetwila-editor:')) throw new DOMException('Full', 'QuotaExceededError'); original.call(this, key, value) }
  })
  await page.getByRole('textbox', { name: '文章正文', exact: true }).fill('暂未存盘的修改。')
  await expect(page.getByText(/本机自动保存失败：/)).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载草稿备份', exact: true }).click()
  const saved = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'))
  expect(saved.body).toContain('暂未存盘的修改。')
})

test('another window pauses autosave and keeps both revisions as separate drafts', async ({ page, context }) => {
  await accountFixture(page); await page.goto('/editor'); await importDraft(page, article()); await saved(page)
  const other = await context.newPage(); await accountFixture(other); await other.goto('/editor')
  await expect(other.getByRole('textbox', { name: '文章正文', exact: true })).toContainText('最初的正文。')
  await page.getByRole('textbox', { name: '文章正文', exact: true }).fill('第一窗口修改。'); await saved(page)
  await expect(other.getByText('同一草稿已在另一窗口修改，自动保存已暂停。')).toBeVisible()
  await other.getByRole('textbox', { name: '文章正文', exact: true }).fill('第二窗口修改。')
  await other.getByRole('button', { name: '保留当前内容为副本', exact: true }).click(); await saved(other)
  const bodies = await page.evaluate(prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix) && !key.endsWith(':active')).map(([, raw]) => JSON.parse(raw).body), EDITOR_STORAGE_PREFIX)
  expect(bodies).toContain('第一窗口修改。'); expect(bodies).toContain('第二窗口修改。')
  await other.close()
})

test('admin cloud snapshots upload, restore a copy, survive failures and delete through authenticated Storage', async ({ page }) => {
  const api = await cloudFixture(page)
  await page.goto('/editor'); await importDraft(page, article())
  await page.getByRole('tab', { name: '云端草稿', exact: true }).click()
  await page.getByRole('button', { name: '暂存当前草稿', exact: true }).click()
  await expect(page.getByText('当前快照已暂存；继续编辑的内容会保存在本机。')).toBeVisible()
  expect(api.snapshots.size).toBe(1)
  await page.getByRole('tab', { name: '撰写正文', exact: true }).click()
  await page.getByRole('textbox', { name: '文章正文', exact: true }).fill('云端暂存后的本机修改。'); await saved(page)
  await page.getByRole('tab', { name: '云端草稿', exact: true }).click()
  await page.getByRole('button', { name: '打开云端草稿 编辑器测试', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文章正文', exact: true })).toContainText('最初的正文。')
  const bodies = await page.evaluate(prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix) && !key.endsWith(':active')).map(([, raw]) => JSON.parse(raw).body), EDITOR_STORAGE_PREFIX)
  expect(bodies).toContain('云端暂存后的本机修改。')
  await page.getByRole('tab', { name: '云端草稿', exact: true }).click()
  api.failures.upload = true
  await page.getByRole('button', { name: '暂存当前草稿', exact: true }).click()
  await expect(page.getByText('云端暂存失败，本机草稿仍然保留，请重试。')).toBeVisible()
  await page.getByRole('button', { name: '删除云端草稿 编辑器测试', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('尚无云端草稿。')).toBeVisible()
  expect(api.snapshots.size).toBe(0)
  expect(api.requests.every(r => r.authorization?.startsWith('Bearer '))).toBe(true)
})

for (const group of [undefined, 'guest'] as const) test(`cloud saving requires admin (${group || 'anonymous'})`, async ({ page }) => {
  const api = await accountFixture(page, group); await page.goto('/editor')
  await page.getByRole('tab', { name: '云端草稿', exact: true }).click()
  await expect(page.getByText(/登录管理员账号后可暂存到 Supabase/)).toBeVisible()
  await expect(page.getByRole('button', { name: '暂存当前草稿', exact: true })).toHaveCount(0)
  expect(api.requests.filter(r => r.path.includes('/storage/'))).toEqual([])
})

for (const mobile of [false, true]) for (const colorScheme of ['light', 'dark'] as const) test(`editor layout and keyboard semantics ${mobile ? 'mobile' : 'desktop'} ${colorScheme}`, async ({ page }) => {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }); await page.emulateMedia({ colorScheme })
  await accountFixture(page); await page.goto('/editor'); await importDraft(page, article())
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true })
  await editor.focus(); await page.keyboard.press('End'); await page.keyboard.type(' Keyboard edit.')
  await expect(editor).toContainText('Keyboard edit.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([])
  await page.screenshot({ path: test.info().outputPath(`editor-${mobile}-${colorScheme}.png`), fullPage: true })
  await page.getByRole('tab', { name: '元数据', exact: true }).click()
  await expect(page.getByLabel('纪年', { exact: true })).toHaveValue('0')
  await page.getByRole('button', { name: '添加正文事件', exact: true }).click()
  await page.getByLabel('事件1标题', { exact: true }).fill('待完善的事件')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([])
  await page.screenshot({ path: test.info().outputPath(`editor-metadata-${mobile}-${colorScheme}.png`), fullPage: true })
})

test('the static editor page has a no-JavaScript explanation and contains no drafts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage()
  await page.goto('/editor'); await expect(page.getByRole('heading', { level: 1, name: '文章与帖子编辑器' })).toBeVisible()
  await expect(page.getByText(/请启用 JavaScript 使用编辑器/)).toBeVisible()
  await expect(page.getByText('最初的正文。')).toHaveCount(0)
  await context.close()
})
