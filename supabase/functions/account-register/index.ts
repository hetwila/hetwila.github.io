import { z } from 'npm:zod@3.25.76'
import { boundedBody, handler, HttpError, service, settings } from '../_shared/http.ts'
const schema = z.object({
  email: z.string().trim().email().max(254).transform(s => s.toLowerCase()),
  password: z.string().min(8).max(72),
  nickname: z.string().trim().min(1).max(50),
  inviteCode: z.string().regex(/^[A-Z0-9]{6}$/),
  turnstileToken: z.string().min(1).max(2048),
}).strict()

export const register = handler(async request => {
  let body: unknown
  try { body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8192))) }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'INVALID_INPUT', '请检查注册信息。') }
  const parsed = schema.safeParse(body)
  if (!parsed.success || new TextEncoder().encode(parsed.data.password).length > 72) throw new HttpError(400, 'INVALID_INPUT', '请检查邮箱、密码、昵称和邀请码。密码须为8至72个字符，且不超过72字节。')
  const input = parsed.data
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) throw new HttpError(503, 'NOT_CONFIGURED', '人机验证尚未配置完成。')
  const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: input.turnstileToken }), signal: AbortSignal.timeout(10000),
  })
  const proof = await verification.json()
  if (!verification.ok || proof.success !== true || proof.action !== 'register' || !settings().origins.some(origin => new URL(origin).hostname === proof.hostname)) {
    throw new HttpError(400, 'CAPTCHA_FAILED', '人机验证失败或已过期，请重新验证。')
  }
  const client = service()
  const { data: ticket, error: ticketError } = await client.rpc('account_prepare_registration', { p_email: input.email, p_nickname: input.nickname, p_code: input.inviteCode })
  if (ticketError) {
    if (ticketError.code === '22023') throw new HttpError(400, 'INVITE_INVALID', '邀请码无效、尚未生效、已过期或已使用。')
    throw ticketError
  }
  const { data, error } = await client.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
    app_metadata: { registration_ticket: ticket },
  })
  if (error) {
    // An unsuccessful Auth insert rolls back the invitation consumption and profile.
    throw new HttpError(400, 'REGISTRATION_FAILED', '注册未完成：邮箱可能已注册，或邀请码已被使用。请检查后重试。')
  }
  return { userId: data.user.id }
})
if (import.meta.main) Deno.serve(register)
