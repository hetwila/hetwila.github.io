import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { commentUrl, renderCommentMarkdown } from '../shared/comment-markdown.ts'
const render = (source: string) => renderToString(createSSRApp({ render: () => h('div', renderCommentMarkdown(source)) }))

test('comment Markdown preserves formatting but demotes every heading and excludes executable HTML/MDC', async () => {
  const html = await render('# Heading\n\n**Strong** *emphasis* ~~removed~~ `code`\n\n<style>body { display:none }</style>\n<script>alert(1)</script>\n\n::dangerous-component\n\n<img src=x onerror=alert(1)>')
  assert.match(html, /<p class="comment-markdown-heading">Heading<\/p>/)
  assert.match(html, /<strong>Strong<\/strong>/); assert.match(html, /<em>emphasis<\/em>/); assert.match(html, /<del>removed<\/del>/)
  assert.doesNotMatch(html, /<(?:h[1-6]|script|style|img|dangerous-component)[\s>]/)
  assert.match(html, /&lt;script&gt;/)
})
test('comment URLs reject script/data protocols, credentials, control characters and encoded Markdown attacks', async () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', 'vbscript:msgbox(1)', 'https://user:password@example.test', 'java\nscript:alert(1)', '\\evil.example/x']) assert.equal(commentUrl(url), undefined)
  assert.equal(commentUrl('/stories/第一次选择'), 'https://hetwila.github.io/stories/%E7%AC%AC%E4%B8%80%E6%AC%A1%E9%80%89%E6%8B%A9')
  const html = await render('[evil](javascript&#58;alert%281%29) ![evil](data:image/png;base64,x) [safe](https://example.test)')
  assert.doesNotMatch(html, /href="javascript|src="data:/)
  assert.match(html, /rel="ugc nofollow noopener noreferrer"/); assert.match(html, /target="_blank"/)
})
test('comment GFM tables, tasks, quotes, links and fenced code retain bounded wrapper semantics', async () => {
  const html = await render('> quoted\n\n- [x] done\n- [ ] pending\n\n| Left | Right |\n| --- | --- |\n| A | B |\n\n```html\n<script>literal</script>\n```\n\n[reference][x]\n\n[x]: https://example.test')
  assert.match(html, /<blockquote>/); assert.match(html, /aria-label="已完成"/)
  assert.match(html, /class="comment-table-scroll"/); assert.match(html, /<th scope="col">/)
  assert.match(html, /<pre tabindex="0"/); assert.match(html, /&lt;script&gt;literal&lt;\/script&gt;/)
  assert.match(html, /href="https:\/\/example.test\/"/)
})
