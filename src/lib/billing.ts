import { sendBrevoEmail } from './brevo'
import { nowIso, today } from './http'
import { createAndSendInvoice } from './invoices'
import { createNotification } from './notifications'
import { centsToUsd } from './stripe'
import type { Env } from './types'

const RETAINER_DAYS_UNTIL_DUE = 14
const MISS_THRESHOLD = 2

export type InvoiceKind = 'adhoc' | 'retainer'

export interface WebsiteBillingRow {
  id: string
  name: string
  domain: string
  status: string
  monthly_fee_cents: number
  billing_email: string | null
  billing_name: string | null
  billing_enabled: number
  billing_suspended: number
  last_retainer_period: string | null
  github_repo: string | null
}

function periodKey(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export { createNotification, listNotifications, markNotificationsRead } from './notifications'

async function resolveBillingContact(
  env: Env,
  site: WebsiteBillingRow,
): Promise<{ email: string; name: string } | null> {
  if (site.billing_email) {
    return {
      email: site.billing_email,
      name: site.billing_name || site.name,
    }
  }

  const user = await env.DB.prepare(
    `SELECT email, name FROM users
     WHERE website_id = ? AND COALESCE(active, 1) = 1
     ORDER BY CASE role WHEN 'platform' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END, created_at
     LIMIT 1`,
  )
    .bind(site.id)
    .first<{ email: string; name: string }>()

  if (!user) return null
  return { email: user.email, name: site.billing_name || user.name }
}

/** Count past-due unpaid retainer invoices for a website. */
export async function countMissedRetainers(env: Env, websiteId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM invoices
     WHERE website_id = ?
       AND kind = 'retainer'
       AND status IN ('open', 'uncollectible', 'pending')
       AND paid_at IS NULL
       AND due_at IS NOT NULL
       AND due_at < ?`,
  )
    .bind(websiteId, nowIso())
    .first<{ n: number }>()

  return Number(row?.n) || 0
}

export async function markInvoicePaid(
  env: Env,
  opts: { localId?: string; stripeInvoiceId?: string },
): Promise<void> {
  const paidAt = nowIso()
  if (opts.localId) {
    await env.DB.prepare(
      `UPDATE invoices SET status = 'paid', paid_at = COALESCE(paid_at, ?), error = NULL
       WHERE id = ?`,
    )
      .bind(paidAt, opts.localId)
      .run()
    return
  }
  if (opts.stripeInvoiceId) {
    await env.DB.prepare(
      `UPDATE invoices SET status = 'paid', paid_at = COALESCE(paid_at, ?), error = NULL
       WHERE stripe_invoice_id = ?`,
    )
      .bind(paidAt, opts.stripeInvoiceId)
      .run()
  }
}

export async function syncInvoiceStatus(
  env: Env,
  stripeInvoiceId: string,
  status: string,
): Promise<void> {
  if (status === 'paid') {
    await markInvoicePaid(env, { stripeInvoiceId })
    return
  }
  await env.DB.prepare(`UPDATE invoices SET status = ? WHERE stripe_invoice_id = ?`)
    .bind(status, stripeInvoiceId)
    .run()
}

export async function createRetainerInvoice(
  env: Env,
  site: WebsiteBillingRow,
  period: string,
): Promise<{ invoiceId: string } | { skipped: string } | { error: string }> {
  if (!site.billing_enabled || site.monthly_fee_cents < 50) {
    return { skipped: 'billing_disabled' }
  }
  if (site.last_retainer_period === period) {
    return { skipped: 'already_billed' }
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM invoices WHERE website_id = ? AND kind = 'retainer' AND billing_period = ?`,
  )
    .bind(site.id, period)
    .first()
  if (existing) {
    await env.DB.prepare(
      `UPDATE websites SET last_retainer_period = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(period, nowIso(), site.id)
      .run()
    return { skipped: 'period_exists' }
  }

  const contact = await resolveBillingContact(env, site)
  if (!contact) return { error: 'no_billing_contact' }

  const label = periodLabel(period)
  const description = `Monthly website management - ${label} (${site.domain})`

  try {
    const invoice = await createAndSendInvoice(env, {
      customerEmail: contact.email,
      customerName: contact.name,
      amountCents: site.monthly_fee_cents,
      currency: 'usd',
      description,
      daysUntilDue: RETAINER_DAYS_UNTIL_DUE,
      websiteId: site.id,
      kind: 'retainer',
      billingPeriod: period,
    })

    await env.DB.prepare(
      `UPDATE websites SET last_retainer_period = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(period, nowIso(), site.id)
      .run()

    return { invoiceId: invoice.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invoice failed' }
  }
}

export async function suspendWebsiteForNonpayment(
  env: Env,
  site: WebsiteBillingRow,
): Promise<void> {
  if (site.billing_suspended) return

  const title = 'Website paused - payment required'
  const message =
    'This site has been unpublished because two or more monthly invoices are past due. ' +
    'Pay outstanding invoices from your Blacnova dashboard (Billing), then contact nic@blacnova.net to restore the site.'

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE websites SET
        billing_suspended = 1,
        status = 'offline',
        updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso(), site.id),
    env.DB.prepare(
      `UPDATE maintenance SET
        enabled = 1,
        title = ?,
        message = ?,
        expected_return = '',
        updated_at = ?
       WHERE website_id = ?`,
    ).bind(title, message, nowIso(), site.id),
    env.DB.prepare(
      `UPDATE pages SET status = 'unpublished', updated_at = ? WHERE website_id = ?`,
    ).bind(today(), site.id),
  ])

  // Ensure maintenance row exists if missing
  const maint = await env.DB.prepare(`SELECT website_id FROM maintenance WHERE website_id = ?`)
    .bind(site.id)
    .first()
  if (!maint) {
    await env.DB.prepare(
      `INSERT INTO maintenance (website_id, enabled, title, message, expected_return, updated_at)
       VALUES (?, 1, ?, ?, '', ?)`,
    )
      .bind(site.id, title, message, nowIso())
      .run()
  }

  await createNotification(env, {
    websiteId: site.id,
    type: 'billing_suspend',
    title: 'Website unpublished for nonpayment',
    body: 'Two or more monthly invoices are past due. Pay invoices under Billing, then contact Blacnova to restore the site.',
    link: '/billing',
  })

  const contact = await resolveBillingContact(env, site)
  const support = env.SUPPORT_EMAIL || 'nic@blacnova.net'
  const text = [
    `Website unpublished for nonpayment`,
    '',
    `Client: ${site.name} (${site.domain})`,
    `Reason: ${MISS_THRESHOLD}+ past-due monthly invoices.`,
    '',
    'Pay outstanding invoices at https://dashboard.blacnova.net/billing',
    'Then contact nic@blacnova.net to restore the site.',
  ].join('\n')

  const html = `<p>${text.replace(/\n/g, '<br>')}</p>`

  const recipients: Array<{ email: string; name: string }> = []
  if (contact) recipients.push(contact)
  recipients.push({ email: support, name: 'Blacnova' })

  const users = await env.DB.prepare(
    `SELECT email, name FROM users WHERE website_id = ? AND COALESCE(active, 1) = 1`,
  )
    .bind(site.id)
    .all<{ email: string; name: string }>()

  for (const u of users.results || []) {
    if (!recipients.some((r) => r.email.toLowerCase() === u.email.toLowerCase())) {
      recipients.push(u)
    }
  }

  for (const r of recipients) {
    try {
      await sendBrevoEmail(env, {
        toEmail: r.email,
        toName: r.name,
        subject: `Action required: ${site.domain} unpublished for nonpayment`,
        html,
        text,
      })
    } catch (err) {
      console.error(JSON.stringify({ billing_suspend_email_failed: String(err), to: r.email }))
    }
  }
}

export async function restoreWebsiteBilling(
  env: Env,
  websiteId: string,
): Promise<boolean> {
  const site = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
    .bind(websiteId)
    .first()
  if (!site) return false

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE websites SET billing_suspended = 0, status = 'live', updated_at = ? WHERE id = ?`,
    ).bind(nowIso(), websiteId),
    env.DB.prepare(
      `UPDATE maintenance SET enabled = 0, updated_at = ? WHERE website_id = ?`,
    ).bind(nowIso(), websiteId),
    env.DB.prepare(
      `UPDATE pages SET status = 'published', updated_at = ? WHERE website_id = ?`,
    ).bind(today(), websiteId),
  ])

  await createNotification(env, {
    websiteId,
    type: 'billing_restore',
    title: 'Website restored',
    body: 'Billing suspension was cleared. Your site is live again.',
    link: '/billing',
  })

  return true
}

/** Run on the 1st (UTC): create retainer invoices for enabled sites. */
export async function processMonthlyRetainers(env: Env): Promise<{
  processed: number
  sent: number
  skipped: number
  errors: string[]
}> {
  const now = new Date()
  if (now.getUTCDate() !== 1) {
    return { processed: 0, sent: 0, skipped: 0, errors: [] }
  }

  const period = periodKey(now)
  const { results } = await env.DB.prepare(
    `SELECT id, name, domain, status,
            COALESCE(monthly_fee_cents, 0) AS monthly_fee_cents,
            billing_email, billing_name,
            COALESCE(billing_enabled, 0) AS billing_enabled,
            COALESCE(billing_suspended, 0) AS billing_suspended,
            last_retainer_period, github_repo
     FROM websites
     WHERE COALESCE(billing_enabled, 0) = 1
       AND COALESCE(monthly_fee_cents, 0) >= 50`,
  ).all<WebsiteBillingRow>()

  let processed = 0
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const site of results || []) {
    processed += 1
    const result = await createRetainerInvoice(env, site, period)
    if ('invoiceId' in result) sent += 1
    else if ('skipped' in result) skipped += 1
    else errors.push(`${site.id}: ${result.error}`)
  }

  return { processed, sent, skipped, errors }
}

/** Daily: suspend sites with 2+ past-due unpaid retainers. */
export async function enforceNonpaymentSuspensions(env: Env): Promise<{
  checked: number
  suspended: number
}> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, domain, status,
            COALESCE(monthly_fee_cents, 0) AS monthly_fee_cents,
            billing_email, billing_name,
            COALESCE(billing_enabled, 0) AS billing_enabled,
            COALESCE(billing_suspended, 0) AS billing_suspended,
            last_retainer_period, github_repo
     FROM websites
     WHERE COALESCE(billing_enabled, 0) = 1
       AND COALESCE(billing_suspended, 0) = 0`,
  ).all<WebsiteBillingRow>()

  let checked = 0
  let suspended = 0

  for (const site of results || []) {
    checked += 1
    const missed = await countMissedRetainers(env, site.id)
    if (missed >= MISS_THRESHOLD) {
      await suspendWebsiteForNonpayment(env, site)
      suspended += 1
    }
  }

  return { checked, suspended }
}

export async function getClientBillingSummary(env: Env, websiteId: string) {
  const site = await env.DB.prepare(
    `SELECT id, name, domain, status,
            COALESCE(monthly_fee_cents, 0) AS monthly_fee_cents,
            billing_email, billing_name,
            COALESCE(billing_enabled, 0) AS billing_enabled,
            COALESCE(billing_suspended, 0) AS billing_suspended,
            last_retainer_period
     FROM websites WHERE id = ?`,
  )
    .bind(websiteId)
    .first<{
      id: string
      name: string
      domain: string
      status: string
      monthly_fee_cents: number
      billing_email: string | null
      billing_name: string | null
      billing_enabled: number
      billing_suspended: number
      last_retainer_period: string | null
    }>()

  if (!site) return null

  const missed = await countMissedRetainers(env, websiteId)
  const nextPeriod = (() => {
    const d = new Date()
    if (d.getUTCDate() === 1 && site.last_retainer_period !== periodKey(d)) {
      return periodKey(d)
    }
    const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    return periodKey(n)
  })()

  return {
    websiteId: site.id,
    websiteName: site.name,
    domain: site.domain,
    monthlyFeeCents: site.monthly_fee_cents,
    monthlyFeeFormatted: centsToUsd(site.monthly_fee_cents, 'usd'),
    billingEnabled: Boolean(site.billing_enabled),
    billingSuspended: Boolean(site.billing_suspended),
    billingEmail: site.billing_email,
    lastRetainerPeriod: site.last_retainer_period,
    nextBillPeriod: site.billing_enabled ? nextPeriod : null,
    nextBillLabel: site.billing_enabled ? periodLabel(nextPeriod) : null,
    missedInvoices: missed,
    billsOnDay: 1,
  }
}
