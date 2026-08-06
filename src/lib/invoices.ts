import { invoiceEmailContent, sendBrevoEmail } from './brevo'
import { createNotification } from './notifications'
import { id, nowIso, today } from './http'
import { createAndFinalizeInvoice, centsToUsd, voidStripeInvoice } from './stripe'
import type { Env } from './types'

export interface InvoiceDraft {
  customerEmail: string
  customerName: string
  amountCents: number
  currency?: string
  description: string
  daysUntilDue?: number
  websiteId?: string | null
  recurringId?: string | null
  kind?: 'adhoc' | 'retainer'
  billingPeriod?: string | null
}

export interface InvoiceRecord {
  id: string
  websiteId: string | null
  customerEmail: string
  customerName: string
  amountCents: number
  currency: string
  description: string
  status: string
  stripeInvoiceId: string | null
  stripeCustomerId: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  recurringId: string | null
  daysUntilDue: number
  kind: string
  billingPeriod: string | null
  paidAt: string | null
  dueAt: string | null
  sentAt: string | null
  error: string | null
  createdAt: string
  websiteName?: string | null
  websiteDomain?: string | null
  formatted?: string
}

function mapInvoiceRow(row: {
  id: string
  website_id: string | null
  customer_email: string
  customer_name: string
  amount_cents: number
  currency: string
  description: string
  status: string
  stripe_invoice_id: string | null
  stripe_customer_id: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  recurring_id: string | null
  days_until_due: number
  kind?: string | null
  billing_period?: string | null
  paid_at?: string | null
  due_at?: string | null
  sent_at: string | null
  error: string | null
  created_at: string
  website_name?: string | null
  website_domain?: string | null
}): InvoiceRecord {
  return {
    id: row.id,
    websiteId: row.website_id,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    description: row.description,
    status: row.status,
    stripeInvoiceId: row.stripe_invoice_id,
    stripeCustomerId: row.stripe_customer_id,
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdf: row.invoice_pdf,
    recurringId: row.recurring_id,
    daysUntilDue: row.days_until_due,
    kind: row.kind || 'adhoc',
    billingPeriod: row.billing_period ?? null,
    paidAt: row.paid_at ?? null,
    dueAt: row.due_at ?? null,
    sentAt: row.sent_at,
    error: row.error,
    createdAt: row.created_at,
    websiteName: row.website_name ?? null,
    websiteDomain: row.website_domain ?? null,
    formatted: centsToUsd(row.amount_cents, row.currency),
  }
}

export async function listInvoices(env: Env, limit = 50): Promise<InvoiceRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT i.*, w.name AS website_name, w.domain AS website_domain
     FROM invoices i
     LEFT JOIN websites w ON w.id = i.website_id
     ORDER BY i.created_at DESC
     LIMIT ?`,
  )
    .bind(Math.min(Math.max(limit, 1), 100))
    .all<Parameters<typeof mapInvoiceRow>[0]>()

  return (results || []).map(mapInvoiceRow)
}

export async function listInvoicesForWebsite(
  env: Env,
  websiteId: string,
  limit = 50,
): Promise<InvoiceRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT i.*, w.name AS website_name, w.domain AS website_domain
     FROM invoices i
     LEFT JOIN websites w ON w.id = i.website_id
     WHERE i.website_id = ?
     ORDER BY i.created_at DESC
     LIMIT ?`,
  )
    .bind(websiteId, Math.min(Math.max(limit, 1), 100))
    .all<Parameters<typeof mapInvoiceRow>[0]>()

  return (results || []).map(mapInvoiceRow)
}

/** Remove invoice from the portal ledger. Best-effort void on Stripe when still open. */
export async function deleteInvoiceRecord(env: Env, invoiceId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id, stripe_invoice_id, status FROM invoices WHERE id = ?`,
  )
    .bind(invoiceId)
    .first<{ id: string; stripe_invoice_id: string | null; status: string }>()
  if (!row) return false

  if (row.stripe_invoice_id && env.STRIPE_SECRET_KEY) {
    try {
      await voidStripeInvoice(env, row.stripe_invoice_id)
    } catch (err) {
      console.error(JSON.stringify({ invoice_void_failed: String(err), invoiceId }))
    }
  }

  await env.DB.prepare(`DELETE FROM invoices WHERE id = ?`).bind(invoiceId).run()
  return true
}

function dueAtIso(daysUntilDue: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysUntilDue)
  return d.toISOString()
}

export async function createAndSendInvoice(env: Env, draft: InvoiceDraft): Promise<InvoiceRecord> {
  const currency = (draft.currency || 'usd').toLowerCase()
  const daysUntilDue = Math.min(Math.max(draft.daysUntilDue ?? 14, 1), 90)
  const kind = draft.kind || 'adhoc'
  const localId = id('inv')
  const createdAt = nowIso()
  const dueAt = dueAtIso(daysUntilDue)

  await env.DB.prepare(
    `INSERT INTO invoices
      (id, website_id, customer_email, customer_name, amount_cents, currency, description,
       status, recurring_id, days_until_due, kind, billing_period, due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      localId,
      draft.websiteId || null,
      draft.customerEmail,
      draft.customerName,
      draft.amountCents,
      currency,
      draft.description,
      draft.recurringId || null,
      daysUntilDue,
      kind,
      draft.billingPeriod || null,
      dueAt,
      createdAt,
    )
    .run()

  try {
    const stripe = await createAndFinalizeInvoice(env, {
      email: draft.customerEmail,
      name: draft.customerName,
      amountCents: draft.amountCents,
      currency,
      description: draft.description,
      daysUntilDue,
      metadata: {
        blacnova_invoice_id: localId,
        website_id: draft.websiteId || '',
        recurring_id: draft.recurringId || '',
        kind,
        billing_period: draft.billingPeriod || '',
      },
    })

    // Persist Stripe refs immediately so webhooks can reconcile even if email fails.
    await env.DB.prepare(
      `UPDATE invoices SET
        status = ?,
        stripe_invoice_id = ?,
        stripe_customer_id = ?,
        hosted_invoice_url = ?,
        invoice_pdf = ?,
        error = NULL
       WHERE id = ?`,
    )
      .bind(
        stripe.status || 'open',
        stripe.invoiceId,
        stripe.customerId,
        stripe.hostedInvoiceUrl,
        stripe.invoicePdf,
        localId,
      )
      .run()

    const dueLabel =
      daysUntilDue === 1 ? 'in 1 day' : `in ${daysUntilDue} days`
    const amountFormatted = centsToUsd(draft.amountCents, currency)
    const email = invoiceEmailContent({
      customerName: draft.customerName,
      amountFormatted,
      description: draft.description,
      payUrl: stripe.hostedInvoiceUrl,
      dueLabel,
    })

    let emailError: string | null = null
    try {
      await sendBrevoEmail(env, {
        toEmail: draft.customerEmail,
        toName: draft.customerName,
        subject: email.subject,
        html: email.html,
        text: email.text,
      })
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'Email failed'
      console.error(JSON.stringify({ invoice_email_failed: emailError, invoiceId: localId }))
    }

    const sentAt = nowIso()
    await env.DB.prepare(
      `UPDATE invoices SET sent_at = ?, error = ? WHERE id = ?`,
    )
      .bind(sentAt, emailError, localId)
      .run()

    // Linked portal clients also get an in-app notification.
    if (draft.websiteId) {
      try {
        await createNotification(env, {
          websiteId: draft.websiteId,
          type: 'invoice',
          title: `Invoice ready - ${amountFormatted}`,
          body: draft.description,
          link: '/billing',
        })
      } catch (err) {
        console.error(JSON.stringify({ invoice_notify_failed: String(err) }))
      }
    }

    return {
      id: localId,
      websiteId: draft.websiteId || null,
      customerEmail: draft.customerEmail,
      customerName: draft.customerName,
      amountCents: draft.amountCents,
      currency,
      description: draft.description,
      status: stripe.status || 'open',
      stripeInvoiceId: stripe.invoiceId,
      stripeCustomerId: stripe.customerId,
      hostedInvoiceUrl: stripe.hostedInvoiceUrl,
      invoicePdf: stripe.invoicePdf,
      recurringId: draft.recurringId || null,
      daysUntilDue,
      kind,
      billingPeriod: draft.billingPeriod || null,
      paidAt: null,
      dueAt,
      sentAt,
      error: emailError,
      createdAt,
      formatted: amountFormatted,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invoice failed'
    await env.DB.prepare(`UPDATE invoices SET status = 'failed', error = ? WHERE id = ?`)
      .bind(message, localId)
      .run()
    throw err
  }
}

export function billingDayForDate(date: Date, preferredDay: number): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Math.min(Math.max(preferredDay, 1), Math.min(lastDay, 28))
}

export async function processDueRecurringInvoices(env: Env): Promise<{
  processed: number
  sent: number
  errors: string[]
}> {
  const now = new Date()
  const todayDate = today()
  const day = now.getUTCDate()

  const { results } = await env.DB.prepare(
    `SELECT * FROM recurring_invoices WHERE active = 1`,
  ).all<{
    id: string
    website_id: string | null
    customer_email: string
    customer_name: string
    amount_cents: number
    currency: string
    description: string
    day_of_month: number
    days_until_due: number
    last_sent_on: string | null
  }>()

  let processed = 0
  let sent = 0
  const errors: string[] = []

  for (const row of results || []) {
    const dueDay = billingDayForDate(now, row.day_of_month)
    if (day !== dueDay) continue
    if (row.last_sent_on && row.last_sent_on.slice(0, 7) === todayDate.slice(0, 7)) continue

    processed += 1
    try {
      await createAndSendInvoice(env, {
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        amountCents: row.amount_cents,
        currency: row.currency,
        description: row.description,
        daysUntilDue: row.days_until_due,
        websiteId: row.website_id,
        recurringId: row.id,
        kind: 'adhoc',
      })
      await env.DB.prepare(
        `UPDATE recurring_invoices SET last_sent_on = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(todayDate, nowIso(), row.id)
        .run()
      sent += 1
    } catch (err) {
      errors.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { processed, sent, errors }
}
