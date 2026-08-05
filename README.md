# Blacnova API

Cloudflare Worker backend for the Blacnova client dashboard.

## Stack

- Cloudflare Workers
- D1 (SQLite) — users, content, pages, submissions, analytics
- KV — sessions + media binaries

## Setup

```bash
npm install
npm run db:setup
npx wrangler secret put JWT_SECRET
npm run deploy
```

## Auth

- `POST /v1/auth/login` `{ email, password }`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `POST /v1/auth/password`

Owner account: `nic@blacnova.net` (controls `www.blacnova.net`).

## Public

- `GET /v1/public/:domain/site` — published content + maintenance
- `POST /v1/public/submissions` — contact/quote form intake
