import { z } from 'zod'
export const nicknameSchema = z.string().trim().min(1, '请填写昵称。').max(50, '昵称最多50个字符。')
export const passwordSchema = z.string().min(8, '密码至少8个字符。').max(72, '密码过长。').refine(value => new TextEncoder().encode(value).length <= 72, '密码不能超过72字节。')
export const loginSchema = z.object({ email: z.string().trim().email('请输入邮箱格式的地址。').max(254), password: z.string().min(1, '请填写密码。') })
export const registerSchema = loginSchema.extend({ password: passwordSchema, confirmPassword: z.string(), nickname: nicknameSchema, inviteCode: z.string().trim().regex(/^[A-Z0-9]{6}$/, '邀请码为6位大写字母或数字。') }).refine(s => s.password === s.confirmPassword, { path: ['confirmPassword'], message: '两次输入的密码不一致。' })
export const changePasswordSchema = z.object({ oldPassword: z.string().min(1, '请填写当前密码。'), password: passwordSchema, confirmPassword: z.string() }).refine(s => s.password === s.confirmPassword, { path: ['confirmPassword'], message: '两次输入的密码不一致。' }).refine(s => s.oldPassword !== s.password, { path: ['password'], message: '新密码应与当前密码不同。' })
export interface AccountProfile { id: string; email: string; nickname: string; user_group: 'guest' | 'admin'; avatar_path: string | null; created_at: string; updated_at: string }
export interface AccountInvitation { id: string; code: string; valid_from: string; valid_until: string; note: string; created_by: string | null; used_by: string | null; used_at: string | null; deleted_at: string | null; created_at: string; updated_at: string }
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/u.test(value)) return '/'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || /[\\\u0000-\u0020]/u.test(decoded)) return '/'
    const url = new URL(value, 'https://hetwila.github.io')
    if (url.origin !== 'https://hetwila.github.io' || /^\/account\/(login|register)(?:\/|$)/.test(url.pathname)) return '/'
    return url.pathname + url.search + url.hash
  } catch { return '/' }
}
export function inviteStatus(invite: AccountInvitation, now = Date.now()) {
  if (invite.deleted_at) return '已删除'
  if (invite.used_at) return '已使用'
  if (now < Date.parse(invite.valid_from)) return '未生效'
  if (now >= Date.parse(invite.valid_until)) return '已过期'
  return '可使用'
}
