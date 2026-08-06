import type { SessionUser } from './types'
import { error } from './http'

export function isPlatformUser(user: SessionUser): boolean {
  return user.role === 'platform' || user.role === 'owner'
}

export function requirePlatform(user: SessionUser): Response | null {
  if (!isPlatformUser(user)) return error('Forbidden - platform admin only', 403)
  return null
}

/** Stripe balance + BMC Finance — Nic only. */
export function isFinanceOwner(user: SessionUser): boolean {
  return user.email.toLowerCase() === 'nic@blacnova.net'
}

export function requireFinanceOwner(user: SessionUser): Response | null {
  if (!isFinanceOwner(user)) return error('Forbidden - finance access only', 403)
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
  'billing',
  'settings',
] as const

export const PLATFORM_MODULES = ['clients', 'accounts', 'finance', 'invoices', 'support'] as const

/** Ensure every portal always exposes Billing (idempotent). */
export function withBillingModule(modules: string[]): string[] {
  if (modules.includes('billing')) return modules
  const next = [...modules]
  const settingsIdx = next.indexOf('settings')
  if (settingsIdx >= 0) next.splice(settingsIdx, 0, 'billing')
  else next.push('billing')
  return next
}
