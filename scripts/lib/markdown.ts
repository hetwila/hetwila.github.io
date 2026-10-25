import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import GithubSlugger from 'github-slugger'

const parser = unified().use(remarkParse).use(remarkGfm)

export function analyzeMarkdown(markdown: string) {
  const tree = parser.parse(markdown)
  const definitions = new Map<string, string>()
  visit(tree, 'definition', node => { definitions.set(node.identifier, node.url) })
  const anchors = new Set<string>()
  const explicitAnchors = new Set<string>()
  const links: { url: string, label: string, sectionId?: string, start: number, end: number }[] = []
  const slugger = new GithubSlugger()
  let sectionId: string | undefined
  visit(tree, node => {
    if (node.type === 'heading') {
      sectionId = slugger.slug(toString(node))
      anchors.add(sectionId)
    }
    if (node.type === 'html') {
      for (const match of node.value.matchAll(/\bid=["']([^"']+)["']/g)) {
        if (explicitAnchors.has(match[1]!)) throw new Error(`Duplicate anchor: ${match[1]}`)
        explicitAnchors.add(match[1]!)
        anchors.add(match[1]!)
      }
    }
    if (node.type === 'link' || node.type === 'linkReference') {
      const url = node.type === 'link' ? node.url : definitions.get(node.identifier)
      if (!url) throw new Error(`Unresolved Markdown reference: ${toString(node)}`)
      links.push({ url, label: toString(node), sectionId, start: node.position!.start.offset!, end: node.position!.end.offset! })
    }
  })
  return { anchors, explicitAnchors, links }
}
