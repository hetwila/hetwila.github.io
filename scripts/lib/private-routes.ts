import { publicAccountConfig } from '../../shared/account-config.ts'
import { privateIdPattern } from '../../shared/private-content.ts'

/** Build-time public projection. This code never queries private_documents. */
export async function fetchPrivateRoutes(env: NodeJS.ProcessEnv, request: typeof fetch = fetch): Promise<string[]> {
  if (env.PRIVATE_CONTENT_ROUTES !== 'required') return []
  const { supabaseUrl, supabaseKey } = publicAccountConfig(env)
  if (!supabaseUrl || !supabaseKey) throw new Error('Private route generation requires the public Supabase URL and key.')
  const paths: string[] = []
  let cursor = ''
  // Keyset pagination avoids the PostgREST row limit and unstable offsets.
  for (;;) {
    const url = new URL(`${supabaseUrl}/rest/v1/private_content_routes`)
    url.searchParams.set('select', 'path')
    url.searchParams.set('order', 'path.asc')
    url.searchParams.set('limit', '500')
    if (cursor) url.searchParams.set('path', `gt.${cursor}`)
    const result = await request(url, { headers: { apikey: supabaseKey, 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) })
    if (!result.ok) throw new Error(`Private route catalogue unavailable (${result.status}); refusing to publish incomplete Pages output.`)
    const rows: unknown = await result.json()
    if (!Array.isArray(rows)) throw new Error('Invalid private route catalogue.')
    if (!rows.length) break
    for (const row of rows) {
      if (!row || Object.keys(row).join() !== 'path' || typeof row.path !== 'string'
        || !row.path.startsWith('/private/') || !privateIdPattern.test(row.path.slice('/private/'.length)) || row.path <= cursor) throw new Error('Invalid or unordered private route; build stopped.')
      cursor = row.path
      paths.push(cursor)
    }
    if (paths.length > 100000) throw new Error('Private route catalogue exceeds the build limit.')
  }
  return paths
}
