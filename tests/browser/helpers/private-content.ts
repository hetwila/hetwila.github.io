import type { Page } from '@playwright/test'
import type { PrivateDocument } from '../../../shared/private-content'
import { accountFixture, userId } from './accounts'

export const privateId = '11111111-1111-4111-8111-111111111111'
export const privateReader = `/private/read?id=${privateId}`
export const privateText = '## 开始阅读\n\n**这是一段私有正文。**\n\n> 引用原文。\n\n- 列表第一项\n- 列表第二项\n\n## 另一节\n\n[回到开始](#开始阅读)\n\n| 角色 | 记录 |\n| --- | --- |\n| 诺菲莉亚 | 手稿 |\n\n```text\n' + 'long-text-'.repeat(40) + '\n```\n\n<script>window.privateXss=true</script>\n\n[危险](javascript:alert%281%29)\n\n最后一段私有文章。'
export async function privateFixture(page: Page, group?: 'guest' | 'admin') {
  const account = await accountFixture(page, group)
  const time = '2026-10-31T00:00:00.000Z'
  const documents: PrivateDocument[] = [{ id: privateId, kind: 'story', age_rating: 'general', title: '仅限授权的手稿', description: '一份私有阅读稿。', category: '短篇', author_name: '投稿作者', body_markdown: privateText, forum_posts: [], status: 'published', created_by: userId, created_at: time, updated_at: time, access_version: 1 }]
  const state = { allowed: true, failReads: false, failWrites: false, stale: false, accessStale: false, delayRead: 0, userGrants: [] as string[], groupGrants: [] as string[] }
  const requests: { method: string; path: string; body: any; url: string }[] = []
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range' }
  await page.route('https://account.example.test/rest/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').at(-1)!, method = req.method()
    if (table === 'account_profiles' && url.searchParams.get('select') !== 'id,nickname,email,user_group') return route.fallback()
    if (!['private_documents', 'content_user_grants', 'content_group_grants', 'content_account_groups', 'content_set_access', 'account_profiles'].includes(table)) return route.fallback()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = req.postData() ? req.postDataJSON() : undefined
    requests.push({ method, path: table, body, url: url.href })
    const send = (json: unknown, status = 200, extra = {}) => route.fulfill({ status, json, headers: { ...headers, ...extra } })
    const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '')
    const range = (rows: unknown[]) => {
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 20)
      return send(rows.slice(offset, offset + limit), 200, { 'content-range': `${offset}-${Math.max(offset, Math.min(offset + limit, rows.length) - 1)}/${rows.length}` })
    }
    if (table === 'account_profiles') return range([account.profile])
    if (table === 'content_account_groups') return send(['guest', 'admin'])
    if (table === 'content_user_grants') return range(state.userGrants.map(user_id => ({ user_id })))
    if (table === 'content_group_grants') return range(state.groupGrants.map(user_group => ({ user_group })))
    if (table === 'content_set_access') {
      if (group !== 'admin') return send({ code: '42501' }, 403)
      const row = documents.find(d => d.id === body.p_document_id)!
      if (state.accessStale || row.access_version !== body.p_expected_version) return send({ code: '40001' }, 409)
      state.userGrants = body.p_users; state.groupGrants = body.p_groups
      row.access_version++; return send(row.access_version)
    }
    if (method === 'GET') {
      if (state.delayRead) await new Promise(resolve => setTimeout(resolve, state.delayRead))
      if (state.failReads) return send({ message: 'temporary failure' }, 503)
      const visible = documents.filter(d => group === 'admin' || (state.allowed && group && d.status === 'published'))
      const columns = url.searchParams.get('select')
      const project = (row: PrivateDocument) => !columns || columns === '*' ? row : Object.fromEntries(columns.split(',').map(key => [key, row[key as keyof PrivateDocument]]))
      if (eq('id')) { const row = visible.find(d => d.id === eq('id')); return send(row ? project(row) : null) }
      return range(visible.filter(d => !eq('kind') || d.kind === eq('kind')).map(project))
    }
    if (state.failWrites) return send({ code: '503', message: 'temporary failure' }, 503)
    if (method === 'POST') {
      const row: PrivateDocument = { id: crypto.randomUUID(), created_by: userId, created_at: time, updated_at: time, access_version: 1, ...body }
      documents.push(row); return send(row, 201)
    }
    const row = documents.find(d => d.id === eq('id'))
    if (!row || state.stale || (eq('updated_at') && row.updated_at !== eq('updated_at'))) return send(null)
    if (method === 'PATCH') { Object.assign(row, body, { updated_at: new Date().toISOString() }); return send(row) }
    documents.splice(documents.indexOf(row), 1); return send({ id: row.id })
  })
  return { ...account, documents, state, contentRequests: requests }
}
