/** No body is kept in Nuxt payloads, shared state, localStorage or query caches. */
export function usePrivateContent() {
  const account = useAccount()
  const canSubmit = ref(false)
  let version = 0
  watch([account.user, account.profile], async () => {
    const current = ++version
    canSubmit.value = false
    if (!import.meta.client || !account.user.value || !account.profile.value) return
    try {
      const { data, error } = await (await account.client()).rpc('content_can_submit')
      if (current === version && !error) canSubmit.value = data === true
    } catch { /* A failed permission lookup never grants submission access. */ }
  }, { immediate: true })
  onScopeDispose(() => { version++ })
  return { account, canSubmit }
}
