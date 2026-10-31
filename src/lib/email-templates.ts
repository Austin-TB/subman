import "server-only";
import { formatDate } from "@/lib/dates";
import { emailLayout, escapeHtml } from "@/lib/mailer";
import { formatMoney } from "@/lib/money";

const button = (url: string, label: string) =>
  `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>`;

const linkFallback = (url: string) =>
  `<p style="font-size:12px;color:#6b7280">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;

type LinkEmail = { name: string; url: string; expiresIn: string };

/** Sent when someone uses "Forgot password". */
export function resetPasswordEmail({ name, url, expiresIn }: LinkEmail) {
  return {
    subject: "Reset your Brightloop password",
    html: emailLayout(
      "Reset your password",
      `<p>Hi ${escapeHtml(name)},</p>
<p>We received a request to reset the password on your account. Use the button below to choose a new one. The link works once and expires in ${escapeHtml(expiresIn)}.</p>
${button(url, "Choose a new password")}
<p>If you didn't ask for this, you can ignore this email. Your password won't change.</p>
${linkFallback(url)}`,
    ),
  };
}

/** Sent when an admin adds a staff member, who has no password yet. */
export function setPasswordEmail({ name, url, expiresIn }: LinkEmail) {
  return {
    subject: "You've been added to Brightloop Subman",
    html: emailLayout(
      "Set your password",
      `<p>Hi ${escapeHtml(name)},</p>
<p>An administrator has created a staff account for you. Set a password to get started. The link works once and expires in ${escapeHtml(expiresIn)}.</p>
${button(url, "Set my password")}
<p>If the link has expired, ask an administrator to send you a new one.</p>
${linkFallback(url)}`,
    ),
  };
}

type QuotationEmail = {
  name: string;
  number: string;
  planName: string;
  startDate: Date;
  expiryDate: Date | null;
  validUntil: Date;
  lines: { description: string; quantity: number; unitPrice: number; amount: number }[];
  untaxed: number;
  tax: number;
  total: number;
  periodLabel: string;
};

const cell = "padding:6px 8px;border-bottom:1px solid #e5e7eb;";

/** Sent when staff send a quotation. There is no portal page for a quotation yet, so the offer is set out in full. */
export function quotationEmail(q: QuotationEmail) {
  const rows = q.lines
    .map(
      (l) =>
        `<tr><td style="${cell}">${escapeHtml(l.description)}</td><td style="${cell}text-align:right">${l.quantity}</td><td style="${cell}text-align:right">${formatMoney(l.unitPrice)}</td><td style="${cell}text-align:right">${formatMoney(l.amount)}</td></tr>`,
    )
    .join("");
  const total = (label: string, amount: number, bold = false) =>
    `<tr><td colspan="3" style="padding:6px 8px;text-align:right${bold ? ";font-weight:600" : ""}">${label}</td><td style="padding:6px 8px;text-align:right${bold ? ";font-weight:600" : ""}">${formatMoney(amount)}</td></tr>`;

  return {
    subject: `Your quotation ${q.number} from Brightloop`,
    html: emailLayout(
      `Quotation ${q.number}`,
      `<p>Hi ${escapeHtml(q.name)},</p>
<p>Here is our offer for <strong>${escapeHtml(q.planName)}</strong>, billed every ${escapeHtml(q.periodLabel)}. It starts on ${formatDate(q.startDate)}${q.expiryDate ? ` and runs until ${formatDate(q.expiryDate)}` : ""}. This quotation is valid until <strong>${formatDate(q.validUntil)}</strong>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
<thead><tr style="text-align:left;color:#6b7280"><th style="${cell}">Item</th><th style="${cell}text-align:right">Qty</th><th style="${cell}text-align:right">Unit price</th><th style="${cell}text-align:right">Amount</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot>${total("Untaxed", q.untaxed)}${total("Tax", q.tax)}${total(`Total per ${escapeHtml(q.periodLabel)}`, q.total, true)}</tfoot>
</table>
<p>To accept, just reply to this email and we will confirm the subscription for you.</p>`,
    ),
  };
}
