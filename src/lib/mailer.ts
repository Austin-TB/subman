import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";

export type Attachment = { filename: string; content: Buffer; contentType?: string };

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
};

let transport: Transporter | null | undefined;

function getTransport() {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      })
    : null;
  return transport;
}

/**
 * Sends an email. Every email is saved to the Outbox (EmailLog) whether or not
 * SMTP is configured, so the demo works offline. Never throws on SMTP failure;
 * the failure is recorded on the Outbox entry instead.
 */
export async function sendEmail(input: EmailInput) {
  const t = getTransport();
  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | null = null;

  if (t) {
    try {
      await t.sendMail({
        from: process.env.SMTP_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments,
      });
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
      console.error("SMTP send failed:", error);
    }
  }

  return db.emailLog.create({
    data: { to: input.to, subject: input.subject, html: input.html, status, error },
  });
}

/** Minimal branded wrapper for email bodies. */
export function emailLayout(title: string, body: string) {
  const company = process.env.COMPANY_NAME ?? "Brightloop";
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f6f6;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;padding:24px">
<p style="font-weight:600;font-size:18px;margin:0 0 16px">${escapeHtml(company)}</p>
<h2 style="font-size:16px;margin:0 0 12px">${escapeHtml(title)}</h2>
${body}
</div></body></html>`;
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
