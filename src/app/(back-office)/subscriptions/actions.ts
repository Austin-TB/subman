"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { MAX_RECURRING_AMOUNT, recurringAmount } from "@/lib/billing/pricing";
import { runBilling } from "@/lib/billing/run";
import { businessToday, formatDate, tryParseDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { planAvailability } from "@/lib/plans";
import { nextNumber } from "@/lib/sequences";
import { addLineSchema, subscriptionSchema } from "@/lib/schemas/subscriptions";
import { requireAdmin, requireBackOffice } from "@/lib/session";
import { resolveLines } from "@/lib/subscriptions/lines";
import { lockSubscription, recomputeRecurring, transitionSubscription } from "@/lib/subscriptions/service";
import { USER_ACTIONS, type SubAction } from "@/lib/subscriptions/transitions";

const FIX = "Check the highlighted fields.";

const revalidate = (id?: string) => {
  revalidatePath("/subscriptions");
  if (id) revalidatePath(`/subscriptions/${id}`);
};

/** Creates a draft (no id) or saves changes to one. Only drafts can be edited; a quotation goes back to draft first. */
export async function saveSubscription(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireBackOffice();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const existing = id
    ? await db.subscription.findUnique({ where: { id }, include: { lines: { include: { taxes: { select: { id: true } } } } } })
    : null;
  if (id && !existing) return fail("This subscription no longer exists.");
  if (existing && existing.status !== "DRAFT") return fail("Only a draft can be edited. Use Edit to take a quotation back to draft.");

  const [customer, plan, term] = await Promise.all([
    db.customer.findUnique({ where: { id: data.customerId }, select: { id: true } }),
    db.plan.findUnique({ where: { id: data.planId } }),
    db.paymentTerm.findUnique({ where: { id: data.paymentTermId }, select: { id: true } }),
  ]);
  const errors: Record<string, string[]> = {};
  if (!customer) errors.customerId = ["That customer no longer exists"];
  if (!term) errors.paymentTermId = ["Those payment terms no longer exist"];
  if (!plan) errors.planId = ["That plan no longer exists"];
  else if (planAvailability(plan, data.startDate) !== "AVAILABLE") {
    errors.planId = [`${plan.name} isn't available on ${formatDate(data.startDate)}`];
  }
  if (Object.keys(errors).length > 0 || !plan) return fail(FIX, errors);

  const resolved = await resolveLines({
    plan,
    planLine: data.planLine,
    lines: data.lines,
    keep: existing
      ? { productIds: existing.lines.map((l) => l.productId), taxIds: existing.lines.flatMap((l) => l.taxes.map((t) => t.id)) }
      : undefined,
  });
  if (!resolved.ok) return fail(FIX, resolved.errors);
  const lines = resolved.lines;
  const amount = recurringAmount(lines);

  const header = {
    customerId: data.customerId,
    planId: data.planId,
    startDate: data.startDate,
    expiryDate: data.expiryDate,
    validityDays: data.validityDays,
    paymentTermId: data.paymentTermId,
    recurringAmount: amount,
  };
  const lineRows = lines.map((l, sequence) => ({
    productId: l.productId,
    variantId: l.variantId,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    isPlanLine: l.isPlanLine,
    sequence,
    taxes: { connect: l.taxIds.map((t) => ({ id: t })) },
  }));

  const saved = await db.$transaction(async (tx) => {
    if (existing) {
      await lockSubscription(tx, existing.id);
      await tx.subscriptionLine.deleteMany({ where: { subscriptionId: existing.id } });
      const s = await tx.subscription.update({ where: { id: existing.id }, data: { ...header, lines: { create: lineRows } } });
      await logActivity(
        { entityType: "subscription", entityId: s.id, action: "updated", message: `Draft saved: ${lines.length} lines, ${formatMoney(amount)} per period`, userId: user.id },
        tx,
      );
      return s;
    }
    const today = businessToday();
    const number = await nextNumber(tx, "SUB", today.getUTCFullYear());
    const validUntil = new Date(today.getTime() + data.validityDays * 86_400_000);
    const s = await tx.subscription.create({ data: { ...header, number, validUntil, lines: { create: lineRows } } });
    await logActivity(
      { entityType: "subscription", entityId: s.id, action: "created", message: `Subscription ${number} created as a draft (${plan.name})`, userId: user.id },
      tx,
    );
    return s;
  });

  revalidate(saved.id);
  return ok(existing ? "Draft saved." : `${saved.number} created.`, { id: saved.id });
}

export async function runSubscriptionAction(id: string, action: SubAction, reason?: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  if (!USER_ACTIONS.includes(action)) return fail("Unknown action.");
  const result = await transitionSubscription({ id, action, actor: { kind: "staff", userId: user.id }, reason });
  if (!result.ok) return result;
  // A subscription confirmed after its start date goes live now, so its first invoice is drafted right away.
  let message = result.message;
  if (action === "CONFIRM" && result.data?.status === "ACTIVE") {
    const run = await runBilling(businessToday(), { trigger: "confirm", userId: user.id, subscriptionIds: [id] });
    if (run.invoicesCreated) message = `${message} First invoice drafted.`;
  }
  revalidate(id);
  revalidatePath("/invoices");
  return ok(message);
}

/** Switches an add-on on for a running subscription. It is billed from the next invoice; nothing is prorated. */
export async function addSubscriptionLine(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireBackOffice();
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const sub = await db.subscription.findUnique({ where: { id }, include: { plan: true, lines: { select: { sequence: true } } } });
  if (!sub) return fail("Subscription not found.");
  if (sub.status !== "ACTIVE" && sub.status !== "PAUSED") return fail("Lines can be switched on here only while the subscription runs.");

  const resolved = await resolveLines({ plan: sub.plan, lines: [parsed.data] });
  if (!resolved.ok) {
    const errors = Object.fromEntries(Object.entries(resolved.errors).map(([k, v]) => [k.replace(/^lines\.0\./, ""), v]));
    return fail(FIX, errors);
  }
  const line = resolved.lines[0];
  if (sub.recurringAmount + line.quantity * line.unitPrice > MAX_RECURRING_AMOUNT) return fail("That would bill more than one period can hold.");

  await db.$transaction(async (tx) => {
    await lockSubscription(tx, id);
    await tx.subscriptionLine.create({
      data: {
        subscriptionId: id,
        productId: line.productId,
        variantId: line.variantId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        isPlanLine: false,
        sequence: Math.max(0, ...sub.lines.map((l) => l.sequence)) + 1,
        taxes: { connect: line.taxIds.map((t) => ({ id: t })) },
      },
    });
    await recomputeRecurring(tx, id);
    await logActivity(
      {
        entityType: "subscription",
        entityId: id,
        action: "line_added",
        message: `Line added: ${line.description} × ${line.quantity} at ${formatMoney(line.unitPrice)}, billed from the next invoice`,
        userId: user.id,
      },
      tx,
    );
  });
  revalidate(id);
  return ok(`${line.description} added. It is billed from the next invoice.`);
}

export async function removeSubscriptionLine(id: string, lineId: string): Promise<ActionResult> {
  const user = await requireBackOffice();
  const line = await db.subscriptionLine.findFirst({ where: { id: lineId, subscriptionId: id }, include: { subscription: true } });
  if (!line) return fail("That line is already gone.");
  if (line.isPlanLine) return fail("The plan's own line can't be removed.");
  if (line.subscription.status !== "ACTIVE" && line.subscription.status !== "PAUSED") return fail("Edit the draft to change its lines.");

  await db.$transaction(async (tx) => {
    await lockSubscription(tx, id);
    await tx.subscriptionLine.delete({ where: { id: lineId } });
    await recomputeRecurring(tx, id);
    await logActivity(
      { entityType: "subscription", entityId: id, action: "line_removed", message: `Line removed: ${line.description}. No longer billed from the next invoice`, userId: user.id },
      tx,
    );
  });
  revalidate(id);
  return ok(`${line.description} removed.`);
}

/** Admin only: bills this one subscription up to a date, handy for demos. */
export async function billUpTo(id: string, asOfIso: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const asOf = tryParseDate(asOfIso);
  if (!asOf) return fail("Choose a valid date.");
  const r = await runBilling(asOf, { trigger: "subscription", userId: admin.id, subscriptionIds: [id] });
  revalidate(id);
  revalidatePath("/invoices");
  if (r.errors.length) return fail(r.errors[0].error);
  return ok(r.invoicesCreated === 0 ? "Nothing new to bill up to that date." : `${r.invoicesCreated} draft invoice${r.invoicesCreated === 1 ? "" : "s"} created.`);
}
