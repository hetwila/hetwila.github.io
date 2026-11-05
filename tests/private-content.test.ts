import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { privateDocumentSchema, privateContentPath, privateForumPath } from '../shared/private-content.ts'
import { renderReadingMarkdown } from '../shared/comment-markdown.ts'
import { fetchPrivateRoutes } from '../scripts/lib/private-routes.ts'

const id = '11111111-1111-4111-8111-111111111111'
test('private submissions validate long-form prose, consecutive floors and existing fanfiction boundaries', () => {
  const base = { kind: 'story', title: '标题', description: '', category: '', author_name: '', body_markdown: '正文。', forum_posts: [], status: 'draft' }
  assert.equal(privateDocumentSchema.parse(base).body_markdown, '正文。')
  assert.equal(privateDocumentSchema.parse(base).age_rating, 'general')
  assert.equal(privateDocumentSchema.parse({ ...base, age_rating: 'r18' }).age_rating, 'r18')
  for (const age_rating of ['R-18', 'unknown', null]) assert.equal(privateDocumentSchema.safeParse({ ...base, age_rating }).success, false)
  assert.equal(privateDocumentSchema.safeParse({ ...base, body_markdown: ' ' }).success, false)
  const forum = { ...base, kind: 'forum', body_markdown: '', forum_posts: [{ floor: 1, author: '楼主', isOriginalPoster: true, body: '聊天。\n\n<!-- fanfiction: 一 -->\n\n## 篇名\n\n### 第一节\n\n文章。\n\n<!-- /fanfiction -->\n\n继续聊天。' }] }
  assert.ok(privateDocumentSchema.safeParse(forum).success)
  assert.equal(privateDocumentSchema.safeParse({ ...forum, forum_posts: [{ ...forum.forum_posts[0], floor: 2 }] }).success, false)
  assert.equal(privateDocumentSchema.safeParse({ ...forum, forum_posts: [{ ...forum.forum_posts[0], body: '<!-- fanfiction: 一 -->\n\n## 篇名\n\n正文。' }] }).success, false)
})
test('private Markdown preserves article headings, scoped duplicate anchors, full prose and inert HTML/MDC', async () => {
  const text = '# 开始\n\n## 同名\n\n## 同名\n\n[章节](#同名)\n\n' + '长文'.repeat(8000) + '\n\n<script>window.stolen=true</script>\n\n::some-component\n\n[危险](javascript:alert%281%29)'
  const rendered = renderReadingMarkdown(text, { prefix: 'document-test' })
  const html = await renderToString(createSSRApp({ render: () => h('div', rendered.nodes) }))
  assert.equal(rendered.headings.length, 3)
  assert.deepEqual(rendered.headings.map(h => h.id), ['document-test-开始', 'document-test-同名', 'document-test-同名-1'])
  assert.match(html, /<h2 id="document-test-开始">/)
  assert.match(html, /href="#document-test-同名"/)
  assert.ok(html.includes('长文'.repeat(8000)))
  assert.doesNotMatch(html, /<script|<some-component|href="javascript/)
  const fiction = renderReadingMarkdown('## 篇名\n\n### 小节\n\n正文2L。', { prefix: 'post-1-fiction', minimumHeading: 4, skipTitle: true })
  assert.equal(fiction.headings[0]?.depth, 4)
  assert.equal(fiction.headings.length, 1)
})
test('floor links preserve the generic reader ID, page and full-discussion anchors', () => {
  assert.equal(privateContentPath(id), `/private/${id}`)
  assert.throws(() => privateContentPath('../wiki'))
  assert.equal(privateForumPath(`/private/read?id=${id}`, 2, false, 21), `/private/read?id=${id}&page=2#post-21`)
  assert.equal(privateForumPath(`/private/${id}?page=3&author=1`, 1), `/private/${id}`)
})
const config = { PRIVATE_CONTENT_ROUTES: 'required', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_KEY: 'sb_publishable_test' }
test('build route discovery reads only paths, follows keyset pages and fails closed on remote errors or unsafe records', async () => {
  const calls: URL[] = []
  const routes = await fetchPrivateRoutes(config, async input => {
    const url = new URL(String(input)); calls.push(url)
    return Response.json(calls.length === 1 ? [{ path: `/private/${id}` }] : [])
  })
  assert.deepEqual(routes, [`/private/${id}`])
  assert.equal(calls[0]!.pathname, '/rest/v1/private_content_routes')
  assert.equal(calls[0]!.searchParams.get('select'), 'path')
  assert.equal(calls[1]!.searchParams.get('path'), `gt./private/${id}`)
  assert.deepEqual(await fetchPrivateRoutes({}, async () => { throw new Error('must not fetch in an offline build') }), [])
  for (const response of [new Response('', { status: 503 }), Response.json([{ path: '/private/../../wiki' }]), Response.json([{ path: `/private/${id}`, title: 'leak' }]), Response.json({ path: `/private/${id}` })]) {
    await assert.rejects(fetchPrivateRoutes(config, async () => response))
  }
  await assert.rejects(fetchPrivateRoutes({ PRIVATE_CONTENT_ROUTES: 'required' }))
  await assert.rejects(fetchPrivateRoutes({ ...config, SUPABASE_KEY: 'sb_secret_do_not_print' }))
})
