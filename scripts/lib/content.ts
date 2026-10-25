import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { wikiSchema, type WikiMetadata } from '../../shared/content-schema.ts'
import type { ContentRelation } from '../../shared/content-schema.ts'
import { analyzeMarkdown } from './markdown.ts'

export interface SourceDocument {
  metadata: WikiMetadata
  markdown: string
  raw: string
  filename: string
}

export async function readPublicContent(directory: string): Promise<SourceDocument[]> {
  const filenames = (await readdir(directory)).filter(name => name.endsWith('.md')).sort()
  const result: SourceDocument[] = []
  const uids = new Set<string>()
  const routes = new Set<string>()
  for (const filename of filenames) {
    const raw = await readFile(join(directory, filename), 'utf8')
    const { data, content } = matter(raw)
    const metadata = wikiSchema.parse(data)
    if (filename !== `${metadata.routeKey}.md`) throw new Error(`Filename must match routeKey: ${filename}`)
    if (uids.has(metadata.uid)) throw new Error(`Duplicate uid: ${metadata.uid}`)
    uids.add(metadata.uid)
    for (const key of [metadata.routeKey, ...metadata.redirects]) {
      const normalized = key.normalize('NFC').toLowerCase()
      if (routes.has(normalized)) throw new Error(`Duplicate route or redirect: ${key}`)
      routes.add(normalized)
    }
    if (metadata.publicationStatus !== 'published' || metadata.visibility !== 'public') continue
    result.push({ metadata, markdown: content.trim(), raw, filename })
  }
  const publishedUids = new Set(result.map(doc => doc.metadata.uid))
  for (const doc of result) {
    for (const relation of doc.metadata.relations) {
      if (!publishedUids.has(relation.target)) {
        throw new Error(`Unpublished or missing relation: ${doc.metadata.uid} → ${relation.target}`)
      }
    }
  }
  return result
}

export function buildContentGraph(documents: SourceDocument[], extraPages: Map<string, Set<string>> = new Map()) {
  const paths = new Map(documents.map(doc => [`/wiki/${doc.metadata.routeKey}`, doc]))
  const ids = new Map(documents.map(doc => [doc.metadata.uid, doc]))
  const aliases = new Map(documents.flatMap(doc => doc.metadata.redirects.map(key => [`/wiki/${key}`, doc] as const)))
  const analyses = new Map(documents.map(doc => [doc.metadata.uid, analyzeMarkdown(doc.markdown)]))
  const edges: ContentRelation[] = []
  const seen = new Set<string>()
  const add = (edge: ContentRelation) => {
    const key = JSON.stringify([edge.source, edge.target, edge.type, edge.sectionId])
    if (!seen.has(key)) { edges.push(edge); seen.add(key) }
  }
  for (const doc of documents) {
    const sourcePath = `/wiki/${doc.metadata.routeKey}`
    for (const relation of doc.metadata.relations) {
      const target = ids.get(relation.target)
      if (!target) throw new Error(`Unpublished or missing relation: ${relation.target}`)
      add({ source: doc.metadata.uid, ...relation, sourcePath, targetPath: `/wiki/${target.metadata.routeKey}`, origin: 'metadata' })
    }
    for (const link of analyses.get(doc.metadata.uid)!.links) {
      const url = new URL(link.url, `https://hetwila.github.io${sourcePath}`)
      if (url.origin !== 'https://hetwila.github.io') continue
      const path = decodeURIComponent(url.pathname).replace(/\/$/, '')
      const anchor = decodeURIComponent(url.hash.slice(1))
      const target = paths.get(path) ?? aliases.get(path)
      const anchors = target ? analyses.get(target.metadata.uid)!.anchors : extraPages.get(path)
      if (!anchors) throw new Error(`Unpublished or missing link: ${sourcePath} → ${link.url}`)
      if (anchor && !anchors.has(anchor)) throw new Error(`Missing anchor: ${sourcePath} → ${link.url}`)
      if (target && target.metadata.uid !== doc.metadata.uid) {
        add({ source: doc.metadata.uid, target: target.metadata.uid, type: 'mentions', origin: 'markdown', sourcePath, targetPath: `/wiki/${target.metadata.routeKey}`, sectionId: link.sectionId })
      }
    }
  }
  return edges
}
