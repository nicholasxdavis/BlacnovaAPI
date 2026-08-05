import { sessionToken } from './auth'
import type { Env, SessionRecord, SessionUser } from './types'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = sessionToken()
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)
  const record: SessionRecord = {
    userId,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }
  await env.SESSIONS.put(token, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
  return token
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(token)
}

/** Invalidate all sessions created before now for a user (password reset / deactivate). */
export async function revokeUserSessions(env: Env, userId: string): Promise<void> {
  await env.SESSIONS.put(`revoke:${userId}`, new Date().toISOString(), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
}

export async function getSessionUser(
  env: Env,
  request: Request,
): Promise<{ user: SessionUser; token: string } | null> {
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null

  const raw = await env.SESSIONS.get(token)
  if (!raw) return null

  const session = JSON.parse(raw) as SessionRecord
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await env.SESSIONS.delete(token)
    return null
  }

  const revokedAt = await env.SESSIONS.get(`revoke:${session.userId}`)
  if (revokedAt && new Date(session.createdAt).getTime() <= new Date(revokedAt).getTime()) {
    await env.SESSIONS.delete(token)
    return null
  }

  const row = await env.DB.prepare(
    `SELECT id, email, name, role, website_id, COALESCE(active, 1) AS active FROM users WHERE id = ?`,
  )
    .bind(session.userId)
    .first<{
      id: string
      email: string
      name: string
      role: string
      website_id: string
      active: number
    }>()

  if (!row || !row.active) {
    await env.SESSIONS.delete(token)
    return null
  }

  return {
    token,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      websiteId: row.website_id,
    },
  }
}

export function parseModules(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
