import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { parseForumBody } from '../scripts/lib/forum-fanfiction.ts'
import { readPublicForum, renderForumPost } from '../scripts/lib/forum.ts'
import { forumFanfictionEntries } from '../shared/forum.ts'

const root = new URL('..', import.meta.url).pathname
const key = '如果再一次喜欢上你'
const wrap = (body: string, key = '篇一') => `<!-- fanfiction: ${key} -->\n\n${body}\n\n<!-- /fanfiction -->`
const story = '## 篇名\n\n### 一\n\n这是正文，2L不是楼层引用。\n\n[回到一](#一)\n\n### 一\n\n另一节。'

test('a floor can alternate chat and multiple fiction blocks without changing manuscript text', () => {
  const result = parseForumBody(`篇前聊天。\n\n${wrap(story)}\n\n篇间聊天。\n\n${wrap('## 短篇\n\n正文。', '篇二')}\n\n篇后聊天。`)
  assert.deepEqual(result.blocks.map(block => block.type), ['markdown', 'fanfiction', 'markdown', 'fanfiction', 'markdown'])
  assert.equal(result.blocks[1]?.bodyMarkdown, story)
  assert.equal(result.bodyMarkdown, `篇前聊天。\n\n${story}\n\n篇间聊天。\n\n## 短篇\n\n正文。\n\n篇后聊天。`)
  const literal = '```markdown\n' + wrap(story) + '\n```\n\n> <!-- fanfiction: 引用 -->'
  assert.deepEqual(parseForumBody(literal), { bodyMarkdown: literal, blocks: [{ type: 'markdown', bodyMarkdown: literal }] })
  const whitespace = '## 空行保留\n\n```\n一\n\n\n二\n```\n\n最后。'
  assert.equal(parseForumBody(wrap(whitespace)).bodyMarkdown, whitespace)
})

test('malformed, empty, nested and duplicate fiction boundaries fail instead of swallowing chat', () => {
  for (const [body, error] of [
    ['<!-- /fanfiction -->', /no opening/],
    ['<!-- fanfiction: 篇一 -->\n\n正文。', /Unclosed/],
    [wrap('没有标题。'), /level-two title/],
    [wrap('## 只有标题'), /Empty/],
    [wrap('## 标题\n\n正文\n\n## 另一个标题\n\n正文'), /level-three/],
    [wrap(wrap(story)), /Nested/],
    [`${wrap(story)}\n\n${wrap(story)}`, /Duplicate/],
    ['<!-- fanfiction: ../非法 -->\n\n正文。\n\n<!-- /fanfiction -->', /Invalid/],
  ] as const) assert.throws(() => parseForumBody(body), error)
})

test('all attachment text is retained and the example only adds disclosed forum framing', async () => {
  const original = await readFile(join(root, 'sources/archives/如果再一次喜欢上你.md'))
  const checksum = (await readFile(join(root, 'sources/archives/如果再一次喜欢上你.sha256'), 'utf8')).split(' ')[0]
  assert.equal(createHash('sha256').update(original).digest('hex'), checksum)
  const source = (await readPublicForum(root)).find(thread => thread.metadata.routeKey === key)!
  const manuscripts = source.posts.flatMap(post => post.blocks.filter(block => block.type === 'fanfiction').map(block => block.bodyMarkdown))
  assert.equal(manuscripts.length, 2)
  assert.equal(manuscripts.join('\n\n---\n\n'), original.toString('utf8').split('\n').slice(1).join('\n').trim())
  assert.ok(source.metadata.description.includes('临时测试内容'))
  assert.equal(source.posts.length, 2)
  assert.ok(source.posts.every(post => post.author === '窗边的速写本' && post.blocks.length === 3))
})

test('scoped fiction anchors and cross-page navigation work for multiple blocks and repeated section titles', async () => {
  const source = (await readPublicForum(root)).find(thread => thread.metadata.routeKey === key)!
  const posts = Array.from({ length: 21 }, (_, i) => ({ ...source.posts[0]!, floor: i + 1, ...parseForumBody(i === 0 || i === 20 ? `聊天2L。\n\n${wrap(story)}` : '普通聊天。') }))
  const entries = forumFanfictionEntries(key, posts)
  assert.equal(entries.length, 2)
  assert.equal(entries[1]!.path, `/forum/threads/${key}/page/2#post-21-fanfiction-篇一`)
  const compiled = renderForumPost(posts[0]!, key, posts)
  assert.ok(compiled.includes('[2L](<'))
  assert.ok(compiled.includes('这是正文，2L不是楼层引用。'))
  assert.ok(compiled.includes(':h4[一]{id="post-1-fanfiction-篇一-section-一"}'))
  assert.ok(compiled.includes(':h4[一]{id="post-1-fanfiction-篇一-section-一-1"}'))
  assert.ok(compiled.includes(`[回到一](#${encodeURIComponent('post-1-fanfiction-篇一-section-一')})`))
  assert.ok(compiled.includes(entries[1]!.path))
  assert.ok(renderForumPost(posts[20]!, key, posts).includes(entries[0]!.path))
})

test('layout cannot bypass source validation and unpublished fiction cannot enter exports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hetwila-fanfiction-'))
  try {
    await cp(join(root, 'content/forum'), join(directory, 'content/forum'), { recursive: true })
    await cp(join(root, 'sources/forum'), join(directory, 'sources/forum'), { recursive: true })
    const path = join(directory, `content/forum/${key}.md`)
    const raw = await readFile(path, 'utf8')
    await writeFile(path, raw.replace('艾洛希亚醒来的时候', '被意外改写的正文'))
    await assert.rejects(readPublicForum(directory), /text differs/)
    const { data, content } = matter(raw)
    for (const fields of [{ publicationStatus: 'draft' }, { visibility: 'private' }, { publicationStatus: 'withdrawn' }]) {
      await writeFile(path, matter.stringify(content, { ...data, ...fields }))
      const threads = await readPublicForum(directory)
      assert.ok(threads.every(thread => thread.metadata.routeKey !== key))
      assert.deepEqual(threads.flatMap(thread => forumFanfictionEntries(thread.metadata.routeKey, thread.posts)), [])
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
