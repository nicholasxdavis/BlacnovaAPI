import { id, nowIso } from './http'
import type { Env } from './types'

export type BmcKind = 'donation' | 'membership' | 'recurring' | 'shop' | 'other' | 'opening'

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : {}
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Parse BMC webhook/API amounts into integer cents. */
export function extractAmountCents(data: LooseRecord): { amountCents: number; currency: string; coffees: number | null } {
  const currency = (pickString(data.currency, data.support_currency, data.subscription_currency) || 'usd').toLowerCase()
  const coffees = pickNumber(data.support_coffees, data.coffees, data.quantity, data.subscription_coffee_num)

  const direct = pickNumber(
    data.amount_cents,
    data.amount,
    data.total_amount,
    data.support_amount,
    data.amount_support,
    data.subscription_amount,
    data.price,
    data.unit_price,
  )

  if (direct !== null) {
    // BMC often sends dollars as "5.00" / 5 — treat values < 1000 without decimal as dollars if under 500
    // Prefer: if string had decimal or value has fractional part, it's dollars; if integer >= 100 and looks like cents, use as cents
    if (Number.isInteger(direct) && Math.abs(direct) >= 100 && !String(pickString(data.amount_cents) || '').includes('.')) {
      // If field was explicitly amount_cents, keep; otherwise assume dollars for small tip amounts
      if (data.amount_cents !== undefined) {
        return { amountCents: Math.round(direct), currency, coffees }
      }
    }
    return { amountCents: dollarsToCents(direct), currency, coffees }
  }

  const coffeePrice = pickNumber(data.support_coffee_price, data.coffee_price, data.subscription_coffee_price)
  if (coffeePrice !== null && coffees !== null) {
    return { amountCents: dollarsToCents(coffeePrice * coffees), currency, coffees }
  }
  if (coffeePrice !== null) {
    return { amountCents: dollarsToCents(coffeePrice), currency, coffees: coffees ?? 1 }
  }

  return { amountCents: 0, currency, coffees }
}

function kindFromEventType(eventType: string): BmcKind {
  if (eventType.startsWith('donation')) return 'donation'
  if (eventType.startsWith('membership')) return 'membership'
  if (eventType.startsWith('recurring_donation')) return 'recurring'
  if (eventType.startsWith('extra_purchase') || eventType.startsWith('commission') || eventType.startsWith('wishlist')) {
    return 'shop'
  }
  return 'other'
}

function isRefundEvent(eventType: string): boolean {
  return eventType.endsWith('.refunded') || eventType.endsWith('.cancelled')
}

function externalIdFromData(eventType: string, data: LooseRecord, eventId: string | number | null): string {
  const found = pickString(
    data.support_id,
    data.donation_id,
    data.id,
    data.subscription_id,
    data.membership_id,
    data.purchase_id,
    data.order_id,
    data.payment_id,
    data.transaction_id,
  )
  if (found) return `${eventType}:${found}`
  if (eventId != null) return `${eventType}:event:${eventId}`
  return `${eventType}:${id('bmc')}`
}

export async function verifyBmcSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha256=/, '')
  if (expected.length !== provided.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return mismatch === 0
}

export async function ingestBmcWebhook(env: Env, rawBody: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let payload: LooseRecord
  try {
    payload = asRecord(JSON.parse(rawBody))
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }

  // New envelope: { event_id, type, data, live_mode, created }
  // Legacy: { response: {...} } + x-bmc-event header handled by caller merging type
  const eventType = pickString(payload.type, payload.event_type, payload.event) || 'unknown'
  const body = Object.keys(asRecord(payload.data)).length
    ? asRecord(payload.data)
    : Object.keys(asRecord(payload.response)).length
      ? asRecord(payload.response)
      : payload

  const eventId = pickString(payload.event_id, payload.id)
  const liveMode = payload.live_mode === false || payload.live_mode === 0 ? 0 : 1
  const createdUnix = pickNumber(payload.created, body.support_created_on, body.created_on)
  let occurredAt = nowIso()
  if (typeof createdUnix === 'number' && createdUnix > 1_000_000_000) {
    occurredAt = new Date(createdUnix * 1000).toISOString()
  } else if (typeof pickString(body.support_created_on, body.subscription_created_on, body.created_on) === 'string') {
    const parsed = new Date(pickString(body.support_created_on, body.subscription_created_on, body.created_on)!)
    if (!Number.isNaN(parsed.getTime())) occurredAt = parsed.toISOString()
  }

  const { amountCents: rawAmount, currency, coffees } = extractAmountCents(body)
  const refund = isRefundEvent(eventType)
  const amountCents = refund ? -Math.abs(rawAmount) : Math.abs(rawAmount)
  const kind = kindFromEventType(eventType)
  const externalId = externalIdFromData(eventType, body, eventId)
  const entryId = id('bmc')

  const supporterName = pickString(
    body.supporter_name,
    body.payer_name,
    body.member_name,
    body.name,
    body.customer_name,
  )
  const supporterEmail = pickString(
    body.supporter_email,
    body.support_email,
    body.payer_email,
    body.email,
  )
  const message = pickString(body.support_note, body.message, body.note, body.supporter_feedback)
  const membershipLevel = pickString(
    body.membership_level_name,
    body.membership_level,
    body.tier_name,
    body.subscription_title,
  )

  let status = 'active'
  if (refund) status = 'refunded'
  if (eventType.endsWith('.cancelled')) status = 'cancelled'
  if (eventType.endsWith('.paused')) status = 'paused'

  await env.DB.prepare(
    `INSERT INTO bmc_entries
      (id, external_id, event_id, event_type, kind, status, supporter_name, supporter_email,
       message, amount_cents, currency, coffees, membership_level, live_mode, occurred_at, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_type, external_id) DO UPDATE SET
       status = excluded.status,
       amount_cents = excluded.amount_cents,
       supporter_name = COALESCE(excluded.supporter_name, bmc_entries.supporter_name),
       supporter_email = COALESCE(excluded.supporter_email, bmc_entries.supporter_email),
       message = COALESCE(excluded.message, bmc_entries.message),
       membership_level = COALESCE(excluded.membership_level, bmc_entries.membership_level),
       raw_json = excluded.raw_json`,
  )
    .bind(
      entryId,
      externalId,
      eventId,
      eventType,
      kind,
      status,
      supporterName,
      supporterEmail,
      message,
      amountCents,
      currency,
      coffees,
      membershipLevel,
      liveMode,
      occurredAt,
      rawBody.slice(0, 8000),
    )
    .run()

  return { ok: true, id: entryId }
}

export async function ensureOpeningBalance(env: Env, amountCents = 850): Promise<void> {
  const existing = await env.DB.prepare(
    `SELECT id FROM bmc_entries WHERE kind = 'opening' LIMIT 1`,
  ).first()
  if (existing) return

  const any = await env.DB.prepare(`SELECT id FROM bmc_entries LIMIT 1`).first()
  if (any) return

  await env.DB.prepare(
    `INSERT INTO bmc_entries
      (id, external_id, event_id, event_type, kind, status, supporter_name, amount_cents, currency, live_mode, occurred_at, message)
     VALUES (?, 'opening_balance', null, 'opening.balance', 'opening', 'active', 'Buy Me a Coffee', ?, 'usd', 1, ?, ?)`,
  )
    .bind(
      id('bmc'),
      amountCents,
      nowIso(),
      'Outstanding balance seeded from Buy Me a Coffee dashboard',
    )
    .run()
}

function formatMoney(cents: number, currency = 'usd'): string {
  const value = (cents / 100).toFixed(2)
  return `${currency.toUpperCase()} ${value}`
}

export async function getBmcOverview(env: Env) {
  await ensureOpeningBalance(env)

  const totalRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM bmc_entries`,
  ).first<{ total: number }>()

  const donationRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS count
     FROM bmc_entries WHERE kind IN ('donation', 'opening') AND amount_cents > 0`,
  ).first<{ total: number; count: number }>()

  const membershipRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS count
     FROM bmc_entries WHERE kind IN ('membership', 'recurring') AND amount_cents > 0`,
  ).first<{ total: number; count: number }>()

  const { results } = await env.DB.prepare(
    `SELECT * FROM bmc_entries ORDER BY occurred_at DESC LIMIT 50`,
  ).all<{
    id: string
    event_type: string
    kind: string
    status: string
    supporter_name: string | null
    supporter_email: string | null
    message: string | null
    amount_cents: number
    currency: string
    coffees: number | null
    membership_level: string | null
    live_mode: number
    occurred_at: string
  }>()

  const balanceCents = Number(totalRow?.total) || 0

  return {
    balance: {
      amountCents: balanceCents,
      formatted: formatMoney(balanceCents),
      label: 'Outstanding balance',
    },
    donations: {
      count: Number(donationRow?.count) || 0,
      amountCents: Number(donationRow?.total) || 0,
      formatted: formatMoney(Number(donationRow?.total) || 0),
    },
    memberships: {
      count: Number(membershipRow?.count) || 0,
      amountCents: Number(membershipRow?.total) || 0,
      formatted: formatMoney(Number(membershipRow?.total) || 0),
    },
    webhookUrl: 'https://blacnova-api.nic-58f.workers.dev/v1/webhooks/buymeacoffee',
    entries: (results || []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      kind: row.kind,
      status: row.status,
      supporterName: row.supporter_name || 'Anonymous',
      supporterEmail: row.supporter_email,
      message: row.message,
      amountCents: row.amount_cents,
      currency: row.currency,
      formatted: formatMoney(row.amount_cents, row.currency),
      coffees: row.coffees,
      membershipLevel: row.membership_level,
      liveMode: Boolean(row.live_mode),
      occurredAt: row.occurred_at,
    })),
  }
}

export async function syncBmcFromApi(env: Env): Promise<{ imported: number }> {
  if (!env.BMC_ACCESS_TOKEN) {
    throw new Error('BMC_ACCESS_TOKEN is not configured')
  }

  let imported = 0
  let page = 1
  for (;;) {
    const res = await fetch(
      `https://developers.buymeacoffee.com/api/v1/supporters?page=${page}`,
      { headers: { Authorization: `Bearer ${env.BMC_ACCESS_TOKEN}` } },
    )
    if (!res.ok) {
      throw new Error(`Buy Me a Coffee supporters API failed (${res.status})`)
    }
    const data = (await res.json()) as {
      data?: LooseRecord[]
      current_page?: number
      last_page?: number
    }
    const rows = data.data || []
    for (const row of rows) {
      const supportId = pickString(row.support_id)
      if (!supportId) continue
      if (pickString(row.is_refunded)) continue

      const { amountCents, currency, coffees } = extractAmountCents(row)
      const externalId = `donation.created:${supportId}`
      const occurred =
        pickString(row.support_created_on) ||
        nowIso()

      await env.DB.prepare(
        `INSERT INTO bmc_entries
          (id, external_id, event_id, event_type, kind, status, supporter_name, supporter_email,
           message, amount_cents, currency, coffees, live_mode, occurred_at, raw_json)
         VALUES (?, ?, ?, 'donation.created', 'donation', 'active', ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, external_id) DO UPDATE SET
           amount_cents = excluded.amount_cents,
           supporter_name = excluded.supporter_name,
           supporter_email = excluded.supporter_email,
           message = excluded.message`,
      )
        .bind(
          id('bmc'),
          externalId,
          supportId,
          pickString(row.supporter_name, row.payer_name) || 'Anonymous',
          pickString(row.support_email, row.payer_email),
          pickString(row.support_note),
          amountCents,
          currency,
          coffees,
          new Date(occurred).toISOString(),
          JSON.stringify(row).slice(0, 4000),
        )
        .run()
      imported += 1
    }

    if (!rows.length || (data.current_page || page) >= (data.last_page || page)) break
    page += 1
    if (page > 20) break
  }

  // Pull memberships
  page = 1
  for (;;) {
    const res = await fetch(
      `https://developers.buymeacoffee.com/api/v1/subscriptions?status=all&page=${page}`,
      { headers: { Authorization: `Bearer ${env.BMC_ACCESS_TOKEN}` } },
    )
    if (!res.ok) break
    const data = (await res.json()) as {
      data?: LooseRecord[]
      current_page?: number
      last_page?: number
    }
    const rows = data.data || []
    for (const row of rows) {
      const subId = pickString(row.subscription_id, row.id)
      if (!subId) continue
      const { amountCents, currency, coffees } = extractAmountCents(row)
      const statusRaw = (pickString(row.status) || 'active').toLowerCase()
      const eventType =
        statusRaw === 'cancelled' || statusRaw === 'inactive'
          ? 'membership.cancelled'
          : 'membership.started'
      const externalId = `${eventType}:${subId}`
      const occurred = pickString(row.subscription_created_on, row.created_on) || nowIso()

      await env.DB.prepare(
        `INSERT INTO bmc_entries
          (id, external_id, event_id, event_type, kind, status, supporter_name, supporter_email,
           message, amount_cents, currency, coffees, membership_level, live_mode, occurred_at, raw_json)
         VALUES (?, ?, ?, ?, 'membership', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, external_id) DO UPDATE SET
           status = excluded.status,
           amount_cents = excluded.amount_cents,
           membership_level = excluded.membership_level`,
      )
        .bind(
          id('bmc'),
          externalId,
          subId,
          eventType,
          statusRaw === 'cancelled' || statusRaw === 'inactive' ? 'cancelled' : 'active',
          pickString(row.payer_name, row.supporter_name) || 'Member',
          pickString(row.payer_email, row.supporter_email),
          null,
          statusRaw === 'cancelled' || statusRaw === 'inactive' ? 0 : amountCents,
          currency,
          coffees,
          pickString(row.subscription_title, row.membership_level_name),
          new Date(occurred).toISOString(),
          JSON.stringify(row).slice(0, 4000),
        )
        .run()
      imported += 1
    }
    if (!rows.length || (data.current_page || page) >= (data.last_page || page)) break
    page += 1
    if (page > 20) break
  }

  // Once real data exists, drop the seeded opening balance to avoid double-counting
  const live = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM bmc_entries WHERE kind != 'opening'`,
  ).first<{ total: number }>()
  if ((Number(live?.total) || 0) > 0) {
    await env.DB.prepare(`DELETE FROM bmc_entries WHERE kind = 'opening'`).run()
  }

  return { imported }
}
