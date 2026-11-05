import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { privateIdPattern } from '../shared/private-content.ts'

const paths: unknown = JSON.parse(await readFile('.generated/private-routes.json', 'utf8'))
if (!Array.isArray(paths)) throw new Error('Missing private route snapshot.')
for (const path of paths) {
  if (typeof path !== 'string' || !path.startsWith('/private/') || !privateIdPattern.test(path.slice(9))) throw new Error('Unsafe private output path.')
  const html = await readFile(join('.output/public', path, 'index.html'), 'utf8')
  if (!html.includes('data-private-shell') || !html.includes('noindex, nofollow, noarchive')) throw new Error(`Missing private URL shell: ${path}`)
  if (/body_markdown|forum_posts|content_user_grants|private_documents/u.test(html)) throw new Error(`Unexpected private data in static shell: ${path}`)
}
// Like the generated paths themselves, this projection contains only opaque URLs.
await writeFile('.output/public/private-routes.json', JSON.stringify(paths) + '\n')
console.log(`Verified ${paths.length} private URL shells; no manuscripts were fetched.`)
