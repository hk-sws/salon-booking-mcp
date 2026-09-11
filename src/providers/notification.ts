// Pluggable notification providers behind a single interface. The console
// provider logs the rendered message; the SMTP provider sends real email via
// nodemailer; the SMS provider is a stub with the interface in place.

import nodemailer from 'nodemailer';

export interface RenderedMessage {
  to: string;
  subject: string;
  body: string;
}

export interface NotificationProvider {
  channel: 'email' | 'sms';
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

class StubSmsProvider implements NotificationProvider {
  channel = 'sms' as const;
  async send(msg: RenderedMessage) {
    console.log(`[notify:sms:stub] to=${msg.to} body="${msg.body}"`);
    return { ok: true, detail: 'sms stubbed (no provider configured)' };
  }
}

export function emailProvider(): NotificationProvider {
  return process.env.NOTIFY_PROVIDER === 'smtp'
    ? new SmtpEmailProvider()
    : new ConsoleEmailProvider();
}

export function smsProvider(): NotificationProvider {
  return new StubSmsProvider();
}
