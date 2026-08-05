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

const ALLOWED_FORM_ORIGINS = [
  'https://www.blacnova.net',
  'https://blacnova.net',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8787',
]

/** Soft Origin/Referer check for browser form posts. Non-browser clients (no Origin) still allowed but rate-limited harder. */
export function isAllowedFormOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin') || ''
  const referer = request.headers.get('Referer') || ''
  const allowed = (env.CORS_ORIGINS || ALLOWED_FORM_ORIGINS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (origin) return allowed.includes(origin)

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin
      return allowed.includes(refOrigin)
    } catch {
      return false
    }
  }

  // No Origin/Referer — likely non-browser. Allow but caller should use stricter rate limits.
  return true
}

export function hasBrowserOrigin(request: Request): boolean {
  return Boolean(request.headers.get('Origin') || request.headers.get('Referer'))
}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'trashmail.com',
  'yopmail.com',
  'sharklasers.com',
  'getnada.com',
])

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return Boolean(domain && DISPOSABLE_DOMAINS.has(domain))
}

/** Honeypot filled, too-fast submit, or obvious spam content. */
export function submissionLooksLikeSpam(input: {
  honeypot?: string
  websiteField?: string
  companyUrl?: string
  startedAt?: number | string
  message: string
  name: string
}): string | null {
  if (clampString(input.honeypot, 200) || clampString(input.websiteField, 200) || clampString(input.companyUrl, 200)) {
    return 'rejected'
  }

  const started = Number(input.startedAt)
  if (!Number.isFinite(started) || started <= 0) {
    return 'missing_timing'
  }
  const elapsed = Date.now() - started
  if (elapsed < 2500) return 'too_fast'
  if (elapsed > 1000 * 60 * 60 * 24) return 'stale'

  const message = input.message.toLowerCase()
  const urlCount = (input.message.match(/https?:\/\//gi) || []).length
  if (urlCount >= 4) return 'link_spam'

  const spamPhrases = [
    'casino',
    'viagra',
    'seo ranking',
    'buy followers',
    'onlyfans',
    'telegram @',
  ]
  if (spamPhrases.some((p) => message.includes(p))) return 'content'

  if (input.name.length < 2) return 'name'
  if (input.message.replace(/\s+/g, '').length < 8) return 'message_short'

  return null
}
