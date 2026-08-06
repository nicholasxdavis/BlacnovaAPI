export interface Env {
  DB: D1Database
  MEDIA: KVNamespace
  SESSIONS: KVNamespace
  CORS_ORIGINS: string
  /** GitHub PAT with repo scope — set via `wrangler secret put GITHUB_TOKEN` */
  GITHUB_TOKEN: string
  /** e.g. nicholasxdavis/BlacnovaWebsite */
  GITHUB_REPO: string
  GITHUB_BRANCH?: string
  STRIPE_SECRET_KEY: string
  STRIPE_PUBLISHABLE_KEY?: string
  /** Brevo transactional API key — `wrangler secret put BREVO_API_KEY` */
  BREVO_API_KEY: string
  BREVO_SENDER_EMAIL?: string
  BREVO_SENDER_NAME?: string
  /** Agency support inbox — wrangler secret or var */
  SUPPORT_EMAIL?: string
  /** Only this email may access Stripe balance + BMC Finance */
  FINANCE_OWNER_EMAIL?: string
  /** Stripe webhook signing secret — `wrangler secret put STRIPE_WEBHOOK_SECRET` */
  STRIPE_WEBHOOK_SECRET?: string
  /** Buy Me a Coffee webhook signing secret */
  BMC_WEBHOOK_SECRET?: string
  /** Optional personal access token for historical sync */
  BMC_ACCESS_TOKEN?: string
}

export type ModuleKey =
  | 'overview'
  | 'content'
  | 'media'
  | 'pages'
  | 'maintenance'
  | 'submissions'
  | 'analytics'
  | 'billing'
  | 'settings'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  websiteId: string
}

export interface SessionRecord {
  userId: string
  createdAt: string
  expiresAt: string
}
