import "server-only";
import { emailLayout, escapeHtml } from "@/lib/mailer";

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
