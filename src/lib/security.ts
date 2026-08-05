import type { Env } from './types'

/** Simple KV-backed rate limit. Returns true if allowed. */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`
  const current = Number((await env.SESSIONS.get(bucket)) || '0')
  if (current >= limit) return false
  await env.SESSIONS.put(bucket, String(current + 1), {
    expirationTtl: Math.max(windowSeconds * 2, 60),
  })
  return true
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export function clampString(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}
