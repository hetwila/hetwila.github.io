import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { wikiSchema, storySchema, type ContentMetadata, type EventRecord, type ContentRelation } from '../../shared/content-schema.ts'
import { analyzeMarkdown } from './markdown.ts'

export interface SourceDocument {
  metadata: ContentMetadata
  markdown: string
  raw: string
  filename: string
}

export function documentPath(metadata: ContentMetadata) {
  return `/${metadata.entityType === 'story' ? 'stories' : 'wiki'}/${metadata.routeKey}`
}

export function collectEvents(documents: SourceDocument[]): EventRecord[] {
  return documents.flatMap(({ metadata }) => {
    if (metadata.entityType === 'story') return []
    const events: EventRecord[] = metadata.events.map(({ anchor, ...event }) => ({
      ...event, articleUid: metadata.uid, path: `${documentPath(metadata)}#${anchor}`, embedded: true,
    }))
    if (metadata.entityType === 'event' && metadata.worldTime.year !== undefined) events.push({
      uid: metadata.uid, title: metadata.title, description: metadata.description, aliases: metadata.aliases,
      sourceIds: metadata.sourceIds, sourceRefs: metadata.sourceRefs,
      worldTime: { label: metadata.worldTime.label, precision: 'year', year: metadata.worldTime.year },
      articleUid: metadata.uid, path: documentPath(metadata), embedded: false,
    })
    return events
  }).sort((a, b) => a.worldTime.year - b.worldTime.year)
}

export async function readPublicContent(directories: string | { wiki: string, stories: string }): Promise<SourceDocument[]> {
  const result: SourceDocument[] = []
  const uids = new Set<string>()
  const routes = new Set<string>()
  for (const [kind, directory] of Object.entries(typeof directories === 'string' ? { wiki: directories } : directories)) {
    const filenames = (await readdir(directory)).filter(name => name.endsWith('.md')).sort()
    for (const filename of filenames) {
      const raw = await readFile(join(directory, filename), 'utf8')
      const { data, content } = matter(raw)
      const metadata = (kind === 'stories' ? storySchema : wikiSchema).parse(data)
      if (metadata.entityType === 'story' && metadata.scopeUid !== metadata.uid) throw new Error(`Story scope must match uid: ${metadata.uid}`)
      if (filename !== `${metadata.routeKey}.md`) throw new Error(`Filename must match routeKey: ${filename}`)
      const events = metadata.entityType === 'story' ? [] : metadata.events
      for (const uid of [metadata.uid, ...events.map(event => event.uid)]) {
        if (uids.has(uid)) throw new Error(`Duplicate uid: ${uid}`)
        uids.add(uid)
      }
      const normalized = documentPath(metadata).normalize('NFC').toLowerCase()
      if (routes.has(normalized)) throw new Error(`Duplicate route: ${metadata.routeKey}`)
      routes.add(normalized)
      if (metadata.publicationStatus !== 'published' || metadata.visibility !== 'public') continue
      const analysis = analyzeMarkdown(content)
      const anchors = new Set<string>()
      for (const event of events) {
        if (!analysis.explicitAnchors.has(event.anchor)) throw new Error(`Missing embedded event anchor: ${event.uid}#${event.anchor}`)
        if (anchors.has(event.anchor)) throw new Error(`Duplicate event anchor: ${event.anchor}`)
        anchors.add(event.anchor)
      }
      result.push({ metadata, markdown: content.trim(), raw, filename })
    }
  }
  const publishedUids = new Set([...result.map(doc => doc.metadata.uid), ...collectEvents(result).map(event => event.uid)])
  for (const doc of result) {
    for (const relation of doc.metadata.relations) {
      if (!publishedUids.has(relation.target)) throw new Error(`Unpublished or missing relation: ${doc.metadata.uid} → ${relation.target}`)
    }
  }
  return result
}

export function buildContentGraph(documents: SourceDocument[], extraPages: Map<string, Set<string>> = new Map()) {
  const paths = new Map(documents.map(doc => [documentPath(doc.metadata), doc]))
  const targets = new Map(documents.map(doc => [doc.metadata.uid, { uid: doc.metadata.uid, articleUid: doc.metadata.uid, entityType: doc.metadata.entityType, path: documentPath(doc.metadata) }]))
  for (const event of collectEvents(documents)) targets.set(event.uid, { ...event, entityType: 'event' })
  const eventsByPath = new Map([...targets.values()].filter(target => target.path.includes('#')).map(target => [target.path, target]))
  const analyses = new Map(documents.map(doc => [doc.metadata.uid, analyzeMarkdown(doc.markdown)]))
  const edges: ContentRelation[] = []
  const seen = new Set<string>()
  const add = (edge: ContentRelation) => {
    const key = JSON.stringify([edge.source, edge.target, edge.type, edge.sectionId])
    if (!seen.has(key)) { edges.push(edge); seen.add(key) }
  }
  for (const doc of documents) {
    const sourcePath = documentPath(doc.metadata)
    for (const relation of doc.metadata.relations) {
      const target = targets.get(relation.target)
      if (!target) throw new Error(`Unpublished or missing relation: ${relation.target}`)
      if (relation.type === 'depicts' && (doc.metadata.entityType !== 'story' || target.entityType !== 'event')) throw new Error('depicts must link a story to an event')
      add({ source: doc.metadata.uid, ...relation, sourcePath, targetPath: target.path, targetArticleUid: target.articleUid, origin: 'metadata' })
    }
    for (const link of analyses.get(doc.metadata.uid)!.links) {
      const url = new URL(link.url, `https://hetwila.github.io${sourcePath}`)
      if (url.origin !== 'https://hetwila.github.io') continue
      const path = decodeURIComponent(url.pathname).replace(/\/$/, '')
      const anchor = decodeURIComponent(url.hash.slice(1))
      const page = paths.get(path)
      const anchors = page ? analyses.get(page.metadata.uid)!.anchors : extraPages.get(path)
      if (!anchors) throw new Error(`Unpublished or missing link: ${sourcePath} → ${link.url}`)
      if (anchor && !anchors.has(anchor)) throw new Error(`Missing anchor: ${sourcePath} → ${link.url}`)
      const target = eventsByPath.get(`${path}#${anchor}`) ?? (page && targets.get(page.metadata.uid))
      if (target && target.uid !== doc.metadata.uid) {
        add({ source: doc.metadata.uid, target: target.uid, type: 'mentions', origin: 'markdown', sourcePath, targetPath: target.path, targetArticleUid: target.articleUid, sectionId: link.sectionId })
      }
    }
  }
  return edges
}
