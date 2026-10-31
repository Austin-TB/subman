import "server-only";
import { fail, ok, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { daysOverdue, isOverdue } from "@/lib/billing/status";
import { businessToday, formatDate } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/mailer";
import { formatMoney } from "@/lib/money";
import { nextNumber } from "@/lib/sequences";

const lockInvoice = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;

const appUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** Logs on the invoice and on its subscription, so the subscription's timeline shows invoices and payments too. */
async function logBoth(tx: Tx, inv: { id: string; subscriptionId: string }, action: string, message: string, userId: string | null) {
  await logActivity({ entityType: "invoice", entityId: inv.id, action, message, userId }, tx);
  await logActivity({ entityType: "subscription", entityId: inv.subscriptionId, action, message, userId }, tx);
}

/** Draft → Confirmed. The number is assigned here, inside the transaction, so numbers have no gaps. */
export async function confirmInvoice(id: string, userId: string | null): Promise<ActionResult<{ number: string }>> {
  return db.$transaction(async (tx) => {
    await lockInvoice(tx, id);
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) return fail("Invoice not found.");
    if (inv.status !== "DRAFT") return fail("Only a draft invoice can be confirmed.");
    const number = await nextNumber(tx, "INV", inv.invoiceDate.getUTCFullYear());
    await tx.invoice.update({
      where: { id },
      data: { status: inv.total === 0 ? "PAID" : "CONFIRMED", number, confirmedAt: new Date() },
    });
    await logBoth(tx, inv, "confirmed", `Invoice ${number} confirmed (${formatMoney(inv.total)})`, userId);
    return ok(`Invoice ${number} confirmed.`, { number });
  });
}

/** Draft or Confirmed → Cancelled, only while nothing has been paid. Discount uses go back to their rules. */
export async function cancelInvoice(id: string, userId: string | null): Promise<ActionResult> {
  return db.$transaction(async (tx) => {
    await lockInvoice(tx, id);
    const inv = await tx.invoice.findUnique({ where: { id }, include: { discountUsages: true } });
    if (!inv) return fail("Invoice not found.");
    if (inv.status !== "DRAFT" && inv.status !== "CONFIRMED") return fail("This invoice can't be cancelled.");
    if (inv.amountPaid > 0) return fail("Payments have been recorded against this invoice, so it can't be cancelled.");
    for (const u of inv.discountUsages) {
      await tx.$executeRaw`UPDATE "Discount" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "id" = ${u.discountId}`;
    }
    await tx.discountUsage.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), amountDue: 0 } });
    await logBoth(tx, inv, "cancelled", `Invoice ${inv.number ?? "(draft)"} cancelled`, userId);
    return ok("Invoice cancelled.");
  });
}

function invoiceEmailHtml(inv: { number: string | null; total: number; amountDue: number; dueDate: Date; id: string }, name: string, reminder: boolean) {
  const url = `${appUrl()}/portal/invoices/${inv.id}`;
  return emailLayout(
    reminder ? `Payment reminder: invoice ${inv.number}` : `Invoice ${inv.number}`,
    `<p>Hi ${escapeHtml(name)},</p>
<p>${
      reminder
        ? `Invoice <strong>${escapeHtml(inv.number ?? "")}</strong> was due on ${formatDate(inv.dueDate)} and ${formatMoney(inv.amountDue)} is still outstanding.`
        : `Your invoice <strong>${escapeHtml(inv.number ?? "")}</strong> for ${formatMoney(inv.total)} is ready. It is due on ${formatDate(inv.dueDate)}.`
    }</p>
<p><a href="${escapeHtml(url)}">View and print the invoice</a> in your Brightloop portal.</p>`,
  );
}

export async function sendInvoice(id: string, userId: string | null): Promise<ActionResult> {
  const inv = await db.invoice.findUnique({ where: { id }, include: { customer: true } });
  if (!inv) return fail("Invoice not found.");
  if (inv.status !== "CONFIRMED" && inv.status !== "PAID") return fail("Confirm the invoice before sending it.");
  await sendEmail({ to: inv.customer.email, subject: `Invoice ${inv.number} from Brightloop`, html: invoiceEmailHtml(inv, inv.customer.name, false) });
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { sentAt: new Date() } });
    await logBoth(tx, inv, "sent", `Invoice ${inv.number} sent to ${inv.customer.email}`, userId);
  });
  return ok(`Sent to ${inv.customer.email}.`);
}

export async function sendReminder(id: string, userId: string | null): Promise<ActionResult> {
  const inv = await db.invoice.findUnique({ where: { id }, include: { customer: true } });
  if (!inv) return fail("Invoice not found.");
  const today = businessToday();
  if (!isOverdue(inv, today)) return fail("Only an overdue invoice needs a reminder.");
  await sendEmail({ to: inv.customer.email, subject: `Reminder: invoice ${inv.number} is overdue`, html: invoiceEmailHtml(inv, inv.customer.name, true) });
  await logActivity({
    entityType: "invoice",
    entityId: id,
    action: "reminder",
    message: `Reminder sent (${daysOverdue(inv, today)} days overdue)`,
    userId,
  });
  return ok(`Reminder sent to ${inv.customer.email}.`);
}

export type PaymentInput = { method: "CASH" | "BANK_TRANSFER" | "CARD" | "UPI" | "CHEQUE"; amount: number; paymentDate: Date; note: string | null };

/** A payment against a confirmed invoice: more than 0 and no more than is due. Paid when nothing is left. */
export async function registerPayment(id: string, p: PaymentInput, userId: string | null): Promise<ActionResult> {
  return db.$transaction(async (tx) => {
    await lockInvoice(tx, id);
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) return fail("Invoice not found.");
    if (inv.status !== "CONFIRMED") return fail("Payments can only be registered on a confirmed invoice.");
    if (p.amount <= 0) return fail("The amount must be more than 0.", { amount: ["Must be more than 0"] });
    if (p.amount > inv.amountDue) {
      return fail(`Only ${formatMoney(inv.amountDue)} is due.`, { amount: [`At most ${formatMoney(inv.amountDue)}`] });
    }
    await tx.payment.create({ data: { invoiceId: id, ...p, recordedById: userId } });
    const amountPaid = inv.amountPaid + p.amount;
    const amountDue = inv.total - amountPaid;
    await tx.invoice.update({ where: { id }, data: { amountPaid, amountDue, status: amountDue === 0 ? "PAID" : "CONFIRMED" } });
    await logBoth(
      tx,
      inv,
      "payment",
      `Payment of ${formatMoney(p.amount)} by ${p.method.replace("_", " ").toLowerCase()} on ${formatDate(p.paymentDate)}${amountDue === 0 ? ". Invoice paid" : `. ${formatMoney(amountDue)} still due`}`,
      userId,
    );
    return ok(amountDue === 0 ? "Payment registered. The invoice is paid." : `Payment registered. ${formatMoney(amountDue)} still due.`);
  });
}
