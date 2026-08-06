import type { Env } from './types'
import { supportEmail } from './config'

const BREVO_API = 'https://api.brevo.com/v3'

export function senderFromEnv(env: Env): { name: string; email: string } {
  const email = supportEmail(env)
  if (!email) throw new Error('BREVO_SENDER_EMAIL or SUPPORT_EMAIL is not configured')
  return {
    name: env.BREVO_SENDER_NAME || 'Blacnova Development',
    email,
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

const LOGO_URL = 'https://www.blacnova.net/ui/img/bn.png'

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
      ? `<a href="${escapeAttr(opts.ctaUrl)}" class="bn-btn" style="display:inline-block;background-color:#d4611c;background-image:linear-gradient(#d4611c,#d4611c);color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:500;font-size:14px;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;border:1px solid #d4611c;"><span style="color:#ffffff;">${escapeHtml(opts.ctaLabel)}</span></a>`
      : ''

  const footer = opts.footerNote || 'Questions? Reply to this email or contact Blacnova Development.'

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(opts.title)}</title>
  <style type="text/css">
    :root { color-scheme: light only; }
    html, body { color-scheme: light only; background-color: #f3f4f6 !important; }
    /* Prefer light layout when clients honor the meta (Apple Mail, some Outlook). */
    @media (prefers-color-scheme: dark) {
      html, body, .bn-outer { background-color: #f3f4f6 !important; }
      .bn-card { background-color: #ffffff !important; border-color: #e5e7eb !important; }
      .bn-header { background-color: #000000 !important; }
      .bn-title, .bn-body, .bn-body strong { color: #1a1a1a !important; }
      .bn-muted { color: #484848 !important; }
      .bn-foot { color: #9ca3af !important; border-color: #e5e7eb !important; }
      .bn-panel { background-color: #f9fafb !important; border-color: #e5e7eb !important; }
      .bn-btn, .bn-btn span { background-color: #d4611c !important; color: #ffffff !important; }
    }
  </style>
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;" bgcolor="#f3f4f6">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&nbsp;</div>
  <table role="presentation" class="bn-outer" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center" bgcolor="#f3f4f6" style="background-color:#f3f4f6;">
        <table role="presentation" class="bn-card" width="560" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td class="bn-header" bgcolor="#000000" style="background-color:#000000;background-image:linear-gradient(#000000,#000000);padding:16px 28px;">
              <a href="https://www.blacnova.net" style="text-decoration:none;border:0;outline:none;">
                <img src="${LOGO_URL}" width="36" height="36" alt="Blacnova" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="bn-title" bgcolor="#ffffff" style="padding:28px 28px 8px;background-color:#ffffff;">
              <h1 style="margin:0;font-size:22px;font-weight:500;line-height:1.3;color:#000000;letter-spacing:-0.02em;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
                ${escapeHtml(opts.title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td class="bn-body bn-muted" bgcolor="#ffffff" style="padding:8px 28px 28px;font-size:14px;line-height:1.6;color:#484848;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;background-color:#ffffff;">
              ${opts.bodyHtml}
              ${cta ? `<div style="margin-top:24px;">${cta}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td class="bn-foot" bgcolor="#ffffff" style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;background-color:#ffffff;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
        <p class="bn-foot" style="margin:16px 0 0;font-size:11px;color:#9ca3af;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;">
          &copy; Blacnova Development
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function invoiceEmailContent(
  opts: {
    customerName: string
    amountFormatted: string
    description: string
    payUrl: string
    dueLabel: string
  },
  contactEmail?: string,
): { subject: string; html: string; text: string } {
  const contact = contactEmail || 'Blacnova Development'
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
    contact,
  ].join('\n')

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(opts.customerName)},</p>
    <p style="margin:0 0 16px;">Please find your invoice for <strong style="color:#000000;">${escapeHtml(opts.amountFormatted)}</strong>.</p>
    <table role="presentation" class="bn-panel" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f9fafb" style="margin:0 0 16px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
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
    footerNote: `Questions? Reply to this email or contact ${contact}.`,
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
    <table role="presentation" class="bn-panel" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f9fafb" style="margin:0 0 16px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
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

export function nonpaymentEmailContent(
  opts: {
    siteName: string
    domain: string
  },
  contactEmail?: string,
): { subject: string; html: string; text: string } {
  const contact = contactEmail || 'Blacnova Development'
  const subject = `Action required: ${opts.domain} offline for nonpayment`
  const text = [
    `Website offline for nonpayment`,
    '',
    `Client: ${opts.siteName} (${opts.domain})`,
    `Reason: 2+ past-due monthly invoices.`,
    '',
    'Pay outstanding invoices at https://dashboard.blacnova.net/billing',
    `Then contact ${contact} to restore the site.`,
  ].join('\n')

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong style="color:#000000;">${escapeHtml(opts.siteName)}</strong> (${escapeHtml(opts.domain)}) is offline because two or more monthly invoices are past due.</p>
    <p style="margin:0 0 8px;">Pay open invoices from Billing in your dashboard, then email ${escapeHtml(contact)} to restore the site.</p>`

  const html = brandedEmailHtml({
    title: 'Website offline for nonpayment',
    bodyHtml,
    ctaLabel: 'Open Billing',
    ctaUrl: 'https://dashboard.blacnova.net/billing',
    footerNote: `Blacnova Development - ${contact}`,
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
