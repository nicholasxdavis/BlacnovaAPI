import { getFileSha, putRepoFile } from './github'
import { nowIso } from './http'
import type { Env } from './types'

/** Mirror maintenance flag to the primary website repo (Pages fallback). */
export async function mirrorMaintenanceJson(
  env: Env,
  opts: {
    enabled: boolean
    title: string
    message: string
    expectedReturn?: string
    reason: string
  },
): Promise<void> {
  if (!env.GITHUB_TOKEN) return
  try {
    const payload = JSON.stringify(
      {
        enabled: opts.enabled,
        title: opts.title,
        message: opts.message,
        expectedReturn: opts.expectedReturn || '',
        updatedAt: nowIso(),
      },
      null,
      2,
    )
    const sha = await getFileSha(env, 'maintenance.json')
    await putRepoFile(
      env,
      'maintenance.json',
      `${payload}\n`,
      `Update maintenance mode (${opts.enabled ? 'on' : 'off'}) - ${opts.reason}`,
      sha,
    )
  } catch (err) {
    console.error(JSON.stringify({ maintenance_mirror_failed: String(err), reason: opts.reason }))
  }
}
