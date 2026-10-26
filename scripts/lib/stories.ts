import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { SourceDocument } from './content.ts'
import { markdownText } from './markdown.ts'

// Original uploads stay byte-for-byte intact. The reading edition may add
// headings and links, but must not silently rewrite the author's prose.
export async function readStoryOriginals(root: string, documents: SourceDocument[]) {
  const directory = join(root, 'sources/stories')
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { files: Record<string, string> }
  return Promise.all(documents.filter(doc => doc.metadata.entityType === 'story').map(async doc => {
    if (!Object.hasOwn(manifest.files, doc.filename)) throw new Error(`Missing original story: ${doc.filename}`)
    const raw = await readFile(join(directory, doc.filename), 'utf8')
    const sha256 = createHash('sha256').update(raw).digest('hex')
    if (sha256 !== manifest.files[doc.filename]) throw new Error(`Story checksum mismatch: ${doc.filename}`)
    const [title, ...body] = raw.split('\n')
    if (title?.replace(/^#\s+/, '').trim() !== doc.metadata.title || markdownText(body.join('\n')) !== markdownText(doc.markdown)) {
      throw new Error(`Story text differs from original: ${doc.filename}`)
    }
    return { uid: doc.metadata.uid, filename: doc.filename, raw, sha256 }
  }))
}
