import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'
import type { ForumPostBlock } from './forum.ts'

const parser = unified().use(remarkParse).use(remarkGfm)
const opening = /^<!-- fanfiction: ([\p{L}\p{M}\p{N}·()-]+) -->$/u
const closing = '<!-- /fanfiction -->'

// Only these editorial boundaries may be added to the reading copy. Inspect
// top-level Markdown nodes so examples in code/quotes stay literal.
export function parseForumBody(markdown: string): { bodyMarkdown: string, blocks: ForumPostBlock[] } {
  const blocks: ForumPostBlock[] = []
  const removals: { start: number, end: number }[] = []
  const keys = new Set<string>()
  let active: { key: string, start: number } | undefined
  let cursor = 0
  const text = (end: number) => {
    const bodyMarkdown = markdown.slice(cursor, end).trim()
    if (bodyMarkdown) blocks.push({ type: 'markdown', bodyMarkdown })
  }
  for (const node of parser.parse(markdown).children) {
    if (node.type !== 'html' || !/^<!--\s*\/?fanfiction\b/u.test(node.value)) continue
    const match = opening.exec(node.value)
    const start = node.position!.start.offset!
    const end = node.position!.end.offset!
    if (!match && node.value !== closing) throw new Error('Invalid fanfiction marker; use a standalone <!-- fanfiction: 标识 --> or <!-- /fanfiction -->')
    // Remove the marker paragraph, preserving internal manuscript whitespace.
    removals.push({ start, end: end + (markdown.slice(end).match(/^(?:\r?\n){1,2}/u)?.[0].length ?? 0) })
    if (match) {
      if (active) throw new Error('Nested fanfiction blocks are not allowed')
      const key = match[1]!
      if (keys.has(key)) throw new Error(`Duplicate fanfiction key: ${key}`)
      keys.add(key)
      text(start)
      active = { key, start: end }
    } else {
      if (!active) throw new Error('Fanfiction closing marker has no opening marker')
      const bodyMarkdown = markdown.slice(active.start, start).trim()
      const [heading, ...body] = parser.parse(bodyMarkdown).children
      if (heading?.type !== 'heading' || heading.depth !== 2 || !toString(heading).trim()) throw new Error('Fanfiction must start with a nonempty level-two title')
      if (!body.some(node => node.type !== 'heading' && node.type !== 'html' && node.type !== 'thematicBreak')) throw new Error('Empty fanfiction body')
      if (body.some(node => node.type === 'heading' && node.depth <= 2)) throw new Error('Fanfiction sections must use level-three or deeper headings')
      if (body.some(node => node.type === 'heading' && !toString(node).trim())) throw new Error('Fanfiction section titles must not be empty')
      blocks.push({ type: 'fanfiction', key: active.key, title: toString(heading), bodyMarkdown })
      active = undefined
      cursor = end
    }
  }
  if (active) throw new Error(`Unclosed fanfiction block: ${active.key}`)
  text(markdown.length)
  let bodyMarkdown = markdown
  for (const { start, end } of removals.reverse()) bodyMarkdown = bodyMarkdown.slice(0, start) + bodyMarkdown.slice(end)
  return { bodyMarkdown: bodyMarkdown.trim(), blocks }
}
