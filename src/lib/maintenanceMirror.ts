import { getWebsite } from './data'
import { getFileSha, GitHubError, putRepoFile } from './github'
import { nowIso } from './http'
import type { Env } from './types'

/** Mirror maintenance flag to the primary website repo (Pages fallback). */
export async function mirrorMaintenanceJson(
  env: Env,
  websiteId: string,
  reason: string,
): Promise<void> {
  if (!env.GITHUB_TOKEN) return
  try {
    if (!(await getWebsite(env, websiteId))?.githubPublishEnabled) return

    const path = 'maintenance.json'
    const branch = env.GITHUB_BRANCH || 'main'
    for (let attempt = 0; attempt < 2; attempt++) {
      const sha = await getFileSha(env, path, branch)
      // Read current state after the GitHub revision, so an older update can't
      // overwrite a newer maintenance decision if the requests finish out of order.
      const row = await env.DB.prepare(
        `SELECT w.status, m.enabled, m.title, m.message, m.expected_return, m.updated_at
         FROM websites w LEFT JOIN maintenance m ON m.website_id = w.id
         WHERE w.id = ?`,
      ).bind(websiteId).first<{
        status: string
        enabled: number | null
        title: string | null
        message: string | null
        expected_return: string | null
        updated_at: string | null
      }>()
      if (!row) return
      const enabled = Boolean(row.enabled) || row.status === 'maintenance' || row.status === 'offline'
      const payload = JSON.stringify({
        enabled,
        title: row.title || 'We will be right back',
        message: row.message || 'Blacnova Development is temporarily offline. Please check back soon.',
        expectedReturn: row.expected_return || '',
        updatedAt: row.updated_at || nowIso(),
      }, null, 2)

      try {
        await putRepoFile(env, path, `${payload}\n`, `Update maintenance mode (${enabled ? 'on' : 'off'}) - ${reason}`, sha, branch)
        return
      } catch (err) {
        if (attempt > 0 || !(err instanceof GitHubError) || err.status !== 409) throw err
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ maintenance_mirror_failed: String(err), reason }))
  }
}
