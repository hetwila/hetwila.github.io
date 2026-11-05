// A real SSG build against a route-only HTTP fixture. Never writes to Supabase.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const id = '11111111-1111-4111-8111-111111111111', path = `/private/${id}`
const requests: string[] = []
const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost')
  requests.push(url.pathname)
  if (url.pathname !== '/rest/v1/private_content_routes' || url.searchParams.get('select') !== 'path') {
    res.writeHead(403); res.end('Private bodies must never be requested by a build.'); return
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(url.searchParams.has('path') ? [] : [{ path }]))
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
try {
  const address = server.address() as { port: number }
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['generate'], { stdio: 'inherit', env: { ...process.env, PRIVATE_CONTENT_ROUTES: 'required', SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_KEY: 'sb_publishable_private_build_fixture' } })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Private shell build failed (${code}).`)))
  })
  assert.ok(requests.length >= 2)
  assert.ok(requests.every(p => p === '/rest/v1/private_content_routes'))
  const html = await readFile(join('.output/public', path, 'index.html'), 'utf8')
  assert.match(html, /noindex, nofollow, noarchive/)
  assert.match(html, /data-pagefind-ignore="all"/)
  assert.match(html, /请启用 JavaScript 并登录后阅读/)
  assert.doesNotMatch(html, /private_documents|body_markdown|forum_posts|content_user_grants/)
  const routes = JSON.parse(await readFile('.generated/private-routes.json', 'utf8'))
  assert.deepEqual(routes, [path])
  for (const name of ['catalog', 'forum', 'events', 'relations']) assert.ok(!(await readFile(`.generated/${name}.json`, 'utf8')).includes(id))
  async function scan(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) await scan(file)
      else if (/\.(?:html|json|js|txt)$/u.test(file)) {
        const text = await readFile(file, 'utf8')
        for (const key of ['SUPABASE_SECRET_KEY', 'SUPABASE_ACCESS_TOKEN', 'NUXT_TURNSTILE_SECRET_KEY']) {
          const secret = process.env[key]
          if (secret && secret.length > 12) assert.ok(!text.includes(secret), `Secret ${key} found in static output`)
        }
      }
    }
  }
  await scan('.output/public')
  console.log('Private URL shell, anonymous route-only fetch and static-output isolation verified.')
} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
