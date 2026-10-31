"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action";
import { cancelInvoice, confirmInvoice, registerPayment, sendInvoice, sendReminder } from "@/lib/billing/invoices";
import { runBilling } from "@/lib/billing/run";
import { tryParseDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { requireBackOffice } from "@/lib/session";

const refresh = (id?: string) => {
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/invoices/${id}`);
};

export async function confirmInvoiceAction(id: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  const r = await confirmInvoice(id, user.id);
  refresh(id);
  return r.ok ? ok(r.message) : r;
}

export async function cancelInvoiceAction(id: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  const r = await cancelInvoice(id, user.id);
  refresh(id);
  return r;
}

export async function sendInvoiceAction(id: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  const r = await sendInvoice(id, user.id);
  refresh(id);
  return r;
}

export async function remindInvoiceAction(id: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  return sendReminder(id, user.id);
}

const METHODS = ["CASH", "BANK_TRANSFER", "CARD", "UPI", "CHEQUE"] as const;

export async function registerPaymentAction(
  id: string,
  input: { method: string; amount: string; paymentDate: string; note: string },
): Promise<ActionResult> {
  const user = await requireBackOffice();
  const method = METHODS.find((m) => m === input.method);
  const amount = parseMoney(input.amount);
  const paymentDate = tryParseDate(input.paymentDate);
  const errors: Record<string, string[]> = {};
  if (!method) errors.method = ["Choose a method"];
  if (amount == null || amount <= 0) errors.amount = ["Enter an amount more than 0"];
  if (!paymentDate) errors.paymentDate = ["Choose a date"];
  if (!method || amount == null || !paymentDate || amount <= 0) return fail("Check the highlighted fields.", errors);
  const r = await registerPayment(id, { method, amount, paymentDate, note: input.note.trim().slice(0, 500) || null }, user.id);
  refresh(id);
  return r;
}

/** Confirms every draft with an invoice date on or before `upTo` (all drafts when empty), oldest first. */
export async function bulkConfirmAction(upTo: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  const date = tryParseDate(upTo);
  const drafts = await db.invoice.findMany({
    where: { status: "DRAFT", ...(date && { invoiceDate: { lte: date } }) },
    orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
    select: { id: true },
    take: 2000,
  });
  let done = 0;
  for (const d of drafts) if ((await confirmInvoice(d.id, user.id)).ok) done++;
  refresh();
  return ok(`${done} invoice${done === 1 ? "" : "s"} confirmed.`);
}

export async function runBillingAction(asOfIso: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  const asOf = tryParseDate(asOfIso);
  if (!asOf) return fail("Choose a valid date.");
  const started = Date.now();
  const r = await runBilling(asOf, { trigger: "manual", userId: user.id });
  refresh();
  revalidatePath("/billing");
  revalidatePath("/subscriptions");
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  return ok(
    `${r.invoicesCreated} invoice${r.invoicesCreated === 1 ? "" : "s"} created, ${r.activated} activated, ${r.closed} closed${
      r.errors.length ? `, ${r.errors.length} errors` : ""
    } in ${secs}s.`,
  );
}
