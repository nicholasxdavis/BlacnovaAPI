import { id, nowIso } from './http'
import type { Env } from './types'

export async function createNotification(
  env: Env,
  opts: {
    websiteId: string
    type: string
    title: string
    body: string
    link?: string
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (id, website_id, type, title, body, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id('ntf'),
      opts.websiteId,
      opts.type,
      opts.title,
      opts.body,
      opts.link || null,
      nowIso(),
    )
    .run()
}

export async function listNotifications(
  env: Env,
  websiteId: string,
  limit = 30,
): Promise<
  Array<{
    id: string
    type: string
    title: string
    body: string
    link: string | null
    readAt: string | null
    createdAt: string
  }>
> {
  const { results } = await env.DB.prepare(
    `SELECT id, type, title, body, link, read_at, created_at
     FROM notifications
     WHERE website_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(websiteId, Math.min(Math.max(limit, 1), 50))
    .all<{
      id: string
      type: string
      title: string
      body: string
      link: string | null
      read_at: string | null
      created_at: string
    }>()

  return (results || []).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at,
    createdAt: r.created_at,
  }))
}

export async function markNotificationsRead(
  env: Env,
  websiteId: string,
  ids?: string[],
): Promise<void> {
  const stamped = nowIso()
  if (ids?.length) {
    for (const nid of ids) {
      await env.DB.prepare(
        `UPDATE notifications SET read_at = COALESCE(read_at, ?)
         WHERE id = ? AND website_id = ?`,
      )
        .bind(stamped, nid, websiteId)
        .run()
    }
    return
  }
  await env.DB.prepare(
    `UPDATE notifications SET read_at = ?
     WHERE website_id = ? AND read_at IS NULL`,
  )
    .bind(stamped, websiteId)
    .run()
}
