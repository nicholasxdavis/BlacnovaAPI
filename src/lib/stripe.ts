import type { Env } from './types'

const STRIPE_API = 'https://api.stripe.com/v1'
const STRIPE_VERSION = '2024-11-20.acacia'

function requireStripeKey(env: Env): string {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return env.STRIPE_SECRET_KEY
}

async function stripeRequest(
  env: Env,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  form?: Record<string, string | number | undefined>,
): Promise<unknown> {
  const key = requireStripeKey(env)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_VERSION,
  }

  let body: string | undefined
  if (method === 'POST' && form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(form)) {
      if (v === undefined || v === '') continue
      params.set(k, String(v))
    }
    body = params.toString()
  }

  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body })
  if (method === 'DELETE' && res.status === 200) {
    const data = (await res.json()) as { error?: { message?: string }; deleted?: boolean }
    if (data.error) throw new Error(data.error.message || 'Stripe delete failed')
    return data
  }
  const data = (await res.json()) as { error?: { message?: string } }
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe request failed (${res.status})`)
  }
  return data
}

async function stripeGet(env: Env, path: string): Promise<unknown> {
  return stripeRequest(env, 'GET', path)
}

export function centsToUsd(amount: number, currency: string): string {
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
        ? {
            amount: available.amount,
            currency: available.currency,
            formatted: centsToUsd(available.amount, available.currency),
          }
        : { amount: 0, currency: 'usd', formatted: 'USD 0.00' },
      pending: pending
        ? {
            amount: pending.amount,
            currency: pending.currency,
            formatted: centsToUsd(pending.amount, pending.currency),
          }
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

async function findOrCreateCustomer(
  env: Env,
  email: string,
  name: string,
): Promise<{ id: string }> {
  const search = (await stripeGet(
    env,
    `/customers?email=${encodeURIComponent(email)}&limit=1`,
  )) as { data: Array<{ id: string }> }

  if (search.data?.[0]?.id) {
    return { id: search.data[0].id }
  }

  return (await stripeRequest(env, 'POST', '/customers', {
    email,
    name,
    'metadata[source]': 'blacnova_dashboard',
  })) as { id: string }
}

export async function createAndFinalizeInvoice(
  env: Env,
  opts: {
    email: string
    name: string
    amountCents: number
    currency: string
    description: string
    daysUntilDue: number
    metadata?: Record<string, string>
  },
): Promise<{
  invoiceId: string
  customerId: string
  status: string
  hostedInvoiceUrl: string
  invoicePdf: string | null
}> {
  if (opts.amountCents < 50) {
    throw new Error('Amount must be at least $0.50')
  }

  const customer = await findOrCreateCustomer(env, opts.email, opts.name)

  const invoiceForm: Record<string, string | number | undefined> = {
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: opts.daysUntilDue,
    auto_advance: 'false',
    description: opts.description,
  }
  if (opts.metadata) {
    for (const [k, v] of Object.entries(opts.metadata)) {
      if (v) invoiceForm[`metadata[${k}]`] = v
    }
  }

  const invoice = (await stripeRequest(env, 'POST', '/invoices', invoiceForm)) as {
    id: string
  }

  await stripeRequest(env, 'POST', '/invoiceitems', {
    customer: customer.id,
    invoice: invoice.id,
    amount: opts.amountCents,
    currency: opts.currency,
    description: opts.description,
  })

  const finalized = (await stripeRequest(
    env,
    'POST',
    `/invoices/${invoice.id}/finalize`,
    { auto_advance: 'false' },
  )) as {
    id: string
    status: string
    hosted_invoice_url: string | null
    invoice_pdf: string | null
  }

  if (!finalized.hosted_invoice_url) {
    throw new Error('Stripe did not return a hosted invoice URL')
  }

  return {
    invoiceId: finalized.id,
    customerId: customer.id,
    status: finalized.status,
    hostedInvoiceUrl: finalized.hosted_invoice_url,
    invoicePdf: finalized.invoice_pdf,
  }
}

/** Void an open Stripe invoice. Paid/void invoices are left alone (caller still forgets locally). */
export async function voidStripeInvoice(env: Env, stripeInvoiceId: string): Promise<void> {
  const current = (await stripeGet(env, `/invoices/${stripeInvoiceId}`)) as {
    id: string
    status: string
  }
  if (current.status === 'paid' || current.status === 'void') return
  if (current.status === 'draft') {
    await stripeRequest(env, 'DELETE', `/invoices/${stripeInvoiceId}`)
    return
  }
  await stripeRequest(env, 'POST', `/invoices/${stripeInvoiceId}/void`)
}
