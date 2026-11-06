import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
const parser = unified().use(remarkParse).use(remarkGfm)

export function parseForumPosts(markdown: string) {
  const tree = parser.parse(markdown)
  const markers = tree.children.flatMap(node => {
    if (node.type !== 'paragraph' || node.children.length !== 1 || node.children[0]?.type !== 'strong') return []
    const strong = node.children[0]
    if (strong.children.length !== 1 || strong.children[0]?.type !== 'text') return []
    const match = strong.children[0].value.match(/^([1-9]\d*)L｜(楼主 )?(.+)$/u)
    if (/^\d+L｜/u.test(strong.children[0].value) && !match) throw new Error('Invalid forum floor marker')
    return match ? [{ floor: Number(match[1]), author: match[3]!.trim(), markedAsAuthor: Boolean(match[2]), start: node.position!.start.offset!, end: node.position!.end.offset! }] : []
  })
  if (!markers.length || markdown.slice(0, markers[0]!.start).trim()) throw new Error('Forum body must start with **1L｜楼主 昵称**')
  const author = markers[0]!.author
  if (!markers[0]!.markedAsAuthor) throw new Error('Forum first floor must identify the original poster')
  return markers.map((marker, index) => {
    if (marker.floor !== index + 1) throw new Error(`Forum floors must be consecutive: expected ${index + 1}L`)
    if (!marker.author || (marker.markedAsAuthor && marker.author !== author)) throw new Error(`Invalid forum author: ${marker.floor}L`)
    const bodyMarkdown = markdown.slice(marker.end, markers[index + 1]?.start ?? markdown.length).trim()
    if (!bodyMarkdown) throw new Error(`Empty forum post: ${marker.floor}L`)
    return { floor: marker.floor, author: marker.author, isOriginalPoster: marker.author === author, bodyMarkdown }
  })
}
