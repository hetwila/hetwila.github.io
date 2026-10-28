import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AccountProfile } from '#shared/account'
let clientPromise: Promise<SupabaseClient> | undefined
export function useAccount() {
  const config = useRuntimeConfig().public
  const user = useState<User | null>('account-user', () => null)
  const profile = useState<AccountProfile | null>('account-profile', () => null)
  const ready = useState('account-ready', () => false)
  const loadError = useState('account-error', () => '')
  const configured = Boolean(config.supabaseUrl && config.supabaseKey)
  async function refreshProfile(currentUser = user.value) {
    if (!currentUser) { profile.value = null; return }
    const { data, error } = await (await client()).from('account_profiles').select('*').eq('id', currentUser.id).single()
    if (user.value?.id !== currentUser.id) return
    profile.value = data
    loadError.value = error ? '个人资料暂时无法读取，请重试。' : ''
  }
  async function client() {
    if (import.meta.server || !configured) throw new Error('账号服务尚未配置完成。')
    clientPromise ??= (async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const api = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
      api.auth.onAuthStateChange((_event, session) => {
        if (user.value?.id !== session?.user.id) profile.value = null
        user.value = session?.user ?? null
        if (!session) profile.value = null
        setTimeout(() => { void refreshProfile().catch(() => { loadError.value = '个人资料暂时无法读取。' }) }, 0)
      })
      return api
    })()
    return clientPromise
  }
  async function initialize() {
    if (ready.value) return
    if (!configured) { ready.value = true; return }
    try {
      const { data, error } = await (await client()).auth.getSession()
      if (error) throw error
      user.value = data.session?.user ?? null
      await refreshProfile()
    } catch { loadError.value = '账号服务暂时不可用，请刷新重试。' }
    finally { ready.value = true }
  }
  async function invoke<T>(name: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const { data, error } = await (await client()).functions.invoke(name, { body: body as Blob | Record<string, unknown>, headers })
    if (error) {
      let message = '请求未完成，请稍后重试。'
      try { message = (await error.context.json()).message || message } catch { /* Network failure. */ }
      throw new Error(message)
    }
    return data as T
  }
  async function uploadAvatar(file: Blob | null) {
    await invoke('account-avatar', file || new Blob([]), { 'Content-Type': 'image/png' })
    await refreshProfile()
  }
  function avatarUrl(path?: string | null) { return path ? `${config.supabaseUrl}/storage/v1/object/public/account-avatars/${path}` : undefined }
  async function logout() {
    const { error } = await (await client()).auth.signOut({ scope: 'local' })
    if (error) throw error
    user.value = null; profile.value = null
  }
  return { user, profile, ready, loadError, configured, isAdmin: computed(() => profile.value?.user_group === 'admin'), client, initialize, refreshProfile, invoke, uploadAvatar, avatarUrl, logout }
}
