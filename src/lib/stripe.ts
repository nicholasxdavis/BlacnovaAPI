import type { Env } from './types'

const STRIPE_API = 'https://api.stripe.com/v1'

function requireStripeKey(env: Env): string {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return env.STRIPE_SECRET_KEY
}

async function stripeGet(env: Env, path: string): Promise<unknown> {
  const key = requireStripeKey(env)
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Version': '2024-11-20.acacia',
    },
  })
  const data = (await res.json()) as { error?: { message?: string } }
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe request failed (${res.status})`)
  }
  return data
}

function centsToUsd(amount: number, currency: string): string {
  const value = (amount / 100).toFixed(2)
  return `${currency.toUpperCase()} ${value}`
}

export async function getBillingOverview(env: Env) {
  const [balanceRaw, chargesRaw, payoutsRaw] = await Promise.all([
    stripeGet(env, '/balance') as Promise<{
      available: Array<{ amount: number; currency: string }>
      pending: Array<{ amount: number; currency: string }>
    }>,
    stripeGet(env, '/charges?limit=15') as Promise<{
      data: Array<{
        id: string
        amount: number
        currency: string
        status: string
        description: string | null
        created: number
        paid: boolean
        billing_details?: { email?: string | null; name?: string | null }
        receipt_email?: string | null
      }>
    }>,
    stripeGet(env, '/payouts?limit=8') as Promise<{
      data: Array<{
        id: string
        amount: number
        currency: string
        status: string
        arrival_date: number
        created: number
      }>
    }>,
  ])

  const available = balanceRaw.available?.[0]
  const pending = balanceRaw.pending?.[0]

  return {
    balance: {
      available: available
        ? { amount: available.amount, currency: available.currency, formatted: centsToUsd(available.amount, available.currency) }
        : { amount: 0, currency: 'usd', formatted: 'USD 0.00' },
      pending: pending
        ? { amount: pending.amount, currency: pending.currency, formatted: centsToUsd(pending.amount, pending.currency) }
        : { amount: 0, currency: 'usd', formatted: 'USD 0.00' },
    },
    charges: (chargesRaw.data || []).map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      formatted: centsToUsd(c.amount, c.currency),
      status: c.status,
      paid: c.paid,
      description: c.description || 'Payment',
      customer: c.billing_details?.name || c.billing_details?.email || c.receipt_email || '—',
      createdAt: new Date(c.created * 1000).toISOString(),
    })),
    payouts: (payoutsRaw.data || []).map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      formatted: centsToUsd(p.amount, p.currency),
      status: p.status,
      arrivalDate: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
      createdAt: new Date(p.created * 1000).toISOString(),
    })),
  }
}
