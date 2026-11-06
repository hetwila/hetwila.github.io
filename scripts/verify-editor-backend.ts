import { publicAccountConfig } from '../shared/account-config.ts'
import { editorStorageVerification } from './lib/editor-storage-verification.ts'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
const { supabaseUrl, supabaseKey } = publicAccountConfig(process.env)
const ref = process.env.SUPABASE_PROJECT_ID, token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !/^[a-z]{20}$/u.test(ref) || supabaseUrl !== `https://${ref}.supabase.co` || !supabaseKey || !token) throw new Error('Missing or mismatched project configuration.')
async function sql(query: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Editor backend verification failed (${response.status}); response omitted to protect project data.`)
  return response.json()
}
const fixture = editorStorageVerification()
await sql(fixture.query)
const ids = fixture.ids.map(id => `'${id}'`).join(',')
const cleanup = await sql(`select (select count(*)::int from auth.users where id in (${ids})) as users, (select count(*)::int from storage.objects where bucket_id='editor-drafts' and split_part(name,'/',1) in (${ids})) as objects;`)
if (cleanup[0]?.users !== 0 || cleanup[0]?.objects !== 0) throw new Error('Editor verification fixtures were not fully rolled back.')
const response = await fetch(`${supabaseUrl}/storage/v1/object/list/editor-drafts`, { method: 'POST', headers: { apikey: supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 10, offset: 0 }), signal: AbortSignal.timeout(20000) })
const body = await response.json()
if (response.ok && (!Array.isArray(body) || body.length !== 0)) throw new Error('Anonymous Storage listing was not denied.')
console.log('Editor Storage verified: private JSON bucket, owner-only admin access, immutable snapshots, role revocation and anonymous denial; transaction fixtures fully rolled back.')

// Exercise the real object service separately from the SQL role checks. The
// operator credential is never sent to a browser; only disposable test bytes
// under an unpredictable directory are uploaded and removed.
const secret = process.env.SUPABASE_SECRET_KEY
if (!secret) throw new Error('Storage round-trip verification requires the operator service key.')
const client = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const store = client.storage.from('editor-drafts'), owner = randomUUID()
const name = `${owner}/${Date.now()}-dmVyaWZ5-${randomUUID()}.json`, invalid = `${owner}/${Date.now()}-invalid-${randomUUID()}.json`
const text = JSON.stringify({ verification: randomUUID() })
try {
  const uploaded = await store.upload(name, text, { contentType: 'application/json', cacheControl: '0', upsert: false })
  if (uploaded.error) throw new Error('Storage verification JSON upload failed.')
  const file = await store.download(name)
  if (file.error || await file.data.text() !== text) throw new Error('Storage verification round trip failed.')
  const publicRead = await fetch(`${supabaseUrl}/storage/v1/object/public/editor-drafts/${name}`, { headers: { apikey: supabaseKey }, signal: AbortSignal.timeout(20000) })
  if (publicRead.ok) throw new Error('Private snapshot unexpectedly readable through a public URL.')
  const rejected = await store.upload(invalid, text, { contentType: 'text/plain', upsert: false })
  if (!rejected.error) throw new Error('Storage unexpectedly accepted a non-JSON MIME type.')
} finally {
  const removed = await store.remove([name, invalid])
  if (removed.error) throw new Error('Storage verification object cleanup failed.')
  const remaining = await store.list(owner)
  if (remaining.error || remaining.data.length) throw new Error('Storage verification objects remain after cleanup.')
}
console.log('Real Storage JSON upload/download/delete, MIME rejection and public URL denial verified with disposable operator-owned test objects; cleanup confirmed.')
