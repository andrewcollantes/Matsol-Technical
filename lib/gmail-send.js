'use strict';

const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

/**
 * Resolve SMTP settings for transactional mail.
 * Supports either Gmail app-password env vars or generic SMTP_HOST/SMTP_PORT.
 *
 * @returns {{ user: string, pass: string, from: string, host: string, port: number, secure: boolean } | null}
 */
function resolveGmailAuth() {
  const gUser = String(process.env.GMAIL_USER || '').trim();
  const gPass = String(process.env.GMAIL_APP_PASSWORD || '').trim();
  if (gUser && gPass) {
    const host = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;
    return {
      user: gUser,
      pass: gPass,
      from: String(process.env.GMAIL_FROM || process.env.SMTP_FROM || gUser).trim(),
      host,
      port,
      secure
    };
  }

  const svc = String(process.env.SMTP_SERVICE || '').trim().toLowerCase();
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '').trim();
  const smtpHost = String(process.env.SMTP_HOST || '').trim();
  if ((svc === 'gmail' && smtpUser && smtpPass) || (smtpHost && smtpUser && smtpPass)) {
    const host = smtpHost || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || (svc === 'gmail' ? 465 : 587));
    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;
    return {
      user: smtpUser,
      pass: smtpPass,
      from: String(process.env.SMTP_FROM || smtpUser).trim(),
      host,
      port,
      secure
    };
  }

  return null;
}

function resolveResendApiKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

/**
 * Prefer Resend on hosts like Render where outbound SMTP to Gmail often times out (blocked ports).
 * RESEND_FROM defaults to Resend's test sender; verify your domain in Resend for production "from".
 */
function resolveResendFrom() {
  return (
    String(process.env.RESEND_FROM || '').trim() ||
    'MSI Printer Assets <onboarding@resend.dev>'
  );
}

/** True if any outbound email path is configured */
function isOutboundEmailConfigured() {
  return Boolean(resolveResendApiKey()) || Boolean(resolveGmailAuth());
}

/** Short hint for admin UI after creating invite/reset */
function outboundEmailUiHint() {
  if (resolveResendApiKey()) {
    return ' Email is sent via Resend (HTTPS — works on Render).';
  }
  if (resolveGmailAuth()) {
    return ' SMTP is enabled — if mail fails on Render with timeout, add RESEND_API_KEY (HTTPS is often more reliable there).';
  }
  return ' (No email API/SMTP configured — copy the link above. On Render use RESEND_API_KEY.)';
}

function buildAppLinkEmailBody(kind, inviteRole, linkUrl) {
  if (kind === 'password_reset') {
    return {
      subject: 'Reset your MSI Printer Assets password',
      text: `Reset your password using this link (expires in 24 hours):\n\n${linkUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Reset your password using the link below (expires in 24 hours).</p><p><a href="${escapeAttr(linkUrl)}">${escapeHtml(linkUrl)}</a></p><p>If you did not request this, you can ignore this email.</p>`
    };
  }

  const roleLabel = inviteRole === 'admin' ? 'an administrator' : 'an employee';
  return {
    subject: 'Complete your MSI Printer Assets account setup',
    text: `You have been invited to join as ${roleLabel}. Complete setup here (expires in 24 hours):\n\n${linkUrl}\n\nIf you were not expecting this, you can ignore this email.`,
    html: `<p>You have been invited to join as ${roleLabel}.</p><p><a href="${escapeAttr(linkUrl)}">Complete your account setup</a></p><p>This link expires in 24 hours. If you were not expecting this, you can ignore this email.</p>`
  };
}

/**
 * @returns {Promise<{ sent: boolean, skipped: boolean, error?: string, provider?: string }>}
 */
async function sendViaResend(to, subject, text, html) {
  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    return { sent: false, skipped: true };
  }

  const body = {
    from: resolveResendFrom(),
    to: [to],
    subject,
    text,
    ...(html ? { html } : {})
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000)
    });

    const raw = await res.text();
    if (!res.ok) {
      let errorMsg = raw || `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.message) {
          errorMsg = parsed.message;
        }
      } catch (e) {
        // ignore
      }
      return {
        sent: false,
        skipped: false,
        provider: 'resend',
        error: errorMsg
      };
    }

    return { sent: true, skipped: false, provider: 'resend' };
  } catch (err) {
    console.error('sendViaResend:', err);
    return {
      sent: false,
      skipped: false,
      provider: 'resend',
      error: err && err.message ? String(err.message) : String(err)
    };
  }
}

/**
 * Send a single transactional email through Gmail SMTP.
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 * @returns {Promise<{ sent: boolean, skipped: boolean, error?: string, provider?: string }>}
 */
async function sendGmailLink(opts) {
  const to = String(opts.to || '').trim();
  const subject = String(opts.subject || '').trim();
  const text = String(opts.text || '');
  const html = opts.html != null ? String(opts.html) : '';

  if (!to || !subject) {
    return { sent: false, skipped: true };
  }

  const auth = resolveGmailAuth();
  if (!auth) {
    return { sent: false, skipped: true };
  }

  const transport = nodemailer.createTransport({
    host: auth.host,
    port: auth.port,
    secure: auth.secure,
    auth: { user: auth.user, pass: auth.pass },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
    pool: false
  });

  try {
    await transport.sendMail({
      from: auth.from,
      to,
      subject,
      text,
      ...(html ? { html } : {})
    });
    return { sent: true, skipped: false, provider: 'gmail-smtp' };
  } catch (err) {
    console.error('sendGmailLink:', err);
    return {
      sent: false,
      skipped: false,
      provider: 'gmail-smtp',
      error: err && err.message ? String(err.message) : String(err)
    };
  }
}

/**
 * Preset copy for invite / password-reset links.
 * Prefers Resend (HTTPS) when RESEND_API_KEY is set — required for many cloud hosts that block SMTP.
 * @param {{ to: string, linkUrl: string, kind: 'account_invite'|'password_reset', inviteRole?: string }} opts
 */
async function sendGmailAppLink(opts) {
  const to = String(opts.to || '').trim();
  const linkUrl = String(opts.linkUrl || '').trim();
  const kind = opts.kind;
  const inviteRole = String(opts.inviteRole || '').toLowerCase();

  if (!to || !linkUrl) {
    return { sent: false, skipped: true };
  }

  const { subject, text, html } = buildAppLinkEmailBody(kind, inviteRole, linkUrl);

  if (resolveResendApiKey()) {
    return sendViaResend(to, subject, text, html);
  }

  return sendGmailLink({ to, subject, text, html });
}

/**
 * Do not block HTTP: send after the response is free to go. Logs success/failure.
 */
function sendGmailAppLinkInBackground(opts) {
  setImmediate(() => {
    sendGmailAppLink(opts)
      .then(result => {
        const to = String(opts.to || '').trim();
        if (result.sent) {
          console.log(`[email] Sent ${opts.kind} to ${to} via ${result.provider || 'unknown'}`);
        } else if (result.skipped) {
          console.warn(`[email] Skipped ${opts.kind} to ${to} (no RESEND_API_KEY or Gmail)`);
        } else if (result.error) {
          console.error(`[email] Failed ${opts.kind} to ${to}: ${result.error}`);
        }
      })
      .catch(err => {
        console.error('[email] Unexpected error:', err);
      });
  });
}

module.exports = {
  sendGmailLink,
  sendGmailAppLink,
  sendGmailAppLinkInBackground,
  resolveGmailAuth,
  resolveResendApiKey,
  isOutboundEmailConfigured,
  outboundEmailUiHint
};
