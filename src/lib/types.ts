export interface Env {
  DB: D1Database
  MEDIA: KVNamespace
  SESSIONS: KVNamespace
  CORS_ORIGINS: string
}

export type ModuleKey =
  | 'overview'
  | 'content'
  | 'media'
  | 'pages'
  | 'maintenance'
  | 'submissions'
  | 'analytics'
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
