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

/** Dashboard-styled shell: black header, white body, Poppins-friendly stack. */
export function brandedEmailHtml(opts: {
  title: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  footerNote?: string
}): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${escapeAttr(opts.ctaUrl)}" style="display:inline-block;background:#d4611c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:500;font-size:14px;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">${escapeHtml(opts.ctaLabel)}</a>`
      : ''

  const footer =
    opts.footerNote ||
    'Questions? Reply to this email or contact nic@blacnova.net.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#000000;padding:18px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size:15px;font-weight:500;color:#ffffff;letter-spacing:-0.01em;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
                    Blacnova
                  </td>
                  <td align="right" style="font-size:12px;color:rgba(255,255,255,0.55);font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
                    Client portal
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:500;line-height:1.3;color:#000000;letter-spacing:-0.02em;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
                ${escapeHtml(opts.title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-size:14px;line-height:1.6;color:#484848;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
              ${opts.bodyHtml}
              ${cta ? `<div style="margin-top:24px;">${cta}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
          &copy; Blacnova Development
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function invoiceEmailContent(opts: {
  customerName: string
  amountFormatted: string
  description: string
  payUrl: string
  dueLabel: string
}): { subject: string; html: string; text: string } {
  const subject = `Invoice from Blacnova Development - ${opts.amountFormatted}`
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

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(opts.customerName)},</p>
    <p style="margin:0 0 16px;">Please find your invoice for <strong style="color:#000000;">${escapeHtml(opts.amountFormatted)}</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;">
          <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;">Description</div>
          <div style="color:#1a1a1a;">${escapeHtml(opts.description)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 14px;">
          <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Due</div>
          <div style="color:#1a1a1a;">${escapeHtml(opts.dueLabel)}</div>
        </td>
      </tr>
    </table>`

  const html = brandedEmailHtml({
    title: 'Invoice ready',
    bodyHtml,
    ctaLabel: 'Pay invoice',
    ctaUrl: opts.payUrl,
    footerNote: 'Questions? Reply to this email or contact nic@blacnova.net.',
  })

  return { subject, html, text }
}

export function supportTicketEmailContent(opts: {
  userName: string
  userEmail: string
  websiteName: string
  websiteDomain: string
  topic: string
  message: string
}): { subject: string; html: string; text: string } {
  const subject = `Dashboard support - ${opts.topic} - ${opts.websiteName}`
  const text = [
    `Support ticket from the client dashboard`,
    '',
    `From: ${opts.userName} <${opts.userEmail}>`,
    `Website: ${opts.websiteName} (${opts.websiteDomain})`,
    `Topic: ${opts.topic}`,
    '',
    opts.message,
  ].join('\n')

  const bodyHtml = `
    <p style="margin:0 0 16px;">A client submitted a support ticket from the dashboard.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">From</div><div style="color:#1a1a1a;margin-top:4px;">${escapeHtml(opts.userName)} &lt;${escapeHtml(opts.userEmail)}&gt;</div></td></tr>
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">Website</div><div style="color:#1a1a1a;margin-top:4px;">${escapeHtml(opts.websiteName)} (${escapeHtml(opts.websiteDomain)})</div></td></tr>
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">Topic</div><div style="color:#1a1a1a;margin-top:4px;">${escapeHtml(opts.topic)}</div></td></tr>
      <tr><td style="padding:12px 16px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">Message</div><div style="color:#1a1a1a;margin-top:4px;white-space:pre-wrap;">${escapeHtml(opts.message)}</div></td></tr>
    </table>`

  const html = brandedEmailHtml({
    title: 'New support ticket',
    bodyHtml,
    ctaLabel: 'Open dashboard',
    ctaUrl: 'https://dashboard.blacnova.net/support',
    footerNote: 'Sent from the Blacnova client portal.',
  })

  return { subject, html, text }
}

export function nonpaymentEmailContent(opts: {
  siteName: string
  domain: string
}): { subject: string; html: string; text: string } {
  const subject = `Action required: ${opts.domain} offline for nonpayment`
  const text = [
    `Website offline for nonpayment`,
    '',
    `Client: ${opts.siteName} (${opts.domain})`,
    `Reason: 2+ past-due monthly invoices.`,
    '',
    'Pay outstanding invoices at https://dashboard.blacnova.net/billing',
    'Then contact nic@blacnova.net to restore the site.',
  ].join('\n')

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong style="color:#000000;">${escapeHtml(opts.siteName)}</strong> (${escapeHtml(opts.domain)}) is offline because two or more monthly invoices are past due.</p>
    <p style="margin:0 0 8px;">Pay open invoices from Billing in your dashboard, then email nic@blacnova.net to restore the site.</p>`

  const html = brandedEmailHtml({
    title: 'Website offline for nonpayment',
    bodyHtml,
    ctaLabel: 'Open Billing',
    ctaUrl: 'https://dashboard.blacnova.net/billing',
    footerNote: 'Blacnova Development - nic@blacnova.net',
  })

  return { subject, html, text }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}
