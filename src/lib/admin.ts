import type { SessionUser } from './types'
import { error } from './http'

export function isPlatformUser(user: SessionUser): boolean {
  return user.role === 'platform' || user.role === 'owner'
}

export function requirePlatform(user: SessionUser): Response | null {
  if (!isPlatformUser(user)) return error('Forbidden — platform admin only', 403)
  return null
}

export const DEFAULT_CLIENT_MODULES = [
  'overview',
  'content',
  'media',
  'pages',
  'maintenance',
  'submissions',
  'analytics',
  'settings',
] as const

export const PLATFORM_MODULES = ['clients', 'accounts', 'billing'] as const
