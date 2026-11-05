import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'
import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'
import matter from 'gray-matter'
import type { ForumFanfictionBlock, ForumFanfictionEntry } from '../../shared/forum.ts'

const parser = unified().use(remarkParse).use(remarkGfm)
export { parseForumBody } from '../../shared/forum-body.ts'

// Generated MDC is internal: titles, scoped anchors and navigation all come
// from the validated manuscript, rather than author-supplied component props.
export function renderFanfiction(block: ForumFanfictionBlock, entry: ForumFanfictionEntry, previous?: ForumFanfictionEntry, next?: ForumFanfictionEntry) {
  const tree = parser.parse(block.bodyMarkdown)
  const slugger = new GithubSlugger()
  const edits: { start: number, end: number, value: string }[] = []
  const sections: { title: string, anchor: string, depth: number }[] = []
  const anchors = new Map<string, string>()
  for (const node of tree.children) {
    if (node.type !== 'heading') continue
    const slug = slugger.slug(toString(node)) || slugger.slug('section')
    const anchor = node === tree.children[0] ? `${entry.anchor}-title` : `${entry.anchor}-section-${slug}`.replace(/-+/g, '-').replace(/-$/u, '')
    anchors.set(slug, anchor)
    const start = node.position!.start.offset!
    const end = node.position!.end.offset!
    if (node === tree.children[0]) {
      edits.push({ start, end, value: '' })
    } else {
      const title = block.bodyMarkdown.slice(node.children[0]!.position!.start.offset!, node.children.at(-1)!.position!.end.offset!)
      const depth = Math.min(node.depth + 1, 6)
      sections.push({ title: toString(node), anchor, depth })
      edits.push({ start, end, value: `:h${depth}[${title}]{id="${anchor}"}` })
    }
  }
  visit(tree, 'link', node => {
    if (!node.url.startsWith('#')) return
    let slug: string
    try { slug = decodeURIComponent(node.url.slice(1)) } catch { return }
    const anchor = anchors.get(slug)
    if (!anchor) return
    const start = node.position!.start.offset!
    const end = node.position!.end.offset!
    if (edits.some(edit => start >= edit.start && end <= edit.end)) return
    const label = block.bodyMarkdown.slice(node.children[0]?.position?.start.offset ?? start + 1, node.children.at(-1)?.position?.end.offset ?? start + 1)
    edits.push({ start, end, value: `[${label}](#${encodeURIComponent(anchor)})` })
  })
  let body = block.bodyMarkdown
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.value + body.slice(edit.end)
  const characterCount = Array.from(toString({ ...tree, children: tree.children.slice(1) }).replace(/\s/gu, '')).length
  const fence = ':'.repeat(Math.max(2, ...Array.from(body.matchAll(/^(:{2,})/gm), match => match[1]!.length + 1)))
  const data = { ...entry, characterCount, sections, ...(previous ? { previous } : {}), ...(next ? { next } : {}) }
  return `${fence}forum-fanfiction\n${matter.stringify(body.trim(), data).trim()}\n${fence}`
}
