import { h, type VNodeChild } from 'vue'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Definition, Nodes } from 'mdast'
import { COMMENT_MAX_LENGTH } from './comment.ts'
import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'

export interface ReadingMarkdownOptions { prefix: string; minimumHeading?: number; skipTitle?: boolean; floorLink?: (floor: number) => string | undefined }
export interface ReadingHeading { id: string; text: string; depth: number }

const parser = unified().use(remarkParse).use(remarkGfm)
export function commentUrl(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f\\]/u.test(value)) return
  try {
    const url = new URL(value, 'https://hetwila.github.io')
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* Invalid URLs render as text. */ }
}

/** User Markdown is data, never HTML, MDC, Vue components, styles or attributes. */
export function renderCommentMarkdown(source: string): VNodeChild[] { return renderMarkdown(source).nodes }
export function renderReadingMarkdown(source: string, options: ReadingMarkdownOptions) { return renderMarkdown(source, options) }

function renderMarkdown(source: string, options?: ReadingMarkdownOptions): { nodes: VNodeChild[], headings: ReadingHeading[] } {
  source = source.slice(0, options ? 500000 : COMMENT_MAX_LENGTH)
  try {
    const tree = parser.parse(source), definitions = new Map<string, Definition>()
    const headings: ReadingHeading[] = [], headingIds = new Map<Nodes, string>(), fragments = new Map<string, string>(), slugger = new GithubSlugger()
    if (options?.skipTitle && tree.children[0]?.type === 'heading') tree.children.shift()
    if (options) visit(tree, 'heading', node => {
      const slug = slugger.slug(toString(node)) || slugger.slug('section')
      const id = `${options.prefix}-${slug}`
      headingIds.set(node, id); fragments.set(slug, id)
      headings.push({ id, text: toString(node), depth: Math.min(6, Math.max(options.minimumHeading || 2, node.depth + (options.minimumHeading === 4 ? 1 : 0))) })
    })
    visit(tree, 'definition', node => { definitions.set(node.identifier.toLowerCase(), node) })
    function render(node: Nodes, depth = 0, inLink = false): VNodeChild {
      if (depth > 24) return '…'
      const children = () => 'children' in node ? node.children.map(n => render(n, depth + 1, inLink || node.type === 'link' || node.type === 'linkReference')) : []
      function link(url: string | undefined, content: VNodeChild) {
        let href = url && commentUrl(url)
        if (options && href && url?.startsWith('/') && !url.startsWith('//') && new URL(href).origin === 'https://hetwila.github.io') href = url
        if (options && href && url?.startsWith('#')) {
          try { href = `#${fragments.get(decodeURIComponent(url.slice(1))) || decodeURIComponent(url.slice(1))}` } catch { href = undefined }
        }
        return href ? h('a', { href, rel: 'ugc nofollow noopener noreferrer', ...(new URL(href, 'https://hetwila.github.io').origin !== 'https://hetwila.github.io' ? { target: '_blank' } : {}) }, [content]) : content
      }
      function image(url: string | undefined, alt: string | null | undefined) {
        const src = url && commentUrl(url)
        return src ? h('img', { src, alt: alt || '评论图片', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }) : (alt || '图片链接不可用')
      }
      switch (node.type) {
        case 'text': {
          if (!options?.floorLink || inLink) return node.value
          return node.value.split(/(\b[1-9]\d*L\b)/gu).map(part => {
            const path = /^[1-9]\d*L$/u.test(part) ? options.floorLink!(Number(part.slice(0, -1))) : undefined
            return path ? link(path, part) : part
          })
        }
        case 'html': return node.value
        case 'paragraph': return h('p', children())
        case 'heading': {
          const heading = headings.find(item => item.id === headingIds.get(node))
          return heading ? h(`h${heading.depth}`, { id: heading.id }, children()) : h('p', { class: 'comment-markdown-heading' }, children())
        }
        case 'strong': return h('strong', children())
        case 'emphasis': return h('em', children())
        case 'delete': return h('del', children())
        case 'inlineCode': return h('code', node.value)
        case 'code': return h('pre', { tabindex: 0, 'aria-label': options ? '代码，可横向滚动' : '评论代码，可横向滚动' }, h('code', node.value))
        case 'blockquote': return h('blockquote', children())
        case 'break': return h('br')
        case 'thematicBreak': return h('hr')
        case 'list': return h(node.ordered ? 'ol' : 'ul', node.ordered ? { start: node.start || 1 } : {}, children())
        case 'listItem': {
          if (node.checked === null || node.checked === undefined) return h('li', children())
          const marker = h('span', { 'aria-label': node.checked ? '已完成' : '未完成' }, node.checked ? '☑ ' : '☐ ')
          const first = node.children[0]
          return h('li', { class: 'comment-task-item' }, first?.type === 'paragraph'
            ? [h('p', [marker, ...first.children.map(n => render(n, depth + 1))]), ...node.children.slice(1).map(n => render(n, depth + 1))]
            : [marker, ...children()])
        }
        case 'link': return link(node.url, children())
        case 'linkReference': return link(definitions.get(node.identifier.toLowerCase())?.url, children())
        case 'image': return image(node.url, node.alt)
        case 'imageReference': return image(definitions.get(node.identifier.toLowerCase())?.url, node.alt)
        case 'table': return h('div', { class: options ? 'reading-table-scroll' : 'comment-table-scroll', tabindex: 0, role: 'group', 'aria-label': options ? '表格，可横向滚动' : '评论表格，可横向滚动' }, h('table', [
          h('thead', node.children.slice(0, 1).map(row => h('tr', row.children.map(cell => h('th', { scope: 'col' }, cell.children.map(n => render(n, depth + 1))))))),
          h('tbody', node.children.slice(1).map(row => h('tr', row.children.map(cell => h('td', cell.children.map(n => render(n, depth + 1))))))),
        ]))
        case 'definition': return null
        case 'footnoteReference': return `[${node.identifier}]`
        default: return children()
      }
    }
    return { nodes: tree.children.map(node => render(node)), headings }
  } catch { return { nodes: [h('p', source)], headings: [] } }
}
