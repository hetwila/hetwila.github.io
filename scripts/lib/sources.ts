import { readFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { createHash } from 'node:crypto'
import { routeKeySchema } from '../../shared/content-schema.ts'
import { analyzeMarkdown } from './markdown.ts'

export async function readSources(root: string) {
  const directory = join(root, 'sources/releases/3.0.3')
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { files: Record<string, string> }
  const mapping = JSON.parse(await readFile(join(root, 'sources/reading-map.json'), 'utf8')) as { path: string, routeKey: string, title: string, description: string }[]
  const sources = await Promise.all(mapping.map(async item => {
    routeKeySchema.parse(item.routeKey)
    if (!Object.hasOwn(manifest.files, item.path)) throw new Error(`Source is not allowlisted: ${item.path}`)
    const raw = await readFile(join(directory, item.path), 'utf8')
    const sha256 = createHash('sha256').update(raw).digest('hex')
    if (sha256 !== manifest.files[item.path]) throw new Error(`Source checksum mismatch: ${item.path}`)
    return { ...item, path: `/reference/${item.routeKey}`, sourcePath: item.path, raw, sha256, analysis: analyzeMarkdown(raw) }
  }))
  if (new Set(sources.map(item => item.path)).size !== sources.length) throw new Error('Duplicate reference route')
  return sources.map(source => {
    const replacements = source.analysis.links.map(link => {
      if (/^(https?:|mailto:)/.test(link.url)) return undefined
      const [file, hash] = link.url.split('#')
      const sourcePath = file ? posix.normalize(posix.join(posix.dirname(source.sourcePath), decodeURIComponent(file))) : source.sourcePath
      const target = sources.find(item => item.sourcePath === sourcePath)
      if (target && (!hash || target.analysis.anchors.has(hash))) {
        return { ...link, replacement: `[${link.label}](${target.path}${hash ? `#${hash}` : ''})` }
      }
      // Preserve absent source coordinates as readable text, not dead links.
      return { ...link, replacement: `${link.label}（原资料：\`${sourcePath}${hash ? `#${hash}` : ''}\`，尚未收录）` }
    }).filter(item => item !== undefined)
    let markdown = source.raw
    for (const item of replacements.sort((a, b) => b.start - a.start)) markdown = markdown.slice(0, item.start) + item.replacement + markdown.slice(item.end)
    // ProseA uses Nuxt UI's link/button component. Empty source anchors are
    // locations, not controls: keep their IDs on non-interactive spans.
    markdown = markdown.replace(/<a id="([^"]+)"><\/a>/g, '<span id="$1"></span>')
    // Some responsibility files put stable anchors before their first H1.
    // The page supplies that title; leave those anchors in place.
    markdown = markdown.replace(/^# [^\n]+\n+/m, '')
    return { ...source, markdown, unavailableLinks: replacements.filter(item => item.replacement.includes('尚未收录')).map(item => item.url) }
  })
}
