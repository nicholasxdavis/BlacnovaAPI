import type { Env } from './types'

const ALLOWED_DEFAULT = [
  'https://dashboard.blacnova.net',
  'https://www.blacnova.net',
  'https://blacnova.net',
]

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.CORS_ORIGINS || ALLOWED_DEFAULT.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extra,
    },
  })
}

export function error(message: string, status = 400, extra: HeadersInit = {}): Response {
  return json({ error: message }, status, extra)
}

export function id(prefix = ''): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return prefix ? `${prefix}_${rand}` : rand
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
