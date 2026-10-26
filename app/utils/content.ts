export const factLabels = {
  canon: '已确定设定', open: '开放问题', working: '工作设定',
  'story-local': '故事局部设定', deprecated: '已弃用设定',
}

export function normalizeQuery(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

export function matchesEntry(entry: { title: string, aliases: string[], sourceIds: string[], description: string, events?: { title: string, aliases: string[], sourceIds: string[], description: string }[] }, query: string) {
  const words = normalizeQuery(query).split(/\s+/).filter(Boolean)
  const text = normalizeQuery([entry, ...(entry.events ?? [])].flatMap(item => [item.title, ...item.aliases, ...item.sourceIds, item.description]).join(' '))
  return words.every(word => text.includes(word))
}
