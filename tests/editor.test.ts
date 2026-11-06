import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import matter from 'gray-matter'
import { createHash } from 'node:crypto'
import { createEditorDraft, createEditorBlock, importEditorMarkdown, serializeEditorDraft, parseEditorSnapshot, editorDownloads, validateEditorDraft, editorLink, needsMarkdownMode, editorSnapshotName, editorSnapshotTitle, editorForumPages, type EditorCatalogue } from '../shared/editor.ts'
import { parseForumPosts, readPublicForum } from '../scripts/lib/forum.ts'
import { parseForumBody } from '../shared/forum-body.ts'
import { readPublicContent } from '../scripts/lib/content.ts'
import { readStoryOriginals } from '../scripts/lib/stories.ts'
import { wikiSchema, storySchema } from '../shared/content-schema.ts'
import { forumThreadSchema } from '../shared/forum-schema.ts'
const catalogue: EditorCatalogue = JSON.parse(await readFile('.generated/editor-catalogue.json', 'utf8'))
const baseline = await readFile('content/wiki/禁制.md', 'utf8')

test('every existing article and forum round-trips through editor metadata, original text and fiction blocks', async () => {
  for (const folder of ['wiki', 'stories', 'forum']) for (const file of await readdir(`content/${folder}`)) {
    if (!file.endsWith('.md')) continue
    const raw = await readFile(`content/${folder}/${file}`, 'utf8'), draft = importEditorMarkdown(raw)
    assert.deepEqual(validateEditorDraft(draft, catalogue), [], file)
    const output = serializeEditorDraft(draft), before = matter(raw), after = matter(output)
    assert.deepEqual(after.data, (folder === 'forum' ? forumThreadSchema : folder === 'stories' ? storySchema : wikiSchema).parse(before.data), file)
    if (folder === 'forum') {
      assert.deepEqual(parseForumPosts(after.content), parseForumPosts(before.content), file)
      for (const post of parseForumPosts(after.content)) assert.doesNotThrow(() => parseForumBody(post.bodyMarkdown))
    } else assert.equal(after.content.trim(), before.content.trim(), file)
    assert.deepEqual(parseEditorSnapshot(JSON.stringify(draft)), draft)
  }
})

test('downloaded story/forum originals and manifest entries pass the real publication readers', async () => {
  for (const folder of ['stories', 'forum']) {
    const filename = (await readdir(`content/${folder}`)).find(f => f.endsWith('.md'))!
    const draft = importEditorMarkdown(await readFile(`content/${folder}/${filename}`, 'utf8'))
    draft.metadata.title = ` ${draft.metadata.title} `
    if (folder === 'forum') for (const field of ['community', 'board', 'category']) draft.metadata[field] = ` ${draft.metadata[field]} `
    const files = await editorDownloads(draft, catalogue)
    const root = await mkdtemp(join(tmpdir(), 'hetwila-editor-'))
    try {
      for (const file of files) {
        const path = join(root, file.path.replace(/^合并到 /u, ''))
        await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.text)
        if (file.path.startsWith('sources/')) assert.equal(file.name, path.split('/').at(-1))
      }
      const hash = createHash('sha256').update(files[1]!.text).digest('hex')
      assert.ok(Object.values(JSON.parse(files[2]!.text).files).includes(hash))
      if (folder === 'forum') assert.equal((await readPublicForum(root)).length, 1)
      else {
        // This reader validates identities/metadata; relations are covered by the complete corpus test.
        draft.metadata.relations = []
        draft.metadata.title = String(draft.metadata.title).trim()
        await writeFile(join(root, files[0]!.path), serializeEditorDraft(draft))
        await mkdir(join(root, 'content/wiki'), { recursive: true })
        assert.equal((await readStoryOriginals(root, await readPublicContent({ wiki: join(root, 'content/wiki'), stories: join(root, 'content/stories') }))).length, 1)
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})

test('new forum exports consecutive floors and mixed conversation/fiction without losing names', async () => {
  const draft = createEditorDraft('forum')
  Object.assign(draft.metadata, { title: '格式测试', routeKey: '格式测试', description: '测试', category: '同人', board: '交流', community: '测试社区', originalFile: '格式测试.md' })
  draft.posts[0]!.author = '名字[一]*'; draft.posts[0]!.blocks[0]!.body = '开场聊天。'
  draft.posts[0]!.blocks.push({ ...createEditorBlock('fanfiction'), title: '文章篇名', body: '### 第一节\n\n一段较长的文章。' }, { ...createEditorBlock(), body: '楼内后记。' })
  draft.posts.push({ id: crypto.randomUUID(), author: '读者', blocks: [{ ...createEditorBlock(), body: '正常回复。' }] })
  const output = await editorDownloads(draft, catalogue)
  const restored = importEditorMarkdown(output[0]!.text)
  assert.equal(restored.posts[0]!.author, '名字[一]*')
  assert.deepEqual(restored.posts[0]!.blocks.map(b => b.type), ['markdown', 'fanfiction', 'markdown'])
  assert.equal(restored.posts[1]!.author, '读者')
  const pages = editorForumPages('格式测试', parseForumPosts(matter(output[0]!.text).content).map(post => ({ ...post, blocks: parseForumBody(post.bodyMarkdown).blocks })))
  assert.ok(pages.find(p => p.path.includes('/author/'))?.anchors.includes('post-1'))
  assert.ok(pages[0]!.anchors.some(anchor => anchor.endsWith('-section-第一节')))
  draft.metadata.publicationStatus = 'published'
  draft.posts[1]!.blocks[0]!.body = '[楼主](/forum/threads/格式测试/author/page/1#post-1)'
  assert.deepEqual(validateEditorDraft(draft, catalogue), [])
  draft.posts[1]!.blocks[0]!.body = '**3L｜冒充楼层**\n\n非法分层。'
  assert.ok(validateEditorDraft(draft, catalogue).some(i => i.field === 'posts'))
})

test('links, evidence, event anchors, year zero, collisions and unsafe Markdown are checked', () => {
  const draft = importEditorMarkdown(baseline)
  assert.equal(validateEditorDraft(draft, catalogue).length, 0)
  assert.ok(JSON.stringify(draft.metadata).includes('"year":0'))
  for (const url of ['javascript:alert(1)', 'data:text/html,test']) assert.throws(() => editorLink('测试', url))
  assert.match(editorLink('[文字]', '/wiki/禁制#原理'), /\\\[/u)
  for (const body of ['<script>alert(1)</script>', '::some-component', '[错误](/wiki/不存在)', '[错误](javascript:alert)']) {
    const d = structuredClone(draft); d.body += '\n\n' + body
    assert.ok(validateEditorDraft(d, catalogue).some(i => i.level === 'error'), body)
  }
  const pending = structuredClone(draft); pending.metadata.publicationStatus = 'draft'; pending.body += '\n\n[待写](/wiki/待写)'
  assert.ok(validateEditorDraft(pending, catalogue).some(i => i.level === 'warning'))
  pending.metadata.uid = 'wiki:another-identity'
  assert.ok(validateEditorDraft(pending, catalogue).some(i => i.field === 'routeKey'))
  assert.equal(needsMarkdownMode('**文字**\n\n## 标题'), false)
  for (const body of ['<a id="zero"></a>', '|A|B|\n|-|-|\n|1|2|', '[文字][ref]\n\n[ref]: /wiki/禁制', '![图](https://example.com/a.png)']) assert.equal(needsMarkdownMode(body), true)
})

test('incomplete snapshots recover safely; invalid versions, shapes and YAML cannot replace a draft', () => {
  for (const kind of ['wiki', 'story', 'forum'] as const) {
    const draft = createEditorDraft(kind)
    assert.deepEqual(parseEditorSnapshot(JSON.stringify(draft)), draft)
    for (const metadata of [{}, { ...draft.metadata, worldTime: null }, { ...draft.metadata, sourceRefs: 'wrong' }]) assert.throws(() => parseEditorSnapshot(JSON.stringify({ ...draft, metadata })))
    assert.throws(() => parseEditorSnapshot(JSON.stringify({ ...draft, version: 999 })))
  }
  assert.throws(() => importEditorMarkdown('---\na: 1\na: 2\n---\ntext'), /YAML/u)
  assert.throws(() => importEditorMarkdown('---\na: !!js/function function(){}\n---\ntext'), /YAML/u)
  const malicious = baseline.replace('title: 禁制', 'title: 禁制\nunrecognized_field: 1')
  assert.throws(() => importEditorMarkdown(malicious), /格式/u)
  assert.ok(catalogue.pages.every(p => !p.path.includes('/private/')))
  assert.equal(catalogue.sources.length, 47)
})

test('Chinese cloud titles have valid ASCII object keys and remain readable after decoding', () => {
  const draft = createEditorDraft('story'); draft.metadata.title = '中文标题（测试）'
  const name = editorSnapshotName(draft)
  assert.match(name, /^[0-9]{13}-[A-Za-z0-9_-]+-[0-9a-f-]{36}\.json$/u)
  assert.ok(name.length + 37 <= 240)
  assert.equal(editorSnapshotTitle(name), draft.metadata.title)
  assert.notEqual(editorSnapshotName(draft), name)
})
