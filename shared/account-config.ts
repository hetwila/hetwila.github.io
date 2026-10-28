/** Validate public build configuration without including any privileged key in errors. */
export function publicAccountConfig(env: Record<string, string | undefined>) {
  const url = env.SUPABASE_URL || '', key = env.SUPABASE_KEY || ''
  if (url && !/^https:\/\/[a-z0-9.-]+\/?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(url)) throw new Error('SUPABASE_URL must be an HTTPS project URL (or a loopback development URL).')
  if (key && !key.startsWith('sb_publishable_')) {
    try {
      const claims = JSON.parse(atob(key.split('.')[1]!.replace(/-/g,'+').replace(/_/g,'/')))
      if (claims.role !== 'anon') throw new Error()
    } catch { throw new Error('SUPABASE_KEY must be a publishable or legacy anon key. Privileged keys cannot be used in a static build.') }
  }
  return { supabaseUrl:url.replace(/\/$/,''),supabaseKey:key }
}
