import { readingFingerprint, type ReadingPosition } from '#shared/reading'
export interface ReadingBlock { element: HTMLElement; key: string }
export function readingBlocks(root: HTMLElement): ReadingBlock[] {
  const counts = new Map<string, number>()
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,table,figure'))
    .filter(element => !element.parentElement?.closest('li,pre,blockquote,table,figure') || !root.contains(element.parentElement.closest('li,pre,blockquote,table,figure')))
  return (blocks.length ? blocks : [root]).map(element => {
    const hash = readingFingerprint(element.textContent || element.tagName), index = counts.get(hash) || 0
    counts.set(hash, index + 1)
    return { element, key: `${hash}:${index}` }
  })
}
export function readPosition(root: HTMLElement, blocks: ReadingBlock[], top: number, height: number): ReadingPosition {
  const rect = root.getBoundingClientRect()
  let index = blocks.findIndex(block => block.element.getBoundingClientRect().bottom > top)
  if (index < 0) index = Math.max(0, blocks.length - 1)
  const block = blocks[index]!, bounds = block.element.getBoundingClientRect()
  const progress = rect.height <= height ? (rect.top <= top ? 1 : 0) : Math.max(0, Math.min(1, (top - rect.top) / (rect.height - height)))
  return { key: block.key, index, offset: Math.max(0, Math.min(1, (top - bounds.top) / Math.max(1, bounds.height))), progress }
}
export function positionDelta(root: HTMLElement, blocks: ReadingBlock[], position: ReadingPosition, top: number, height: number) {
  if (position.progress >= 0.999) return root.getBoundingClientRect().bottom - (top + height)
  const block = blocks.find(block => block.key === position.key) || blocks[Math.min(position.index, blocks.length - 1)]
  if (!block) return root.getBoundingClientRect().top - top
  const rect = block.element.getBoundingClientRect()
  return rect.top + rect.height * position.offset - top
}
