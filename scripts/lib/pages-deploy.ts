import { setTimeout as delay } from 'node:timers/promises'

export interface PagesConfig { repository: string; sha: string; runId: string; token: string; oidcUrl: string; oidcRequestToken: string; apiUrl: string }
interface Options { fetch?: typeof fetch; now?: () => number; wait?: (ms: number) => Promise<void>; log?: (message: string) => void; signal?: AbortSignal; timeout?: number }
class RequestFailure extends Error {
  status: number
  retryAfter: number
  constructor(status: number, retryAfter = 0) { super(`GitHub Pages request failed (HTTP ${status || 'network error'}).`); this.status = status; this.retryAfter = retryAfter }
}

/** Same artifact/OIDC REST protocol as deploy-pages, with a bounded 20-minute poll budget. */
export async function publishPages(config: PagesConfig, options: Options = {}): Promise<string> {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(config.repository) || !/^[a-f0-9]{40}$/u.test(config.sha) || !/^[1-9]\d*$/u.test(config.runId)) throw new Error('Invalid repository, revision or workflow run.')
  if (!config.token || !config.oidcRequestToken || !config.oidcUrl.startsWith('https://') || new URL(config.apiUrl).protocol !== 'https:') throw new Error('Missing GitHub Actions authorization.')
  const send = options.fetch || fetch, now = options.now || Date.now, log = options.log || console.log
  const wait = options.wait || ((ms: number) => delay(ms, undefined, { signal: options.signal }))
  const timeout = options.timeout ?? 20 * 60 * 1000
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 20 * 60 * 1000) throw new Error('Invalid Pages deployment timeout.')
  const root = `${config.apiUrl.replace(/\/$/u, '')}/repos/${config.repository}`
  async function request(url: string, token: string, method = 'GET', body?: unknown, cancelling = false): Promise<any> {
    let response: Response
    try {
      response = await send(url, {
        method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(30000), ...(!cancelling && options.signal ? [options.signal] : [])]),
      })
    } catch { throw new RequestFailure(0) }
    if (!response.ok) {
      const retry = response.headers.get('retry-after')
      const retryAfter = retry ? (/^\d+$/u.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now()) : 0
      // Never log a response body, request payload or token.
      throw new RequestFailure(response.status, Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0)
    }
    if (response.status === 204) return null
    try { return await response.json() } catch { throw new RequestFailure(0) }
  }
  const api = (path: string, method = 'GET', body?: unknown, cancelling = false) => request(root + path, config.token, method, body, cancelling)
  const run = await api(`/actions/runs/${config.runId}`)
  if (run.head_sha !== config.sha) throw new Error('The build artifact does not belong to this revision.')
  const artifacts: { id: number; name: string; expired: boolean }[] = []
  for (let page = 1; ; page++) {
    const data = await api(`/actions/runs/${config.runId}/artifacts?name=github-pages&per_page=100&page=${page}`)
    if (!Array.isArray(data.artifacts) || !Number.isSafeInteger(data.total_count)) throw new Error('Invalid workflow artifact metadata.')
    artifacts.push(...data.artifacts)
    if (page * 100 >= data.total_count) break
    if (page >= 10) throw new Error('Too many artifacts in this workflow run.')
  }
  const candidates = artifacts.filter(artifact => artifact.name === 'github-pages' && !artifact.expired)
  if (candidates.length !== 1 || !Number.isSafeInteger(candidates[0]!.id) || candidates[0]!.id <= 0) throw new Error('Expected exactly one unexpired github-pages artifact from the successful build.')
  const oidc = await request(config.oidcUrl, config.oidcRequestToken)
  if (typeof oidc.value !== 'string' || !oidc.value) throw new Error('GitHub did not issue a Pages OIDC token.')
  const deployment = await api('/pages/deployments', 'POST', { artifact_id: candidates[0]!.id, pages_build_version: config.sha, oidc_token: oidc.value })
  const id = String(deployment.id || config.sha)
  if (!/^[\w-]+$/u.test(id)) throw new Error('GitHub returned an invalid deployment ID.')
  let pending = true
  const started = now(), finalErrors = new Set(['deployment_failed', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost'])
  try {
    const pageUrl = new URL(deployment.page_url)
    if (pageUrl.protocol !== 'https:' || pageUrl.username || pageUrl.password) throw new Error('GitHub returned an invalid Pages URL.')
    log(`Created Pages deployment ${id}; waiting up to ${timeout / 60000} minutes.`)
    let failures = 0
    while (now() - started < timeout) {
      options.signal?.throwIfAborted()
      let state: { status: string }
      try { state = await api(`/pages/deployments/${id}`); failures = 0 }
      catch (error) {
        if (options.signal?.aborted || !(error instanceof RequestFailure) || (error.status !== 0 && error.status !== 404 && error.status !== 429 && error.status < 500) || ++failures >= 5) throw error
        log(`Temporary status request failure (${failures}/5); waiting before retry.`)
        await wait(Math.min(Math.max(30000, error.retryAfter), Math.max(0, timeout - (now() - started))))
        continue
      }
      if (state.status === 'succeed') { pending = false; log('Pages deployment succeeded.'); return pageUrl.href }
      if (finalErrors.has(state.status)) { pending = false; throw new Error(`Pages reported ${state.status}.`) }
      log(`Pages status: ${String(state.status).replace(/[^a-z_]/giu, '').slice(0, 60)}`)
      await wait(Math.min(30000, Math.max(0, timeout - (now() - started))))
    }
    throw new Error('Pages deployment exceeded the 20-minute waiting budget.')
  } finally {
    if (pending) {
      try { await api(`/pages/deployments/${id}/cancel`, 'POST', undefined, true); log('Cancelled the unfinished Pages deployment.') }
      catch { log('Could not confirm cancellation; inspect the Pages deployment before retrying.') }
    }
  }
}
