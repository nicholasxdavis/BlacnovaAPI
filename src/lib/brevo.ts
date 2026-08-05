import type { Env } from './types'

const BREVO_API = 'https://api.brevo.com/v3'

export function senderFromEnv(env: Env): { name: string; email: string } {
  return {
    name: env.BREVO_SENDER_NAME || 'Blacnova Development',
    email: env.BREVO_SENDER_EMAIL || 'nic@blacnova.net',
  }
}

export async function sendBrevoEmail(
  env: Env,
  opts: {
    toEmail: string
    toName?: string
    subject: string
    html: string
    text: string
  },
): Promise<{ messageId: string }> {
  if (!env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not configured')
  }

  const sender = senderFromEnv(env)
  const res = await fetch(`${BREVO_API}/smtp/email`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: opts.toEmail, name: opts.toName || opts.toEmail }],
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
    }),
  })

  const data = (await res.json()) as { messageId?: string; message?: string }
  if (!res.ok) {
    throw new Error(data.message || `Brevo email failed (${res.status})`)
  }
  return { messageId: data.messageId || '' }
}

export function invoiceEmailContent(opts: {
  customerName: string
  amountFormatted: string
  description: string
  payUrl: string
  dueLabel: string
}): { subject: string; html: string; text: string } {
  const subject = `Invoice from Blacnova Development — ${opts.amountFormatted}`
  const text = [
    `Hi ${opts.customerName},`,
    '',
    `Blacnova Development has sent you an invoice for ${opts.amountFormatted}.`,
    '',
    opts.description,
    '',
    `Due: ${opts.dueLabel}`,
    '',
    `Pay securely online: ${opts.payUrl}`,
    '',
    'Thank you,',
    'Blacnova Development',
    'nic@blacnova.net',
  ].join('\n')

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 12px;">
              <div style="font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;font-weight:600;">Blacnova Development</div>
              <h1 style="margin:10px 0 0;font-size:22px;font-weight:600;line-height:1.3;">Invoice ready</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;font-size:15px;line-height:1.55;color:#3f3f46;">
              <p style="margin:0 0 16px;">Hi ${escapeHtml(opts.customerName)},</p>
              <p style="margin:0 0 16px;">Please find your invoice for <strong>${escapeHtml(opts.amountFormatted)}</strong>.</p>
              <p style="margin:0 0 8px;color:#71717a;font-size:13px;">Description</p>
              <p style="margin:0 0 16px;">${escapeHtml(opts.description)}</p>
              <p style="margin:0 0 24px;color:#71717a;font-size:13px;">Due ${escapeHtml(opts.dueLabel)}</p>
              <a href="${escapeAttr(opts.payUrl)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;font-size:14px;">Pay invoice</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f4f4f5;font-size:12px;color:#a1a1aa;line-height:1.5;">
              Questions? Reply to this email or contact nic@blacnova.net.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}
