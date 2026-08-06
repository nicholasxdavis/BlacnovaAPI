import { syncInvoiceStatus } from './billing'
import type { Env } from './types'

/**
 * Verify Stripe-Signature and handle invoice lifecycle events.
 * Configure endpoint: POST /v1/webhooks/stripe
 * Secret: wrangler secret put STRIPE_WEBHOOK_SECRET
 */
export async function handleStripeWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  const payload = await request.text()
  const signature = request.headers.get('Stripe-Signature') || ''
  const ok = await verifyStripeSignature(payload, signature, secret)
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const event = JSON.parse(payload) as {
    type: string
    data: { object: { id: string; status?: string; metadata?: Record<string, string> } }
  }

  const invoice = event.data.object
  const stripeId = invoice.id

  try {
    switch (event.type) {
      case 'invoice.paid':
        await syncInvoiceStatus(env, stripeId, 'paid')
        break
      case 'invoice.voided':
        await syncInvoiceStatus(env, stripeId, 'void')
        break
      case 'invoice.marked_uncollectible':
        await syncInvoiceStatus(env, stripeId, 'uncollectible')
        break
      case 'invoice.payment_failed':
        await syncInvoiceStatus(env, stripeId, invoice.status || 'open')
        break
      default:
        break
    }
  } catch (err) {
    console.error(JSON.stringify({ stripe_webhook_err: String(err), type: event.type }))
    return new Response(JSON.stringify({ error: 'Handler failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k, v]
    }),
  ) as { t?: string; v1?: string }

  if (!parts.t || !parts.v1) return false

  const signed = `${parts.t}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t))
  if (age > 300) return false

  return timingSafeEqual(hex, parts.v1)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
