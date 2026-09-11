// Pluggable email providers behind a single interface.
//   NOTIFY_PROVIDER = console (default) | smtp | brevo
// - console: logs the rendered message (great for local dev)
// - smtp:    sends real email via nodemailer (works with Brevo's SMTP relay too)
// - brevo:   sends via Brevo's transactional HTTP API

import nodemailer from 'nodemailer';

export interface RenderedMessage {
  to: string; // email address
  toName?: string; // recipient display name (used by Brevo email)
  subject: string;
  body: string;
}

export interface NotificationProvider {
  channel: 'email';
  send(msg: RenderedMessage): Promise<{ ok: boolean; detail: string }>;
}

class ConsoleEmailProvider implements NotificationProvider {
  channel = 'email' as const;
  async send(msg: RenderedMessage) {
    console.log(`[notify:email:console] to=${msg.to} subject="${msg.subject}"\n${msg.body}`);
    return { ok: true, detail: 'logged to console' };
  }
}

class SmtpEmailProvider implements NotificationProvider {
  channel = 'email' as const;
  async send(msg: RenderedMessage) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@example.com',
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    return { ok: true, detail: 'sent via smtp' };
  }
}

// ── Brevo (transactional HTTP API) ─────────────────────────────────────────
// Docs: https://developers.brevo.com  •  Auth header: `api-key: <BREVO_API_KEY>`
const BREVO_BASE = 'https://api.brevo.com/v3';

class BrevoEmailProvider implements NotificationProvider {
  channel = 'email' as const;
  async send(msg: RenderedMessage) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error('BREVO_API_KEY is not set');

    const res = await fetch(`${BREVO_BASE}/smtp/email`, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL,
          name: process.env.BREVO_SENDER_NAME ?? 'Bloom Salon',
        },
        to: [{ email: msg.to, name: msg.toName ?? msg.to }],
        subject: msg.subject,
        textContent: msg.body,
      }),
    });
    if (!res.ok) throw new Error(`Brevo email ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { messageId?: string };
    return { ok: true, detail: `sent via brevo (messageId ${data.messageId ?? 'n/a'})` };
  }
}

export function emailProvider(): NotificationProvider {
  switch (process.env.NOTIFY_PROVIDER) {
    case 'brevo': return new BrevoEmailProvider();
    case 'smtp': return new SmtpEmailProvider();
    default: return new ConsoleEmailProvider();
  }
}
