import { appendFileSync } from 'node:fs'
import { publishPages } from './lib/pages-deploy.ts'

const controller = new AbortController()
process.on('SIGINT', () => controller.abort())
process.on('SIGTERM', () => controller.abort())
try {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main' || !process.env.GITHUB_OUTPUT) throw new Error('Pages publication must run in the main-branch GitHub Actions deployment job.')
  const value = (name: string) => { const result = process.env[name]; if (!result) throw new Error(`Missing deployment variable: ${name}`); return result }
  const pageUrl = await publishPages({
    repository: value('GITHUB_REPOSITORY'), sha: value('GITHUB_SHA'), runId: value('GITHUB_RUN_ID'),
    token: value('GH_TOKEN'), oidcUrl: value('ACTIONS_ID_TOKEN_REQUEST_URL'), oidcRequestToken: value('ACTIONS_ID_TOKEN_REQUEST_TOKEN'), apiUrl: value('GITHUB_API_URL'),
  }, { signal: controller.signal })
  appendFileSync(process.env.GITHUB_OUTPUT, `page_url=${pageUrl}\n`)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Pages publication failed.'
  console.error(`::error::${message.replace(/%/gu, '%25').replace(/\r/gu, '%0D').replace(/\n/gu, '%0A')}`)
  process.exitCode = 1
}
