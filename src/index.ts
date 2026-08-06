import { hashPassword, verifyPassword } from './lib/auth'
import { getAnalyticsSeries, recordPageview, seriesDeltas } from './lib/analytics'
import {
  getUserProfile,
  getWebsite,
  mapContent,
  mapMedia,
  mapPage,
  mapSubmission,
  mediaUrl,
} from './lib/data'
import { GitHubError } from './lib/github'
import { corsHeaders, error, formatBytes, id, json, nowIso, today } from './lib/http'
import { publishMediaToGitHub, publishWebsiteContent } from './lib/publish'
import { clampString, clientIp, hasBrowserOrigin, isAllowedFormOrigin, isDisposableEmail, isValidEmail, rateLimit, submissionLooksLikeSpam } from './lib/security'
import { createSession, destroySession, getSessionUser, revokeUserSessions } from './lib/session'
import { handleAdmin } from './lib/adminRoutes'
import { ingestBmcWebhook, verifyBmcSignature } from './lib/bmc'
import { sendBrevoEmail, supportTicketEmailContent } from './lib/brevo'
import {
  assertPasswordPolicy,
  DUMMY_PASSWORD_HASH,
  supportEmail,
} from './lib/config'
import {
  enforceNonpaymentSuspensions,
  getClientBillingSummary,
  processMonthlyRetainers,
} from './lib/billing'
import { listNotifications, markNotificationsRead } from './lib/notifications'
import { listInvoicesForWebsite, processDueRecurringInvoices } from './lib/invoices'
import { handleStripeWebhook } from './lib/stripeWebhook'
import type { Env } from './lib/types'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      const response = await handle(request, env)
      const headers = new Headers(response.headers)
      for (const [k, v] of Object.entries(cors)) headers.set(k, v)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (err) {
      console.error(JSON.stringify({ err: String(err), stack: err instanceof Error ? err.stack : undefined }))
      if (err instanceof GitHubError) {
        console.error(JSON.stringify({ err: 'github', status: err.status, detail: err.message }))
        return error('Upstream publish failed', err.status >= 500 ? 502 : 400, cors)
      }
      return error('Internal server error', 500, cors)
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const recurring = await processDueRecurringInvoices(env)
          console.log(JSON.stringify({ cron: 'recurring_invoices', ...recurring }))
        } catch (err) {
          console.error(JSON.stringify({ cron: 'recurring_invoices', err: String(err) }))
        }

        try {
          const retainers = await processMonthlyRetainers(env)
          console.log(JSON.stringify({ cron: 'monthly_retainers', ...retainers }))
        } catch (err) {
          console.error(JSON.stringify({ cron: 'monthly_retainers', err: String(err) }))
        }

        try {
          const dunning = await enforceNonpaymentSuspensions(env)
          console.log(JSON.stringify({ cron: 'billing_dunning', ...dunning }))
        } catch (err) {
          console.error(JSON.stringify({ cron: 'billing_dunning', err: String(err) }))
        }
      })(),
    )
  },
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method

  if (path === '/' && method === 'GET') {
    return json({ ok: true })
  }

  if (path === '/v1/public/meta' && method === 'GET') {
    return json({ supportEmail: supportEmail(env) || null })
  }

  // --- Public ---
  if (path.startsWith('/v1/public/') && method === 'GET') {
    return publicRoutes(request, env, path)
  }

  if (path === '/v1/public/submissions' && method === 'POST') {
    return createPublicSubmission(request, env)
  }

  if (path === '/v1/public/analytics/collect' && method === 'POST') {
    return collectAnalytics(request, env)
  }

  if (path === '/v1/webhooks/buymeacoffee' && method === 'POST') {
    return handleBmcWebhook(request, env)
  }

  if (path === '/v1/webhooks/stripe' && method === 'POST') {
    return handleStripeWebhook(request, env)
  }

  if (path.startsWith('/v1/media/') && path.endsWith('/file') && method === 'GET') {
    return serveMediaFile(env, path)
  }

  // --- Auth ---
  if (path === '/v1/auth/login' && method === 'POST') {
    return login(request, env)
  }

  if (path === '/v1/auth/logout' && method === 'POST') {
    return logout(request, env)
  }

  const auth = await getSessionUser(env, request)
  if (!auth) return error('Unauthorized', 401)

  const { user, token } = auth
  const websiteId = user.websiteId

  const adminResponse = await handleAdmin(request, env, user, path, method)
  if (adminResponse) return adminResponse

  if (path === '/v1/auth/me' && method === 'GET') {
    return json(await getUserProfile(env, user))
  }

  if (path === '/v1/auth/password' && method === 'POST') {
    return changePassword(request, env, user.id)
  }

  if (path === '/v1/website' && method === 'GET') {
    const website = await getWebsite(env, websiteId)
    if (!website) return error('Website not found', 404)
    return json({ website })
  }

  if (path === '/v1/content' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM content_blocks WHERE website_id = ? ORDER BY sort_order, page_name, section, label`,
    )
      .bind(websiteId)
      .all()
    return json({ content: (results || []).map((r) => mapContent(r as never)) })
  }

  if (path.startsWith('/v1/content/') && method === 'PATCH') {
    const blockId = path.slice('/v1/content/'.length)
    const body = (await request.json()) as { value?: string; published?: boolean }
    const existing = await env.DB.prepare(
      `SELECT id FROM content_blocks WHERE id = ? AND website_id = ?`,
    )
      .bind(blockId, websiteId)
      .first()
    if (!existing) return error('Content block not found', 404)

    if (body.value !== undefined) {
      await env.DB.prepare(
        `UPDATE content_blocks SET value = ?, updated_at = ? WHERE id = ? AND website_id = ?`,
      )
        .bind(body.value, nowIso(), blockId, websiteId)
        .run()
    }
    if (body.published !== undefined) {
      await env.DB.prepare(
        `UPDATE content_blocks SET published = ?, updated_at = ? WHERE id = ? AND website_id = ?`,
      )
        .bind(body.published ? 1 : 0, nowIso(), blockId, websiteId)
        .run()
    }

    const row = await env.DB.prepare(`SELECT * FROM content_blocks WHERE id = ?`)
      .bind(blockId)
      .first()
    return json({ content: mapContent(row as never) })
  }

  if (path === '/v1/pages' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM pages WHERE website_id = ? ORDER BY title`,
    )
      .bind(websiteId)
      .all()
    return json({ pages: (results || []).map((r) => mapPage(r as never)) })
  }

  if (path.startsWith('/v1/pages/') && method === 'PATCH') {
    const pageId = path.slice('/v1/pages/'.length)
    const body = (await request.json()) as { status?: string }
    if (!body.status) return error('status is required')
    const result = await env.DB.prepare(
      `UPDATE pages SET status = ?, updated_at = ? WHERE id = ? AND website_id = ?`,
    )
      .bind(body.status, today(), pageId, websiteId)
      .run()
    if (!result.meta.changes) return error('Page not found', 404)
    const row = await env.DB.prepare(`SELECT * FROM pages WHERE id = ?`).bind(pageId).first()
    return json({ page: mapPage(row as never) })
  }

  if (path === '/v1/maintenance' && method === 'GET') {
    const row = await env.DB.prepare(`SELECT * FROM maintenance WHERE website_id = ?`)
      .bind(websiteId)
      .first<{
        enabled: number
        title: string
        message: string
        expected_return: string
      }>()
    if (!row) return error('Maintenance config not found', 404)
    return json({
      maintenance: {
        enabled: Boolean(row.enabled),
        title: row.title,
        message: row.message,
        expectedReturn: row.expected_return,
      },
    })
  }

  if (path === '/v1/maintenance' && method === 'PUT') {
    const body = (await request.json()) as {
      enabled?: boolean
      title?: string
      message?: string
      expectedReturn?: string
    }
    const current = await env.DB.prepare(`SELECT * FROM maintenance WHERE website_id = ?`)
      .bind(websiteId)
      .first<{
        enabled: number
        title: string
        message: string
        expected_return: string
      }>()
    if (!current) return error('Maintenance config not found', 404)

    const enabled = body.enabled ?? Boolean(current.enabled)
    const title = clampString(body.title ?? current.title, 120)
    const message = clampString(body.message ?? current.message, 800)
    const expectedReturn = clampString(body.expectedReturn ?? current.expected_return, 40)

    if (!title || !message) return error('Title and message are required')

    await env.DB.prepare(
      `UPDATE maintenance SET enabled = ?, title = ?, message = ?, expected_return = ?, updated_at = ? WHERE website_id = ?`,
    )
      .bind(enabled ? 1 : 0, title, message, expectedReturn, nowIso(), websiteId)
      .run()

    await env.DB.prepare(`UPDATE websites SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(enabled ? 'maintenance' : 'live', nowIso(), websiteId)
      .run()

    // Mirror to GitHub so static Pages can also read a fallback flag
    if (env.GITHUB_TOKEN) {
      try {
        const { mirrorMaintenanceJson } = await import('./lib/maintenanceMirror')
        await mirrorMaintenanceJson(env, {
          enabled,
          title,
          message,
          expectedReturn,
          reason: `dashboard ${user.email}`,
        })
      } catch (err) {
        console.error('maintenance github mirror failed', String(err))
      }
    }

    return json({
      maintenance: { enabled, title, message, expectedReturn },
    })
  }

  if (path === '/v1/submissions' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM submissions WHERE website_id = ? ORDER BY created_at DESC`,
    )
      .bind(websiteId)
      .all()
    return json({ submissions: (results || []).map((r) => mapSubmission(r as never)) })
  }

  if (path === '/v1/submissions/mark-read' && method === 'POST') {
    await env.DB.prepare(
      `UPDATE submissions SET status = 'read' WHERE website_id = ? AND status = 'new'`,
    )
      .bind(websiteId)
      .run()
    return json({ ok: true })
  }

  if (path.startsWith('/v1/submissions/') && method === 'PATCH') {
    const submissionId = path.slice('/v1/submissions/'.length)
    const body = (await request.json()) as { status?: string; notes?: string }
    const existing = await env.DB.prepare(
      `SELECT id FROM submissions WHERE id = ? AND website_id = ?`,
    )
      .bind(submissionId, websiteId)
      .first()
    if (!existing) return error('Submission not found', 404)

    if (body.status !== undefined) {
      await env.DB.prepare(`UPDATE submissions SET status = ? WHERE id = ? AND website_id = ?`)
        .bind(body.status, submissionId, websiteId)
        .run()
    }
    if (body.notes !== undefined) {
      await env.DB.prepare(`UPDATE submissions SET notes = ? WHERE id = ? AND website_id = ?`)
        .bind(body.notes, submissionId, websiteId)
        .run()
    }
    const row = await env.DB.prepare(`SELECT * FROM submissions WHERE id = ?`)
      .bind(submissionId)
      .first()
    return json({ submission: mapSubmission(row as never) })
  }

  if (path.startsWith('/v1/submissions/') && method === 'DELETE') {
    const submissionId = path.slice('/v1/submissions/'.length)
    if (!submissionId || submissionId.includes('/')) return error('Not found', 404)
    const existing = await env.DB.prepare(
      `SELECT id FROM submissions WHERE id = ? AND website_id = ?`,
    )
      .bind(submissionId, websiteId)
      .first()
    if (!existing) return error('Submission not found', 404)
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ? AND website_id = ?`)
      .bind(submissionId, websiteId)
      .run()
    return json({ ok: true })
  }

  if (path === '/v1/analytics' && method === 'GET') {
    const analytics = await getAnalyticsSeries(env, websiteId)
    return json({
      analytics,
      deltas: seriesDeltas(analytics),
      source: 'cloudflare-workers',
    })
  }

  if (path === '/v1/media' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM media_items WHERE website_id = ? ORDER BY updated_at DESC`,
    )
      .bind(websiteId)
      .all()
    return json({
      media: (results || []).map((r) => mapMedia(r as never, mediaUrl(request, (r as { id: string }).id))),
    })
  }

  if (path === '/v1/media' && method === 'POST') {
    return uploadMedia(request, env, websiteId, user.email)
  }

  if (path.startsWith('/v1/media/') && method === 'PUT') {
    const mediaId = path.slice('/v1/media/'.length)
    return replaceMedia(request, env, websiteId, mediaId, user.email)
  }

  if (path.startsWith('/v1/media/') && method === 'DELETE') {
    const mediaId = path.slice('/v1/media/'.length)
    const existing = await env.DB.prepare(
      `SELECT id FROM media_items WHERE id = ? AND website_id = ?`,
    )
      .bind(mediaId, websiteId)
      .first()
    if (!existing) return error('Media not found', 404)
    await env.DB.prepare(`DELETE FROM media_items WHERE id = ? AND website_id = ?`)
      .bind(mediaId, websiteId)
      .run()
    await env.MEDIA.delete(mediaId)
    return json({ ok: true })
  }

  if (path === '/v1/preferences' && method === 'PUT') {
    const body = (await request.json()) as {
      submissions?: boolean
      maintenance?: boolean
    }
    await env.DB.prepare(
      `UPDATE users SET
        notify_submissions = COALESCE(?, notify_submissions),
        notify_maintenance = COALESCE(?, notify_maintenance),
        updated_at = ?
      WHERE id = ?`,
    )
      .bind(
        body.submissions === undefined ? null : body.submissions ? 1 : 0,
        body.maintenance === undefined ? null : body.maintenance ? 1 : 0,
        nowIso(),
        user.id,
      )
      .run()
    return json(await getUserProfile(env, user))
  }

  if (path === '/v1/support' && method === 'POST') {
    const body = (await request.json()) as { topic?: string; message?: string }
    if (!body.topic || !body.message || body.message.trim().length < 10) {
      return error('Topic and a detailed message are required')
    }
    const ticketId = id('ticket')
    const message = body.message.trim()
    await env.DB.prepare(
      `INSERT INTO support_tickets (id, user_id, website_id, topic, message, status) VALUES (?, ?, ?, ?, ?, 'new')`,
    )
      .bind(ticketId, user.id, websiteId, body.topic, message)
      .run()

    const supportTo = supportEmail(env)
    if (!supportTo) return error('Support inbox is not configured', 503)
    const website = await getWebsite(env, websiteId)
    try {
      const email = supportTicketEmailContent({
        userName: user.name,
        userEmail: user.email,
        websiteName: website?.name || 'Website',
        websiteDomain: website?.domain || websiteId,
        topic: body.topic,
        message,
      })
      await sendBrevoEmail(env, {
        toEmail: supportTo,
        toName: 'Blacnova Development',
        subject: email.subject,
        text: email.text,
        html: email.html,
      })
    } catch (err) {
      console.error(JSON.stringify({ support_email_failed: String(err), ticketId }))
    }

    return json({ ok: true, id: ticketId })
  }

  if (path === '/v1/publish' && method === 'POST') {
    if (!env.GITHUB_TOKEN) {
      return error('GitHub publishing is not configured', 503)
    }
    const result = await publishWebsiteContent(env, websiteId, user.email)
    return json({
      ok: true,
      publishedAt: nowIso(),
      blocks: result.blocks,
      files: result.files,
      siteUrl: 'https://www.blacnova.net/',
      repo: env.GITHUB_REPO,
    })
  }

  if (path === '/v1/dashboard' && method === 'GET') {
    return loadDashboard(request, env, websiteId)
  }

  if (path === '/v1/billing' && method === 'GET') {
    const summary = await getClientBillingSummary(env, websiteId)
    if (!summary) return error('Website not found', 404)
    const invoices = await listInvoicesForWebsite(env, websiteId)
    return json({ billing: summary, invoices })
  }

  if (path === '/v1/notifications' && method === 'GET') {
    const notifications = await listNotifications(env, websiteId)
    return json({ notifications })
  }

  if (path === '/v1/notifications/read' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] }
    await markNotificationsRead(env, websiteId, body.ids)
    return json({ ok: true })
  }

  void token
  return error('Not found', 404)
}

async function login(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const ipOk = await rateLimit(env, `login:ip:${ip}`, 20, 60 * 15)
  if (!ipOk) return error('Too many login attempts. Try again later.', 429)

  const body = (await request.json()) as { email?: string; password?: string }
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) return error('Email and password are required')

  const emailOk = await rateLimit(env, `login:email:${email}`, 10, 60 * 15)
  if (!emailOk) return error('Too many login attempts. Try again later.', 429)

  const row = await env.DB.prepare(
    `SELECT id, email, name, role, website_id, password_hash, COALESCE(active, 1) AS active FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<{
      id: string
      email: string
      name: string
      role: string
      website_id: string
      password_hash: string
      active: number
    }>()

  const hash = row?.password_hash || DUMMY_PASSWORD_HASH
  const valid = await verifyPassword(password, hash)
  if (!row || !valid) {
    return error('Invalid email or password', 401)
  }
  if (!row.active) return error('This account has been deactivated', 403)

  const token = await createSession(env, row.id)
  const profile = await getUserProfile(env, {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    websiteId: row.website_id,
  })

  return json({ token, ...profile })
}

async function logout(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (token) await destroySession(env, token)
  return json({ ok: true })
}

async function changePassword(request: Request, env: Env, userId: string): Promise<Response> {
  const body = (await request.json()) as {
    currentPassword?: string
    newPassword?: string
  }
  if (!body.currentPassword || !body.newPassword) {
    return error('Current and new password are required')
  }
  const passwordError = assertPasswordPolicy(body.newPassword)
  if (passwordError) return error(passwordError)

  const row = await env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(body.currentPassword, row.password_hash))) {
    return error('Current password is incorrect', 403)
  }

  const passwordHash = await hashPassword(body.newPassword)
  await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(passwordHash, nowIso(), userId)
    .run()
  await revokeUserSessions(env, userId)
  return json({ ok: true, reauth: true })
}

async function publicRoutes(request: Request, env: Env, path: string): Promise<Response> {
  // /v1/public/:domain/...
  const parts = path.split('/').filter(Boolean) // v1, public, domain, ...
  const domain = decodeURIComponent(parts[2] || '')
  if (!domain) return error('Domain required')

  const website = await env.DB.prepare(`SELECT id, name, domain, status FROM websites WHERE domain = ?`)
    .bind(domain)
    .first<{ id: string; name: string; domain: string; status: string }>()
  if (!website) return error('Website not found', 404)

  const rest = parts.slice(3).join('/')

  if (!rest || rest === 'site') {
    const maintenance = await env.DB.prepare(`SELECT * FROM maintenance WHERE website_id = ?`)
      .bind(website.id)
      .first<{
        enabled: number
        title: string
        message: string
        expected_return: string
      }>()
    const [{ results: contentRows }, { results: mediaRows }] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM content_blocks WHERE website_id = ? AND published = 1 ORDER BY sort_order`,
      )
        .bind(website.id)
        .all(),
      env.DB.prepare(
        `SELECT id, name, type, url FROM media_items WHERE website_id = ? ORDER BY name COLLATE NOCASE`,
      )
        .bind(website.id)
        .all<{ id: string; name: string; type: string; url: string | null }>(),
    ])
    return json({
      website: {
        id: website.id,
        name: website.name,
        domain: website.domain,
        status: website.status,
      },
      maintenance: (() => {
        const forcedOffline =
          website.status === 'offline' || website.status === 'maintenance'
        if (!maintenance && !forcedOffline) {
          return { enabled: false, title: '', message: '', expectedReturn: '' }
        }
        return {
          enabled: Boolean(maintenance?.enabled) || forcedOffline,
          title:
            maintenance?.title ||
            (forcedOffline ? 'Website paused - payment required' : "We'll be right back"),
          message:
            maintenance?.message ||
            (forcedOffline
              ? `This site is temporarily offline. Please contact ${supportEmail(env) || 'Blacnova'}.`
              : ''),
          expectedReturn: maintenance?.expected_return || '',
        }
      })(),
      content: (contentRows || []).map((r) => mapContent(r as never)),
      media: (mediaRows || []).map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        url: m.url || null,
      })),
    })
  }

  return error('Not found', 404)
}

async function collectAnalytics(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const allowed = await rateLimit(env, `pv:${ip}`, 120, 60)
  if (!allowed) return json({ ok: true, throttled: true })

  let body: { domain?: string; path?: string; referrer?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return error('Invalid JSON body')
  }

  const domain = clampString(body.domain, 120)
  if (!domain) return error('domain is required')

  await recordPageview(env, request, {
    domain,
    path: clampString(body.path, 300) || '/',
    referrer: clampString(body.referrer, 300),
  })

  return new Response(null, { status: 204 })
}

async function createPublicSubmission(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const browser = hasBrowserOrigin(request)

  if (browser && !isAllowedFormOrigin(request, env)) {
    return error('Forbidden', 403)
  }

  let body: {
    domain?: string
    name?: string
    email?: string
    phone?: string
    subject?: string
    message?: string
    source?: string
    website?: string
    company_url?: string
    _gotcha?: string
    _t?: number | string
    formStarted?: number | string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return error('Invalid JSON body')
  }

  const domain = clampString(body.domain, 120)
  const name = clampString(body.name, 120)
  const email = clampString(body.email, 254).toLowerCase()
  const message = clampString(body.message, 5000)
  const phone = clampString(body.phone, 40) || null
  const subject = clampString(body.subject, 200) || 'Website inquiry'
  const source = clampString(body.source, 80) || 'Contact form'

  if (!domain || !name || !email || !message) {
    return error('domain, name, email, and message are required')
  }
  if (!isValidEmail(email)) return error('A valid email is required')
  if (isDisposableEmail(email)) return error('Please use a permanent email address')

  const spamReason = submissionLooksLikeSpam({
    honeypot: body._gotcha,
    websiteField: body.website,
    companyUrl: body.company_url,
    startedAt: body.formStarted ?? body._t,
    message,
    name,
  })
  if (spamReason) {
    // Silent success for honeypot fills so bots think it worked
    if (spamReason === 'rejected') {
      return json({ ok: true, id: id('sub') }, 201)
    }
    return error('Unable to submit right now. Please try again.', 400)
  }

  // Rate-limit only after spam filters so bots don't burn the quota
  const allowed = await rateLimit(env, `submit:${ip}`, browser ? 8 : 3, 60 * 60)
  if (!allowed) return error('Too many submissions. Try again later.', 429)

  const website = await env.DB.prepare(`SELECT id FROM websites WHERE domain = ?`)
    .bind(domain)
    .first<{ id: string }>()
  if (!website) return error('Website not found', 404)

  // Soft duplicate guard: same email + identical message within 10 minutes
  const recent = await env.DB.prepare(
    `SELECT id FROM submissions
     WHERE website_id = ? AND email = ? AND message = ?
       AND created_at >= datetime('now', '-10 minutes')
     LIMIT 1`,
  )
    .bind(website.id, email, message)
    .first()
  if (recent) {
    return json({ ok: true, id: (recent as { id: string }).id }, 200)
  }

  const submissionId = id('sub')
  await env.DB.prepare(
    `INSERT INTO submissions (id, website_id, name, email, phone, subject, message, source, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
  )
    .bind(submissionId, website.id, name, email, phone, subject, message, source, nowIso())
    .run()

  return json({ ok: true, id: submissionId }, 201)
}

async function serveMediaFile(env: Env, path: string): Promise<Response> {
  const mediaId = path.split('/')[3]
  const meta = await env.MEDIA.get(`${mediaId}:meta`)
  const data = await env.MEDIA.get(mediaId, 'arrayBuffer')
  if (!data) return error('File not found', 404)

  let contentType = 'application/octet-stream'
  if (meta) {
    try {
      contentType = (JSON.parse(meta) as { contentType?: string }).contentType || contentType
    } catch {
      /* ignore */
    }
  }

  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

async function uploadMedia(request: Request, env: Env, websiteId: string, actorEmail: string): Promise<Response> {
  const form = await request.formData()
  const file = form.get('file')
  const name = String(form.get('name') || (file instanceof File ? file.name : 'upload')).slice(0, 180)
  const type = String(form.get('type') || 'image')
  const usedOn = String(form.get('usedOn') || '').slice(0, 120)

  if (!(file instanceof File)) return error('file is required')
  if (file.size > 8 * 1024 * 1024) return error('File must be under 8 MB')

  const mediaId = id('media')
  const bytes = await file.arrayBuffer()
  const contentType = file.type || 'application/octet-stream'

  await env.MEDIA.put(mediaId, bytes)
  await env.MEDIA.put(`${mediaId}:meta`, JSON.stringify({ contentType, name }))

  let publicUrl = mediaUrl(request, mediaId)
  let githubPath: string | null = null

  if (env.GITHUB_TOKEN && (type === 'image' || contentType.startsWith('image/'))) {
    try {
      const published = await publishMediaToGitHub(env, name, bytes, contentType, actorEmail)
      githubPath = published.path
      publicUrl = `https://www.blacnova.net/${published.path}`
    } catch (err) {
      console.error('github media publish failed', String(err))
    }
  }

  await env.DB.prepare(
    `INSERT INTO media_items (id, website_id, name, type, size, used_on, content_type, url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      mediaId,
      websiteId,
      name,
      type,
      formatBytes(bytes.byteLength),
      usedOn,
      contentType,
      publicUrl,
      today(),
    )
    .run()

  const row = await env.DB.prepare(`SELECT * FROM media_items WHERE id = ?`).bind(mediaId).first()
  return json(
    {
      media: mapMedia(row as never, publicUrl),
      githubPath,
    },
    201,
  )
}

async function replaceMedia(
  request: Request,
  env: Env,
  websiteId: string,
  mediaId: string,
  actorEmail: string,
): Promise<Response> {
  const existing = await env.DB.prepare(
    `SELECT id, name, url FROM media_items WHERE id = ? AND website_id = ?`,
  )
    .bind(mediaId, websiteId)
    .first<{ id: string; name: string; url: string | null }>()
  if (!existing) return error('Media not found', 404)

  const form = await request.formData()
  const file = form.get('file')
  const name = form.get('name') ? String(form.get('name')).slice(0, 180) : undefined
  const type = form.get('type') ? String(form.get('type')) : undefined
  const usedOn = form.get('usedOn') ? String(form.get('usedOn')).slice(0, 120) : undefined

  let publicUrl = existing.url || mediaUrl(request, mediaId)

  if (file instanceof File) {
    if (file.size > 8 * 1024 * 1024) return error('File must be under 8 MB')
    const bytes = await file.arrayBuffer()
    const contentType = file.type || 'application/octet-stream'
    await env.MEDIA.put(mediaId, bytes)
    await env.MEDIA.put(`${mediaId}:meta`, JSON.stringify({ contentType, name: name || file.name }))

    publicUrl = mediaUrl(request, mediaId)
    if (env.GITHUB_TOKEN && contentType.startsWith('image/')) {
      try {
        const published = await publishMediaToGitHub(
          env,
          name || existing.name || file.name,
          bytes,
          contentType,
          actorEmail,
        )
        publicUrl = `https://www.blacnova.net/${published.path}`
      } catch (err) {
        console.error('github media replace failed', String(err))
      }
    }

    await env.DB.prepare(
      `UPDATE media_items SET size = ?, content_type = ?, updated_at = ?, url = ?, name = COALESCE(?, name), type = COALESCE(?, type), used_on = COALESCE(?, used_on) WHERE id = ?`,
    )
      .bind(
        formatBytes(bytes.byteLength),
        contentType,
        today(),
        publicUrl,
        name ?? null,
        type ?? null,
        usedOn ?? null,
        mediaId,
      )
      .run()
  } else {
    await env.DB.prepare(
      `UPDATE media_items SET updated_at = ?, name = COALESCE(?, name), type = COALESCE(?, type), used_on = COALESCE(?, used_on) WHERE id = ?`,
    )
      .bind(today(), name ?? null, type ?? null, usedOn ?? null, mediaId)
      .run()
  }

  const row = await env.DB.prepare(`SELECT * FROM media_items WHERE id = ?`).bind(mediaId).first()
  return json({ media: mapMedia(row as never, publicUrl) })
}

async function loadDashboard(request: Request, env: Env, websiteId: string): Promise<Response> {
  const website = await getWebsite(env, websiteId)
  if (!website) return error('Website not found', 404)

  const [content, pages, media, maintenance, submissions, analytics] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM content_blocks WHERE website_id = ? ORDER BY sort_order, page_name, section, label`,
    )
      .bind(websiteId)
      .all(),
    env.DB.prepare(`SELECT * FROM pages WHERE website_id = ? ORDER BY title`)
      .bind(websiteId)
      .all(),
    env.DB.prepare(`SELECT * FROM media_items WHERE website_id = ? ORDER BY updated_at DESC`)
      .bind(websiteId)
      .all(),
    env.DB.prepare(`SELECT * FROM maintenance WHERE website_id = ?`).bind(websiteId).first<{
      enabled: number
      title: string
      message: string
      expected_return: string
    }>(),
    env.DB.prepare(`SELECT * FROM submissions WHERE website_id = ? ORDER BY created_at DESC`)
      .bind(websiteId)
      .all(),
    getAnalyticsSeries(env, websiteId),
  ])

  return json({
    website,
    content: (content.results || []).map((r) => mapContent(r as never)),
    pages: (pages.results || []).map((r) => mapPage(r as never)),
    media: (media.results || []).map((r) =>
      mapMedia(r as never, mediaUrl(request, (r as { id: string }).id)),
    ),
    maintenance: maintenance
      ? {
          enabled: Boolean(maintenance.enabled),
          title: maintenance.title,
          message: maintenance.message,
          expectedReturn: maintenance.expected_return,
        }
      : {
          enabled: false,
          title: "We'll be right back",
          message: 'Our website is temporarily unavailable.',
          expectedReturn: '',
        },
    submissions: (submissions.results || []).map((r) => mapSubmission(r as never)),
    analytics,
    deltas: seriesDeltas(analytics),
    source: 'cloudflare-workers',
  })
}

async function handleBmcWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text()
  const signature =
    request.headers.get('x-signature-sha256') || request.headers.get('x-bmc-signature')

  if (!env.BMC_WEBHOOK_SECRET) {
    console.error(JSON.stringify({ err: 'BMC_WEBHOOK_SECRET not configured' }))
    return error('Webhook not configured', 503)
  }
  const valid = await verifyBmcSignature(rawBody, env.BMC_WEBHOOK_SECRET, signature)
  if (!valid) return error('Invalid webhook signature', 401)

  // Legacy header event name if envelope lacks type
  let bodyForIngest = rawBody
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    if (!parsed.type && request.headers.get('x-bmc-event')) {
      parsed.type = String(request.headers.get('x-bmc-event'))
      bodyForIngest = JSON.stringify(parsed)
    }
  } catch {
    /* ingest will reject */
  }

  const result = await ingestBmcWebhook(env, bodyForIngest)
  if (!result.ok) return error(result.error, 400)
  return json({ ok: true, id: result.id })
}
