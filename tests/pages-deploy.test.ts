import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publishPages, type PagesConfig } from '../scripts/lib/pages-deploy.ts'

const config: PagesConfig = { repository: 'owner/site', sha: 'a'.repeat(40), runId: '123', token: 'github-test-token', oidcUrl: 'https://issuer.example.test/token', oidcRequestToken: 'request-test-token', apiUrl: 'https://api.github.com' }
function fixture() {
  let time = 0
  const calls: { path: string; method: string; body: any; aborted: boolean }[] = [], logs: string[] = []
  const state = { sha: config.sha, artifacts: [{ id: 7, name: 'github-pages', expired: false }], status: (_time: number): Response => Response.json({ status: 'succeed' }) }
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), method = init?.method || 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path: url.pathname, method, body, aborted: Boolean(init?.signal?.aborted) })
    const token = new Headers(init?.headers).get('authorization')
    assert.equal(token, `Bearer ${url.origin === 'https://issuer.example.test' ? config.oidcRequestToken : config.token}`)
    if (url.origin === 'https://issuer.example.test') return Response.json({ value: 'issued-test-oidc' })
    if (url.pathname.endsWith('/actions/runs/123')) return Response.json({ head_sha: state.sha })
    if (url.pathname.endsWith('/artifacts')) return Response.json({ total_count: state.artifacts.length, artifacts: state.artifacts })
    if (url.pathname.endsWith('/cancel')) return new Response(null, { status: 204 })
    if (method === 'POST') return Response.json({ id: config.sha, page_url: 'https://owner.github.io/' })
    return state.status(time)
  }
  const options = { fetch: fetcher, now: () => time, wait: async (ms: number) => { time += ms }, log: (message: string) => logs.push(message) }
  return { state, options, calls, logs, time: () => time }
}
test('Pages uses the current build and fresh OIDC, and can finish after a queue longer than ten minutes', async () => {
  const f = fixture()
  f.state.status = time => Response.json({ status: time < 12 * 60000 ? 'syncing_files' : 'succeed' })
  assert.equal(await publishPages(config, f.options), 'https://owner.github.io/')
  assert.equal(f.time(), 12 * 60000)
  assert.deepEqual(f.calls.find(call => call.method === 'POST')?.body, { artifact_id: 7, pages_build_version: config.sha, oidc_token: 'issued-test-oidc' })
  assert.equal(f.calls.filter(call => call.path.endsWith('/cancel')).length, 0)
  assert.doesNotMatch(f.logs.join('\n'), /github-test-token|request-test-token|issued-test-oidc/u)
})
test('mismatched revisions and missing, expired or ambiguous artifacts never create a deployment', async () => {
  for (const mode of ['revision', 'missing', 'expired', 'duplicate']) {
    const f = fixture()
    if (mode === 'revision') f.state.sha = 'b'.repeat(40)
    if (mode === 'missing') f.state.artifacts = []
    if (mode === 'expired') f.state.artifacts[0]!.expired = true
    if (mode === 'duplicate') f.state.artifacts.push({ ...f.state.artifacts[0]!, id: 8 })
    await assert.rejects(publishPages(config, f.options))
    assert.equal(f.calls.filter(call => call.method === 'POST' || call.path === '/token').length, 0)
  }
})
test('a queue exceeding the bounded budget is cancelled and never reported as published', async () => {
  const f = fixture()
  f.state.status = () => Response.json({ status: 'deployment_queued' })
  await assert.rejects(publishPages(config, f.options), /waiting budget/u)
  assert.equal(f.time(), 20 * 60000)
  assert.equal(f.calls.filter(call => call.path.endsWith('/cancel')).length, 1)
  assert.ok(!f.logs.includes('Pages deployment succeeded.'))
})
test('status polling honors rate limits, retries transient failures and does not retry terminal failure', async () => {
  const f = fixture()
  let attempt = 0
  f.state.status = () => {
    attempt++
    if (attempt === 1) return new Response('do not log response text', { status: 429, headers: { 'Retry-After': '90' } })
    if (attempt === 2) return new Response('', { status: 503 })
    return Response.json({ status: 'succeed' })
  }
  await publishPages(config, f.options)
  assert.equal(f.time(), 120000)
  assert.doesNotMatch(f.logs.join('\n'), /do not log/u)
  const failed = fixture()
  failed.state.status = () => Response.json({ status: 'deployment_content_failed' })
  await assert.rejects(publishPages(config, failed.options), /deployment_content_failed/u)
  assert.equal(failed.time(), 0)
  assert.equal(failed.calls.filter(call => call.path.endsWith('/cancel')).length, 0)
})
test('workflow cancellation cancels the pending deployment with a fresh request signal', async () => {
  const f = fixture(), controller = new AbortController()
  f.state.status = () => Response.json({ status: 'updating_pages' })
  await assert.rejects(publishPages(config, { ...f.options, signal: controller.signal, wait: async () => { controller.abort() } }))
  const cancellation = f.calls.find(call => call.path.endsWith('/cancel'))
  assert.ok(cancellation)
  assert.equal(cancellation.aborted, false)
})
