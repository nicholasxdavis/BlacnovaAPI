import { parseModules } from './session'
import type { Env, SessionUser } from './types'

export async function getWebsite(env: Env, websiteId: string) {
  const row = await env.DB.prepare(
    `SELECT id, name, domain, status, modules, github_repo FROM websites WHERE id = ?`,
  )
    .bind(websiteId)
    .first<{
      id: string
      name: string
      domain: string
      status: string
      modules: string
      github_repo: string | null
    }>()

  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    status: row.status as 'live' | 'maintenance' | 'offline',
    modules: parseModules(row.modules),
    githubRepo: row.github_repo,
  }
}

export async function getUserProfile(env: Env, user: SessionUser) {
  const row = await env.DB.prepare(
    `SELECT notify_submissions, notify_maintenance, notify_weekly_email FROM users WHERE id = ?`,
  )
    .bind(user.id)
    .first<{
      notify_submissions: number
      notify_maintenance: number
      notify_weekly_email: number
    }>()

  const website = await getWebsite(env, user.websiteId)
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    preferences: {
      submissions: Boolean(row?.notify_submissions ?? 1),
      maintenance: Boolean(row?.notify_maintenance ?? 1),
      weeklyEmail: Boolean(row?.notify_weekly_email ?? 0),
    },
    website,
  }
}

export function mapContent(row: {
  id: string
  page_id: string
  page_name: string
  section: string
  label: string
  type: string
  value: string
  published: number
}) {
  return {
    id: row.id,
    pageId: row.page_id,
    pageName: row.page_name,
    section: row.section,
    label: row.label,
    type: row.type,
    value: row.value,
    published: Boolean(row.published),
  }
}

export function mapPage(row: {
  id: string
  title: string
  slug: string
  status: string
  updated_at: string
}) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updated_at,
  }
}

export function mapMedia(
  row: {
    id: string
    name: string
    type: string
    size: string
    used_on: string
    updated_at: string
    url?: string | null
  },
  fallbackUrl: string,
) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    size: row.size,
    usedOn: row.used_on,
    updatedAt: row.updated_at,
    url: row.url || fallbackUrl,
  }
}

export function mapSubmission(row: {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  source: string
  status: string
  notes: string | null
  created_at: string
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    subject: row.subject,
    message: row.message,
    source: row.source,
    status: row.status,
    notes: row.notes || undefined,
    createdAt: row.created_at,
  }
}

export function mediaUrl(request: Request, mediaId: string): string {
  const url = new URL(request.url)
  return `${url.origin}/v1/media/${mediaId}/file`
}
