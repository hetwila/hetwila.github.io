import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { parseForumPosts, readPublicForum, linkForumFloors } from '../scripts/lib/forum.ts'
import { analyzeMarkdown, markdownText } from '../scripts/lib/markdown.ts'

const root = new URL('..', import.meta.url).pathname

async function fixture(action: (dir: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'hetwila-forum-'))
  try {
    await cp(join(root, 'content/forum'), join(directory, 'content/forum'), { recursive: true })
    await cp(join(root, 'sources/forum'), join(directory, 'sources/forum'), { recursive: true })
    await action(directory)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('forum import preserves every author and floor, with a separate discussion scope', async () => {
  const thread = (await readPublicForum(root)).find(thread => thread.metadata.routeKey === '皇族历史同人讨论')
  assert.ok(thread)
  assert.equal(thread.posts.length, 204)
  assert.equal(new Set(thread.posts.map(post => post.author)).size, 24)
  assert.equal(thread.posts.filter(post => post.isOriginalPoster).length, 17)
  assert.equal(thread.posts.at(-1)?.bodyMarkdown, '我收回刚才的谢谢。')
  assert.equal(new Set(thread.posts.map(post => post.uid)).size, 204)
  for (const post of thread.posts) {
    assert.equal(post.scopeUid, thread.metadata.uid)
    assert.equal(post.narrativeLayer, 'in-world-discussion')
    assert.equal(markdownText(linkForumFloors(post.bodyMarkdown, thread.metadata.routeKey, 204)), markdownText(post.bodyMarkdown))
  }
})

test('forum reader rejects changed original bytes, edited replies and incorrect metadata', async () => {
  await fixture(async dir => {
    const source = join(dir, 'sources/forum/20261027-0901-皇族历史同人讨论.md')
    await writeFile(source, `${await readFile(source, 'utf8')}\n`)
    await assert.rejects(readPublicForum(dir), /checksum mismatch/)
  })
  await fixture(async dir => {
    const file = join(dir, 'content/forum/皇族历史同人讨论.md')
    const raw = await readFile(file, 'utf8')
    await writeFile(file, raw.replace('我收回刚才的谢谢。', '被意外修改的回复。'))
    await assert.rejects(readPublicForum(dir), /text differs from original/)
    const { data, content } = matter(raw)
    await writeFile(file, matter.stringify(content, { ...data, title: '另一个标题' }))
    await assert.rejects(readPublicForum(dir), /original header differs/)
    await writeFile(file, matter.stringify(content, { ...data, scopeUid: 'thread:别的主题' }))
    await assert.rejects(readPublicForum(dir), /scope must match uid/)
    await writeFile(file, matter.stringify(content, { ...data, relations: [{ type: 'discusses', target: 'wiki:ban' }] }))
    await assert.rejects(readPublicForum(dir), /Unrecognized key/)
  })
})

test('unpublished forum material cannot enter the public collection and identities cannot collide', async () => {
  await fixture(async dir => {
    const file = join(dir, 'content/forum/皇族历史同人讨论.md')
    const { data, content } = matter(await readFile(file, 'utf8'))
    for (const fields of [{ publicationStatus: 'draft' }, { publicationStatus: 'withdrawn' }, { visibility: 'private' }]) {
      await writeFile(file, matter.stringify(content, { ...data, ...fields }))
      assert.ok((await readPublicForum(dir)).every(thread => thread.metadata.routeKey !== '皇族历史同人讨论'))
    }
    await writeFile(join(dir, 'content/forum/重名测试.md'), matter.stringify(content, { ...data, routeKey: '重名测试' }))
    await assert.rejects(readPublicForum(dir), /Duplicate forum identity/)
  })
})

test('floor markers are structural Markdown, and only valid same-thread mentions become links', () => {
  const prefix = '**1L｜楼主 甲**\n\n开楼。\n\n'
  assert.throws(() => parseForumPosts(`${prefix}**3L｜乙**\n\n漏楼。`), /consecutive/)
  assert.throws(() => parseForumPosts(`${prefix}**1L｜乙**\n\n重复。`), /consecutive/)
  assert.throws(() => parseForumPosts(`${prefix}**2L｜楼主 乙**\n\n冒认。`), /Invalid forum author/)
  assert.throws(() => parseForumPosts(`${prefix}**2L｜乙**`), /Empty forum post/)
  assert.throws(() => parseForumPosts(`${prefix}**0L｜乙**\n\n错误楼号。`), /Invalid forum floor marker/)
  const quoted = `${prefix}> **2L｜乙**\n> 引用中不另开一楼。\n\n\`\`\`\n**2L｜乙**\n\`\`\``
  assert.equal(parseForumPosts(quoted).length, 1)
  const linked = linkForumFloors('21L你说得对。205L不存在。支持21L。\n\n`21L`\n\n[21L](https://example.com/21L)', '测试主题', 204)
  assert.deepEqual(analyzeMarkdown(linked).links.map(link => decodeURI(link.url)), ['/forum/threads/测试主题/page/2#post-21', '/forum/threads/测试主题/page/2#post-21', 'https://example.com/21L'])
  assert.ok(linked.includes('你说得对。205L不存在。'))
  assert.ok(linked.includes('`21L`'))
  assert.ok(linked.includes('[21L](https://example.com/21L)'))
  assert.ok(!linked.includes('/wiki/'))
  const spacedTitle = linkForumFloors('支持21L。', '中文 主题(测试)', 204)
  assert.equal(decodeURI(analyzeMarkdown(spacedTitle).links[0]!.url), '/forum/threads/中文 主题(测试)/page/2#post-21')
  assert.equal(markdownText(spacedTitle), '支持21L。')
})
