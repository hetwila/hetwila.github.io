import { h, type VNodeChild } from 'vue'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Definition, Nodes } from 'mdast'
import { COMMENT_MAX_LENGTH } from './comment.ts'

const parser = unified().use(remarkParse).use(remarkGfm)
export function commentUrl(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f\\]/u.test(value)) return
  try {
    const url = new URL(value, 'https://hetwila.github.io')
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* Invalid URLs render as text. */ }
}

/** User Markdown is data, never HTML, MDC, Vue components, styles or attributes. */
export function renderCommentMarkdown(source: string): VNodeChild[] {
  source = source.slice(0, COMMENT_MAX_LENGTH)
  try {
    const tree = parser.parse(source), definitions = new Map<string, Definition>()
    visit(tree, 'definition', node => { definitions.set(node.identifier.toLowerCase(), node) })
    function render(node: Nodes, depth = 0): VNodeChild {
      if (depth > 24) return '…'
      const children = () => 'children' in node ? node.children.map(n => render(n, depth + 1)) : []
      function link(url: string | undefined, content: VNodeChild) {
        const href = url && commentUrl(url)
        return href ? h('a', { href, rel: 'ugc nofollow noopener noreferrer', ...(new URL(href).origin !== 'https://hetwila.github.io' ? { target: '_blank' } : {}) }, [content]) : content
      }
      function image(url: string | undefined, alt: string | null | undefined) {
        const src = url && commentUrl(url)
        return src ? h('img', { src, alt: alt || '评论图片', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }) : (alt || '图片链接不可用')
      }
      switch (node.type) {
        case 'text': case 'html': return node.value
        case 'paragraph': return h('p', children())
        case 'heading': return h('p', { class: 'comment-markdown-heading' }, children())
        case 'strong': return h('strong', children())
        case 'emphasis': return h('em', children())
        case 'delete': return h('del', children())
        case 'inlineCode': return h('code', node.value)
        case 'code': return h('pre', { tabindex: 0, 'aria-label': '评论代码，可横向滚动' }, h('code', node.value))
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
        case 'table': return h('div', { class: 'comment-table-scroll', tabindex: 0, role: 'group', 'aria-label': '评论表格，可横向滚动' }, h('table', [
          h('thead', node.children.slice(0, 1).map(row => h('tr', row.children.map(cell => h('th', { scope: 'col' }, cell.children.map(n => render(n, depth + 1))))))),
          h('tbody', node.children.slice(1).map(row => h('tr', row.children.map(cell => h('td', cell.children.map(n => render(n, depth + 1))))))),
        ]))
        case 'definition': return null
        case 'footnoteReference': return `[${node.identifier}]`
        default: return children()
      }
    }
    return tree.children.map(node => render(node))
  } catch { return [h('p', source)] }
}
