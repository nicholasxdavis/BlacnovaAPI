import type { Env } from './types'
import { today } from './http'

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function visitorFingerprint(request: Request, domain: string): string {
  const ip = request.headers.get('CF-Connecting-IP') || '0'
  const ua = request.headers.get('User-Agent') || ''
  const raw = `${domain}|${ip}|${ua.slice(0, 120)}|${dayKey()}`
  // FNV-1a 32-bit
  let hash = 2166136261
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export async function recordPageview(
  env: Env,
  request: Request,
  input: { domain: string; path?: string; referrer?: string },
): Promise<void> {
  const domain = input.domain.trim().toLowerCase()
  const path = (input.path || '/').slice(0, 300)
  const referrer = (input.referrer || '').slice(0, 300)
  const date = today()

  const website = await env.DB.prepare(`SELECT id FROM websites WHERE domain = ?`)
    .bind(domain)
    .first<{ id: string }>()
  if (!website) return

  // Optional future: Workers Analytics Engine (enable in CF dashboard first)
  // env.ANALYTICS?.writeDataPoint({ blobs: [domain, path], doubles: [1], indexes: [domain] })

  const fp = visitorFingerprint(request, domain)
  const visitKey = `visit:${website.id}:${date}:${fp}`
  const seen = await env.SESSIONS.get(visitKey)
  const isNewVisitor = !seen
  if (isNewVisitor) {
    await env.SESSIONS.put(visitKey, '1', { expirationTtl: 60 * 60 * 36 })
  }

  const existing = await env.DB.prepare(
    `SELECT id, visitors, pageviews FROM analytics_points WHERE website_id = ? AND date = ?`,
  )
    .bind(website.id, date)
    .first<{ id: string; visitors: number; pageviews: number }>()

  if (existing) {
    await env.DB.prepare(
      `UPDATE analytics_points
       SET pageviews = pageviews + 1,
           visitors = visitors + ?
       WHERE id = ?`,
    )
      .bind(isNewVisitor ? 1 : 0, existing.id)
      .run()
  } else {
    const id = `an_${website.id}_${date.replace(/-/g, '')}`
    await env.DB.prepare(
      `INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions)
       VALUES (?, ?, ?, ?, 1, 0)`,
    )
      .bind(id, website.id, date, isNewVisitor ? 1 : 0)
      .run()
  }
}

export async function getAnalyticsSeries(env: Env, websiteId: string) {
  const { results } = await env.DB.prepare(
    `SELECT date, visitors, pageviews, submissions
     FROM analytics_points
     WHERE website_id = ?
     ORDER BY date ASC`,
  )
    .bind(websiteId)
    .all<{ date: string; visitors: number; pageviews: number; submissions: number }>()

  const points = results || []

  // Overlay real form submission counts by day
  const { results: subs } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
     FROM submissions
     WHERE website_id = ?
     GROUP BY substr(created_at, 1, 10)`,
  )
    .bind(websiteId)
    .all<{ day: string; count: number }>()

  const subMap = new Map((subs || []).map((s) => [s.day, Number(s.count)]))

  return points.map((p) => ({
    date: p.date,
    visitors: Number(p.visitors) || 0,
    pageviews: Number(p.pageviews) || 0,
    submissions: subMap.has(p.date) ? Number(subMap.get(p.date)) : Number(p.submissions) || 0,
  }))
}

export function seriesDeltas(series: Array<{ visitors: number; pageviews: number; submissions: number }>) {
  if (series.length < 2) {
    return {
      visitors: { label: 'Not enough data yet', trend: 'flat' as const },
      pageviews: { label: 'Not enough data yet', trend: 'flat' as const },
      submissions: { label: 'Not enough data yet', trend: 'flat' as const },
    }
  }
  const half = Math.max(1, Math.floor(series.length / 2))
  const prev = series.slice(0, -half)
  const curr = series.slice(-half)
  const sum = (arr: typeof series, key: 'visitors' | 'pageviews' | 'submissions') =>
    arr.reduce((n, p) => n + p[key], 0)

  function delta(key: 'visitors' | 'pageviews' | 'submissions') {
    const a = sum(prev, key)
    const b = sum(curr, key)
    if (a === 0 && b === 0) return { label: 'No change', trend: 'flat' as const }
    if (a === 0) return { label: 'New activity', trend: 'up' as const }
    const pct = ((b - a) / a) * 100
    const trend = pct > 1 ? ('up' as const) : pct < -1 ? ('down' as const) : ('flat' as const)
    const sign = pct > 0 ? '+' : ''
    return { label: `${sign}${pct.toFixed(1)}% vs prior period`, trend }
  }

  return {
    visitors: delta('visitors'),
    pageviews: delta('pageviews'),
    submissions: delta('submissions'),
  }
}
