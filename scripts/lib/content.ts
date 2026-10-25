import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { wikiSchema, type WikiMetadata } from '../../shared/content-schema.ts'

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
  for (const filename of filenames) {
    const raw = await readFile(join(directory, filename), 'utf8')
    const { data, content } = matter(raw)
    const metadata = wikiSchema.parse(data)
    if (filename !== `${metadata.routeKey}.md`) throw new Error(`Filename must match routeKey: ${filename}`)
    if (uids.has(metadata.uid)) throw new Error(`Duplicate uid: ${metadata.uid}`)
    uids.add(metadata.uid)
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
