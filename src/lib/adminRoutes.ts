import { hashPassword } from './auth'
import { DEFAULT_CLIENT_MODULES, isFinanceOwner, isPlatformUser, requireFinanceOwner, withBillingModule } from './admin'
import { assertPasswordPolicy } from './config'
import { createRetainerInvoice, loadWebsiteBilling, periodKey, restoreWebsiteBilling } from './billing'
import { error, id, json, nowIso, today } from './http'
import { createAndSendInvoice, deleteInvoiceRecord, listInvoices } from './invoices'
import { getBmcOverview, syncBmcFromApi } from './bmc'
import { clampString, isValidEmail } from './security'
import { revokeUserSessions } from './session'
import { getBillingOverview } from './stripe'
import type { Env, SessionUser } from './types'

const WEBSITE_STATUSES = new Set(['live', 'maintenance', 'offline'])

function parseModules(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? withBillingModule(parsed.map(String))
      : [...DEFAULT_CLIENT_MODULES]
  } catch {
    return [...DEFAULT_CLIENT_MODULES]
  }
}

async function seedWebsiteDefaults(env: Env, websiteId: string, name: string) {
  await env.DB.prepare(
    `INSERT INTO maintenance (website_id, enabled, title, message, expected_return)
     VALUES (?, 0, ?, ?, '')`,
  )
    .bind(
      websiteId,
      "We'll be right back",
      `${name} is temporarily offline for improvements. Please check back soon.`,
    )
    .run()

  const homeId = 'home'
  await env.DB.prepare(
    `INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (?, ?, 'Home', '/', 'published', ?)`,
  )
    .bind(homeId, websiteId, today())
    .run()

  await env.DB.prepare(
    `INSERT INTO content_blocks
      (id, website_id, page_id, page_name, section, label, type, value, published, sort_order)
     VALUES
      (?, ?, 'home', 'Home', 'Hero', 'Headline', 'heading', ?, 1, 1),
      (?, ?, 'home', 'Home', 'Hero', 'Supporting text', 'textarea', ?, 1, 2),
      (?, ?, 'home', 'Home', 'Services', 'Section title', 'heading', 'Services', 1, 3)`,
  )
    .bind(
      id('c'),
      websiteId,
      `Welcome to ${name}`,
      id('c'),
      websiteId,
      `Edit your homepage copy from the Content tab in the Blacnova client portal.`,
      id('c'),
      websiteId,
    )
    .run()

  await env.DB.prepare(
    `INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at, url)
     VALUES (?, ?, 'placeholder.png', 'image', '—', 'Home · Hero', ?, NULL)`,
  )
    .bind(id('m'), websiteId, nowIso())
    .run()
}

export async function handleAdmin(
  request: Request,
  env: Env,
  user: SessionUser,
  path: string,
  method: string,
): Promise<Response | null> {
  if (!path.startsWith('/v1/admin')) return null
  if (!isPlatformUser(user)) return error('Forbidden — platform admin only', 403)

  // --- Clients (websites) ---
  if (path === '/v1/admin/clients' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT w.*,
        (SELECT COUNT(*) FROM users u WHERE u.website_id = w.id) AS account_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.website_id = w.id AND s.status = 'new') AS new_submissions
       FROM websites w
       ORDER BY w.name COLLATE NOCASE`,
    ).all<{
      id: string
      name: string
      domain: string
      status: string
      modules: string
      github_repo: string | null
      created_at: string
      updated_at: string
      account_count: number
      new_submissions: number
      monthly_fee_cents?: number
      billing_email?: string | null
      billing_name?: string | null
      billing_enabled?: number
      billing_suspended?: number
      last_retainer_period?: string | null
    }>()

    return json({
      clients: (results || []).map((w) => ({
        id: w.id,
        name: w.name,
        domain: w.domain,
        status: w.status,
        modules: parseModules(w.modules),
        githubRepo: w.github_repo,
        accountCount: Number(w.account_count) || 0,
        newSubmissions: Number(w.new_submissions) || 0,
        monthlyFeeCents: Number(w.monthly_fee_cents) || 0,
        billingEmail: w.billing_email || null,
        billingName: w.billing_name || null,
        billingEnabled: Boolean(w.billing_enabled),
        billingSuspended: Boolean(w.billing_suspended),
        lastRetainerPeriod: w.last_retainer_period || null,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    })
  }

  if (path === '/v1/admin/clients' && method === 'POST') {
    const body = (await request.json()) as {
      name?: string
      domain?: string
      githubRepo?: string
      modules?: string[]
    }
    const name = clampString(body.name, 120)
    const domain = clampString(body.domain, 120).toLowerCase()
    if (!name || !domain) return error('Name and domain are required')

    const exists = await env.DB.prepare(`SELECT id FROM websites WHERE domain = ?`)
      .bind(domain)
      .first()
    if (exists) return error('A client with that domain already exists', 409)

    const websiteId = id('site')
    const modules = JSON.stringify(
      withBillingModule(
        Array.isArray(body.modules) && body.modules.length
          ? body.modules.map(String)
          : [...DEFAULT_CLIENT_MODULES],
      ),
    )
    await env.DB.prepare(
      `INSERT INTO websites (id, name, domain, status, modules, github_repo)
       VALUES (?, ?, ?, 'live', ?, ?)`,
    )
      .bind(websiteId, name, domain, modules, clampString(body.githubRepo, 200) || null)
      .run()
    await seedWebsiteDefaults(env, websiteId, name)

    return json({ id: websiteId, name, domain }, 201)
  }

  if (path.startsWith('/v1/admin/clients/') && method === 'PATCH') {
    const rest = path.slice('/v1/admin/clients/'.length)
    if (rest.endsWith('/restore-billing') && rest.split('/').length === 2) {
      const clientId = rest.split('/')[0]
      const ok = await restoreWebsiteBilling(env, clientId)
      if (!ok) return error('Client not found', 404)
      return json({ ok: true })
    }

    if (rest.endsWith('/bill-now') && rest.split('/').length === 2) {
      const clientId = rest.split('/')[0]
      const site = await loadWebsiteBilling(env, clientId)
      if (!site) return error('Client not found', 404)
      const result = await createRetainerInvoice(env, site, periodKey())
      if ('error' in result) return error(result.error, 400)
      if ('skipped' in result) return json({ ok: true, skipped: result.skipped })
      return json({ ok: true, invoiceId: result.invoiceId })
    }

    const clientId = rest
    const body = (await request.json()) as {
      name?: string
      domain?: string
      status?: string
      githubRepo?: string | null
      modules?: string[]
      monthlyFeeCents?: number
      billingEmail?: string | null
      billingName?: string | null
      billingEnabled?: boolean
    }
    const existing = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
      .bind(clientId)
      .first()
    if (!existing) return error('Client not found', 404)

    if (body.domain) {
      const clash = await env.DB.prepare(
        `SELECT id FROM websites WHERE domain = ? AND id != ?`,
      )
        .bind(clampString(body.domain, 120).toLowerCase(), clientId)
        .first()
      if (clash) return error('Domain already in use', 409)
    }

    if (body.status !== undefined && !WEBSITE_STATUSES.has(body.status)) {
      return error('Status must be live, maintenance, or offline')
    }

    if (body.monthlyFeeCents !== undefined) {
      const cents = Math.round(Number(body.monthlyFeeCents))
      if (!Number.isFinite(cents) || cents < 0) return error('monthlyFeeCents must be >= 0')
    }

    if (body.billingEnabled) {
      const fee =
        body.monthlyFeeCents !== undefined
          ? Math.round(Number(body.monthlyFeeCents))
          : (
              await env.DB.prepare(
                `SELECT COALESCE(monthly_fee_cents, 0) AS monthly_fee_cents FROM websites WHERE id = ?`,
              )
                .bind(clientId)
                .first<{ monthly_fee_cents: number }>()
            )?.monthly_fee_cents ?? 0
      if (fee < 50) {
        return error('Monthly fee must be at least $0.50 when billing is enabled')
      }
    }

    if (body.billingEmail) {
      const email = clampString(body.billingEmail, 254).toLowerCase()
      if (!isValidEmail(email)) return error('billingEmail is invalid')
    }

    const modulesJson = body.modules
      ? JSON.stringify(withBillingModule(body.modules.map(String)))
      : null

    await env.DB.prepare(
      `UPDATE websites SET
        name = COALESCE(?, name),
        domain = COALESCE(?, domain),
        status = COALESCE(?, status),
        github_repo = CASE WHEN ? = 1 THEN ? ELSE github_repo END,
        modules = COALESCE(?, modules),
        monthly_fee_cents = COALESCE(?, monthly_fee_cents),
        billing_email = CASE WHEN ? = 1 THEN ? ELSE billing_email END,
        billing_name = CASE WHEN ? = 1 THEN ? ELSE billing_name END,
        billing_enabled = COALESCE(?, billing_enabled),
        updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        body.name !== undefined ? clampString(body.name, 120) : null,
        body.domain !== undefined ? clampString(body.domain, 120).toLowerCase() : null,
        body.status !== undefined ? body.status : null,
        body.githubRepo !== undefined ? 1 : 0,
        body.githubRepo !== undefined ? clampString(String(body.githubRepo || ''), 200) || null : null,
        modulesJson,
        body.monthlyFeeCents !== undefined ? Math.round(Number(body.monthlyFeeCents)) : null,
        body.billingEmail !== undefined ? 1 : 0,
        body.billingEmail !== undefined
          ? clampString(String(body.billingEmail || ''), 254).toLowerCase() || null
          : null,
        body.billingName !== undefined ? 1 : 0,
        body.billingName !== undefined ? clampString(String(body.billingName || ''), 120) || null : null,
        body.billingEnabled !== undefined ? (body.billingEnabled ? 1 : 0) : null,
        nowIso(),
        clientId,
      )
      .run()

    return json({ ok: true })
  }

  if (path.startsWith('/v1/admin/clients/') && method === 'DELETE') {
    const clientId = path.slice('/v1/admin/clients/'.length)
    if (clientId === user.websiteId) {
      return error('Cannot delete the website attached to your own account', 400)
    }
    const existing = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
      .bind(clientId)
      .first()
    if (!existing) return error('Client not found', 404)

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM users WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM content_blocks WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM pages WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM media_items WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM maintenance WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM submissions WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM analytics_points WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM support_tickets WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM notifications WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM invoices WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM recurring_invoices WHERE website_id = ?`).bind(clientId),
      env.DB.prepare(`DELETE FROM websites WHERE id = ?`).bind(clientId),
    ])
    return json({ ok: true })
  }

  // --- Accounts (dashboard users) ---
  if (path === '/v1/admin/accounts' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.website_id, u.active, u.created_at, u.updated_at,
              w.name AS website_name, w.domain AS website_domain
       FROM users u
       LEFT JOIN websites w ON w.id = u.website_id
       ORDER BY u.created_at DESC`,
    ).all<{
      id: string
      email: string
      name: string
      role: string
      website_id: string
      active: number
      created_at: string
      updated_at: string
      website_name: string | null
      website_domain: string | null
    }>()

    return json({
      accounts: (results || []).map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        websiteId: u.website_id,
        websiteName: u.website_name,
        websiteDomain: u.website_domain,
        active: Boolean(u.active ?? 1),
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })),
    })
  }

  if (path === '/v1/admin/accounts' && method === 'POST') {
    const body = (await request.json()) as {
      email?: string
      name?: string
      password?: string
      websiteId?: string
      role?: string
    }
    const email = clampString(body.email, 254).toLowerCase()
    const name = clampString(body.name, 120)
    const password = String(body.password || '')
    const websiteId = clampString(body.websiteId, 64)
    const role =
      body.role === 'platform'
        ? isFinanceOwner(user, env)
          ? 'platform'
          : 'manager'
        : 'manager'

    if (!email || !name || !password || !websiteId) {
      return error('email, name, password, and websiteId are required')
    }
    if (!isValidEmail(email)) return error('A valid email is required')
    const passwordError = assertPasswordPolicy(password)
    if (passwordError) return error(passwordError)
    if (body.role === 'platform' && !isFinanceOwner(user, env)) {
      return error('Forbidden', 403)
    }

    const website = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
      .bind(websiteId)
      .first()
    if (!website) return error('Website not found', 404)

    const exists = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first()
    if (exists) return error('An account with that email already exists', 409)

    const userId = id('user')
    const passwordHash = await hashPassword(password)
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, role, password_hash, website_id, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    )
      .bind(userId, email, name, role, passwordHash, websiteId)
      .run()

    return json({ id: userId, email, name, role, websiteId }, 201)
  }

  if (path.match(/^\/v1\/admin\/accounts\/[^/]+\/reset-password$/) && method === 'POST') {
    const accountId = path.split('/')[4]
    const body = (await request.json()) as { password?: string }
    const password = String(body.password || '')
    const passwordError = assertPasswordPolicy(password)
    if (passwordError) return error(passwordError)

    const existing = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(accountId)
      .first()
    if (!existing) return error('Account not found', 404)

    const passwordHash = await hashPassword(password)
    await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .bind(passwordHash, nowIso(), accountId)
      .run()
    await revokeUserSessions(env, accountId)
    return json({ ok: true })
  }

  if (path.startsWith('/v1/admin/accounts/') && method === 'PATCH') {
    const accountId = path.slice('/v1/admin/accounts/'.length)
    if (accountId.includes('/')) return error('Not found', 404)
    const body = (await request.json()) as {
      name?: string
      role?: string
      websiteId?: string
      active?: boolean
    }
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(accountId)
      .first()
    if (!existing) return error('Account not found', 404)

    if (accountId === user.id && body.active === false) {
      return error('Cannot deactivate your own account', 400)
    }
    if (accountId === user.id && body.role === 'manager') {
      return error('Cannot remove platform access from your own account', 400)
    }

    if (body.websiteId) {
      const website = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
        .bind(body.websiteId)
        .first()
      if (!website) return error('Website not found', 404)
    }

    await env.DB.prepare(
      `UPDATE users SET
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        website_id = COALESCE(?, website_id),
        active = COALESCE(?, active),
        updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        body.name !== undefined ? clampString(body.name, 120) : null,
        body.role === 'platform' || body.role === 'manager' ? body.role : null,
        body.websiteId ?? null,
        body.active === undefined ? null : body.active ? 1 : 0,
        nowIso(),
        accountId,
      )
      .run()

    if (body.active === false) {
      await revokeUserSessions(env, accountId)
    }

    return json({ ok: true })
  }

  if (path.startsWith('/v1/admin/accounts/') && method === 'DELETE') {
    const accountId = path.slice('/v1/admin/accounts/'.length)
    if (accountId === user.id) return error('Cannot delete your own account', 400)
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(accountId)
      .first()
    if (!existing) return error('Account not found', 404)
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(accountId).run()
    await revokeUserSessions(env, accountId)
    return json({ ok: true })
  }

  // --- Billing (Stripe) — Nic only ---
  if (path === '/v1/admin/billing' && method === 'GET') {
    const denied = requireFinanceOwner(user, env)
    if (denied) return denied
    try {
      const billing = await getBillingOverview(env)
      return json(billing)
    } catch (err) {
      console.error(JSON.stringify({ err: 'billing_overview', detail: String(err) }))
      return error('Stripe billing unavailable', 502)
    }
  }

  // --- Buy Me a Coffee — finance owner only ---
  if (path === '/v1/admin/bmc' && method === 'GET') {
    const denied = requireFinanceOwner(user, env)
    if (denied) return denied
    return json(await getBmcOverview(env))
  }

  if (path === '/v1/admin/bmc/sync' && method === 'POST') {
    const denied = requireFinanceOwner(user, env)
    if (denied) return denied
    try {
      const result = await syncBmcFromApi(env)
      const overview = await getBmcOverview(env)
      return json({ ...result, ...overview })
    } catch (err) {
      console.error(JSON.stringify({ err: 'bmc_sync', detail: String(err) }))
      return error('BMC sync failed', 502)
    }
  }

  // --- Invoices (Stripe + Brevo) ---
  if (path === '/v1/admin/invoices' && method === 'GET') {
    const invoices = await listInvoices(env)
    return json({ invoices })
  }

  if (path === '/v1/admin/invoices' && method === 'POST') {
    const body = (await request.json()) as {
      email?: string
      name?: string
      amount?: number | string
      description?: string
      daysUntilDue?: number
      websiteId?: string
      sendNow?: boolean
    }
    const email = clampString(body.email, 254).toLowerCase()
    const name = clampString(body.name, 120)
    const description = clampString(body.description, 500)
    const amountDollars = Number(body.amount)
    const daysUntilDue = body.daysUntilDue === undefined ? 14 : Number(body.daysUntilDue)

    if (!email || !name || !description) {
      return error('email, name, and description are required')
    }
    if (!isValidEmail(email)) return error('A valid email is required')
    if (!Number.isFinite(amountDollars) || amountDollars < 0.5) {
      return error('Amount must be at least 0.50')
    }
    if (!Number.isFinite(daysUntilDue) || daysUntilDue < 1 || daysUntilDue > 90) {
      return error('daysUntilDue must be between 1 and 90')
    }

    let websiteId: string | null = body.websiteId ? clampString(body.websiteId, 64) : null
    if (websiteId) {
      const website = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
        .bind(websiteId)
        .first()
      if (!website) return error('Website not found', 404)
    }

    try {
      const invoice = await createAndSendInvoice(env, {
        customerEmail: email,
        customerName: name,
        amountCents: Math.round(amountDollars * 100),
        description,
        daysUntilDue,
        websiteId,
      })
      return json({ invoice }, 201)
    } catch (err) {
      return error('Could not send invoice', 502)
    }
  }

  if (path.startsWith('/v1/admin/invoices/') && method === 'DELETE') {
    const invoiceId = path.slice('/v1/admin/invoices/'.length)
    if (!invoiceId || invoiceId.includes('/')) return error('Not found', 404)
    const removed = await deleteInvoiceRecord(env, invoiceId)
    if (!removed) return error('Invoice not found', 404)
    return json({ ok: true })
  }

  if (path === '/v1/admin/recurring-invoices' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT r.*, w.name AS website_name, w.domain AS website_domain
       FROM recurring_invoices r
       LEFT JOIN websites w ON w.id = r.website_id
       ORDER BY r.created_at DESC`,
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
      active: number
      last_sent_on: string | null
      created_at: string
      updated_at: string
      website_name: string | null
      website_domain: string | null
    }>()

    return json({
      recurring: (results || []).map((r) => ({
        id: r.id,
        websiteId: r.website_id,
        websiteName: r.website_name,
        websiteDomain: r.website_domain,
        customerEmail: r.customer_email,
        customerName: r.customer_name,
        amountCents: r.amount_cents,
        currency: r.currency,
        formatted: `USD ${(r.amount_cents / 100).toFixed(2)}`,
        description: r.description,
        dayOfMonth: r.day_of_month,
        daysUntilDue: r.days_until_due,
        active: Boolean(r.active),
        lastSentOn: r.last_sent_on,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    })
  }

  if (path === '/v1/admin/recurring-invoices' && method === 'POST') {
    const body = (await request.json()) as {
      email?: string
      name?: string
      amount?: number | string
      description?: string
      dayOfMonth?: number
      daysUntilDue?: number
      websiteId?: string
      active?: boolean
    }
    const email = clampString(body.email, 254).toLowerCase()
    const name = clampString(body.name, 120)
    const description = clampString(body.description, 500)
    const amountDollars = Number(body.amount)
    const dayOfMonth = Number(body.dayOfMonth)
    const daysUntilDue = body.daysUntilDue === undefined ? 14 : Number(body.daysUntilDue)

    if (!email || !name || !description) {
      return error('email, name, and description are required')
    }
    if (!isValidEmail(email)) return error('A valid email is required')
    if (!Number.isFinite(amountDollars) || amountDollars < 0.5) {
      return error('Amount must be at least 0.50')
    }
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
      return error('dayOfMonth must be between 1 and 28')
    }
    if (!Number.isFinite(daysUntilDue) || daysUntilDue < 1 || daysUntilDue > 90) {
      return error('daysUntilDue must be between 1 and 90')
    }

    let websiteId: string | null = body.websiteId ? clampString(body.websiteId, 64) : null
    if (websiteId) {
      const website = await env.DB.prepare(`SELECT id FROM websites WHERE id = ?`)
        .bind(websiteId)
        .first()
      if (!website) return error('Website not found', 404)
    }

    const recurringId = id('recur')
    await env.DB.prepare(
      `INSERT INTO recurring_invoices
        (id, website_id, customer_email, customer_name, amount_cents, currency, description,
         day_of_month, days_until_due, active)
       VALUES (?, ?, ?, ?, ?, 'usd', ?, ?, ?, ?)`,
    )
      .bind(
        recurringId,
        websiteId,
        email,
        name,
        Math.round(amountDollars * 100),
        description,
        dayOfMonth,
        daysUntilDue,
        body.active === false ? 0 : 1,
      )
      .run()

    return json(
      {
        id: recurringId,
        email,
        name,
        amount: amountDollars,
        dayOfMonth,
        websiteId,
      },
      201,
    )
  }

  if (path.startsWith('/v1/admin/recurring-invoices/') && method === 'PATCH') {
    const recurringId = path.slice('/v1/admin/recurring-invoices/'.length)
    if (recurringId.includes('/')) return error('Not found', 404)
    const body = (await request.json()) as {
      active?: boolean
      amount?: number | string
      description?: string
      dayOfMonth?: number
      daysUntilDue?: number
      name?: string
      email?: string
      websiteId?: string | null
    }

    const existing = await env.DB.prepare(`SELECT id FROM recurring_invoices WHERE id = ?`)
      .bind(recurringId)
      .first()
    if (!existing) return error('Recurring invoice not found', 404)

    if (body.dayOfMonth !== undefined) {
      const day = Number(body.dayOfMonth)
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        return error('dayOfMonth must be between 1 and 28')
      }
    }
    if (body.email !== undefined && !isValidEmail(clampString(body.email, 254))) {
      return error('A valid email is required')
    }
    if (body.amount !== undefined) {
      const amountDollars = Number(body.amount)
      if (!Number.isFinite(amountDollars) || amountDollars < 0.5) {
        return error('Amount must be at least 0.50')
      }
    }

    await env.DB.prepare(
      `UPDATE recurring_invoices SET
        active = COALESCE(?, active),
        amount_cents = COALESCE(?, amount_cents),
        description = COALESCE(?, description),
        day_of_month = COALESCE(?, day_of_month),
        days_until_due = COALESCE(?, days_until_due),
        customer_name = COALESCE(?, customer_name),
        customer_email = COALESCE(?, customer_email),
        website_id = CASE WHEN ? = 1 THEN ? ELSE website_id END,
        updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        body.active === undefined ? null : body.active ? 1 : 0,
        body.amount !== undefined ? Math.round(Number(body.amount) * 100) : null,
        body.description !== undefined ? clampString(body.description, 500) : null,
        body.dayOfMonth !== undefined ? Number(body.dayOfMonth) : null,
        body.daysUntilDue !== undefined ? Number(body.daysUntilDue) : null,
        body.name !== undefined ? clampString(body.name, 120) : null,
        body.email !== undefined ? clampString(body.email, 254).toLowerCase() : null,
        body.websiteId !== undefined ? 1 : 0,
        body.websiteId !== undefined ? body.websiteId || null : null,
        nowIso(),
        recurringId,
      )
      .run()

    return json({ ok: true })
  }

  if (path.match(/^\/v1\/admin\/recurring-invoices\/[^/]+\/run$/) && method === 'POST') {
    const recurringId = path.split('/')[4]
    const row = await env.DB.prepare(`SELECT * FROM recurring_invoices WHERE id = ?`)
      .bind(recurringId)
      .first<{
        id: string
        website_id: string | null
        customer_email: string
        customer_name: string
        amount_cents: number
        currency: string
        description: string
        days_until_due: number
      }>()
    if (!row) return error('Recurring invoice not found', 404)

    try {
      const invoice = await createAndSendInvoice(env, {
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        amountCents: row.amount_cents,
        currency: row.currency,
        description: row.description,
        daysUntilDue: row.days_until_due,
        websiteId: row.website_id,
        recurringId: row.id,
      })
      await env.DB.prepare(
        `UPDATE recurring_invoices SET last_sent_on = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(today(), nowIso(), recurringId)
        .run()
      return json({ invoice })
    } catch (err) {
      return error('Could not send invoice', 502)
    }
  }

  if (path.startsWith('/v1/admin/recurring-invoices/') && method === 'DELETE') {
    const recurringId = path.slice('/v1/admin/recurring-invoices/'.length)
    if (recurringId.includes('/')) return error('Not found', 404)
    const existing = await env.DB.prepare(`SELECT id FROM recurring_invoices WHERE id = ?`)
      .bind(recurringId)
      .first()
    if (!existing) return error('Recurring invoice not found', 404)
    await env.DB.prepare(`DELETE FROM recurring_invoices WHERE id = ?`).bind(recurringId).run()
    return json({ ok: true })
  }

  // --- Dashboard support tickets (all client portals) ---
  if (path === '/v1/admin/support' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.topic, t.message, t.status, t.notes, t.created_at,
              t.user_id, t.website_id,
              u.name AS user_name, u.email AS user_email,
              w.name AS website_name, w.domain AS website_domain
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN websites w ON w.id = t.website_id
       ORDER BY t.created_at DESC`,
    ).all<{
      id: string
      topic: string
      message: string
      status: string | null
      notes: string | null
      created_at: string
      user_id: string
      website_id: string
      user_name: string | null
      user_email: string | null
      website_name: string | null
      website_domain: string | null
    }>()

    return json({
      tickets: (results || []).map((t) => ({
        id: t.id,
        topic: t.topic,
        message: t.message,
        status: t.status || 'new',
        notes: t.notes || '',
        createdAt: t.created_at,
        userId: t.user_id,
        userName: t.user_name || 'Unknown',
        userEmail: t.user_email || '',
        websiteId: t.website_id,
        websiteName: t.website_name || '—',
        websiteDomain: t.website_domain || '',
      })),
    })
  }

  if (path.startsWith('/v1/admin/support/') && method === 'PATCH') {
    const ticketId = path.slice('/v1/admin/support/'.length)
    if (!ticketId || ticketId.includes('/')) return error('Not found', 404)
    const body = (await request.json()) as { status?: string; notes?: string }
    const allowed = new Set(['new', 'read', 'in_progress', 'resolved', 'archived'])
    if (body.status !== undefined && !allowed.has(body.status)) {
      return error('Invalid status')
    }
    const existing = await env.DB.prepare(`SELECT id FROM support_tickets WHERE id = ?`)
      .bind(ticketId)
      .first()
    if (!existing) return error('Ticket not found', 404)

    await env.DB.prepare(
      `UPDATE support_tickets SET
        status = COALESCE(?, status),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
    )
      .bind(
        body.status !== undefined ? body.status : null,
        body.notes !== undefined ? clampString(body.notes, 4000) : null,
        ticketId,
      )
      .run()

    return json({ ok: true })
  }

  if (path.startsWith('/v1/admin/support/') && method === 'DELETE') {
    const ticketId = path.slice('/v1/admin/support/'.length)
    if (!ticketId || ticketId.includes('/')) return error('Not found', 404)
    const existing = await env.DB.prepare(`SELECT id FROM support_tickets WHERE id = ?`)
      .bind(ticketId)
      .first()
    if (!existing) return error('Ticket not found', 404)
    await env.DB.prepare(`DELETE FROM support_tickets WHERE id = ?`).bind(ticketId).run()
    return json({ ok: true })
  }

  return error('Not found', 404)
}
