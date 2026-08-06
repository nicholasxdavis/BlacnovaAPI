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
# Required secrets (never commit values):
# GITHUB_TOKEN, STRIPE_SECRET_KEY, BREVO_API_KEY,
# SUPPORT_EMAIL, FINANCE_OWNER_EMAIL, BREVO_SENDER_EMAIL,
# BMC_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET, BMC_ACCESS_TOKEN (optional)
npx wrangler secret put SUPPORT_EMAIL
npx wrangler secret put FINANCE_OWNER_EMAIL
npx wrangler secret put BREVO_SENDER_EMAIL
npm run deploy
```

## Auth

- `POST /v1/auth/login` `{ email, password }`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `POST /v1/auth/password`

Owner access is configured via `SUPPORT_EMAIL` / `FINANCE_OWNER_EMAIL` secrets (not hardcoded).

## Public

- `GET /v1/public/meta` — support contact for auth UI
- `GET /v1/public/:domain/site` — published content + maintenance
- `POST /v1/public/submissions` — contact/quote form intake
