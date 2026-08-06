import type { Env, SessionUser } from './types'
import { error } from './http'
import { isFinanceOwner as isFinanceOwnerEmail } from './config'

export function isPlatformUser(user: SessionUser): boolean {
  return user.role === 'platform' || user.role === 'owner'
}

export function requirePlatform(user: SessionUser): Response | null {
  if (!isPlatformUser(user)) return error('Forbidden', 403)
  return null
}

export function isFinanceOwner(user: SessionUser, env: Env): boolean {
  return isFinanceOwnerEmail(user, env)
}

export function requireFinanceOwner(user: SessionUser, env: Env): Response | null {
  if (!isFinanceOwner(user, env)) return error('Forbidden', 403)
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
