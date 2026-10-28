import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
export function settings() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('ACCOUNT_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const origins = (Deno.env.get('ACCOUNT_ALLOWED_ORIGINS') || 'https://hetwila.github.io').split(',').map(s => s.trim())
  if (!url || !key) throw new HttpError(503, 'NOT_CONFIGURED', '账号服务尚未配置完成。')
  return { url, key, origins }
}
export function service() {
  const { url, key } = settings()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export async function authenticatedUser(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', '请先登录。')
  const { data, error } = await service().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED', '登录已失效，请重新登录。')
  return data.user
}
export async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) { await reader.cancel(); throw new HttpError(413, 'TOO_LARGE', '文件或请求过大。') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
export function handler(action: (request: Request) => Promise<unknown>) {
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' })
    try {
      const origin = request.headers.get('origin')
      if (origin && !settings().origins.includes(origin)) throw new HttpError(403, 'ORIGIN_DENIED', '不支持此站点来源。')
      if (origin) headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info')
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', '请使用 POST。')
      return new Response(JSON.stringify(await action(request)), { status: 200, headers })
    } catch (error) {
      const known = error instanceof HttpError
      // Never log bodies, passwords, tokens or invite codes.
      if (!known) console.error('Account request failed', error instanceof Error ? error.name : 'Unknown')
      return new Response(JSON.stringify({ code: known ? error.code : 'UNAVAILABLE', message: known ? error.message : '账号服务暂时不可用，请稍后重试。' }), { status: known ? error.status : 503, headers })
    }
  }
}
