import type { Env, SessionUser } from './types'

export const MIN_PASSWORD_LENGTH = 12

/** Dummy PBKDF2 hash so login always does the same work when the user is missing. */
export const DUMMY_PASSWORD_HASH =
  '00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000'

export function supportEmail(env: Env): string {
  return String(env.SUPPORT_EMAIL || env.BREVO_SENDER_EMAIL || '')
    .trim()
    .toLowerCase()
}

export function financeOwnerEmail(env: Env): string {
  return String(env.FINANCE_OWNER_EMAIL || env.SUPPORT_EMAIL || '')
    .trim()
    .toLowerCase()
}

export function isFinanceOwner(user: SessionUser, env: Env): boolean {
  const owner = financeOwnerEmail(env)
  return Boolean(owner) && user.email.toLowerCase() === owner
}

export function assertPasswordPolicy(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  return null
}
