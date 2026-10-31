import "server-only";
import { fail, ok, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { recurringAmount } from "@/lib/billing/pricing";
import { calcTotals } from "@/lib/billing/totals";
import { addDays, addPeriod, businessToday, formatDate, formatPeriod } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { quotationEmail } from "@/lib/email-templates";
import { sendEmail, type EmailInput } from "@/lib/mailer";
import {
  REASON,
  checkTransition,
  factsOf,
  renewedExpiry,
  type SubAction,
  type SubscriptionStatus,
} from "@/lib/subscriptions/transitions";

/** Who is asking. The staff screens, the customer portal and the billing run all come through here. */
export type Actor =
  | { kind: "staff"; userId: string }
  | { kind: "customer"; userId: string; customerId: string }
  | { kind: "system" };

/**
 * Takes the subscription's row lock until the transaction ends, so two people (or a person and the billing
 * run) can't change the same subscription at once. Call it first inside every transaction that writes one.
 */
export async function lockSubscription(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${id} FOR UPDATE`;
}

/** Adds the lines up again into `recurringAmount`, which the dashboard reads instead of the lines. */
export async function recomputeRecurring(tx: Tx, subscriptionId: string): Promise<number> {
  const lines = await tx.subscriptionLine.findMany({
    where: { subscriptionId },
    select: { quantity: true, unitPrice: true },
  });
  const amount = recurringAmount(lines);
  await tx.subscription.update({ where: { id: subscriptionId }, data: { recurringAmount: amount } });
  return amount;
}

type Done = { status: SubscriptionStatus; message: string; email?: EmailInput };

/**
 * Moves a subscription through its lifecycle (PLAN.md §4.1). The row is locked, the rules in transitions.ts are
 * checked against what is stored right now, and the change and its timeline entry are written together.
 * A customer can only act on their own subscription; anyone else's looks like it doesn't exist.
 */
export async function transitionSubscription(args: {
  id: string;
  action: SubAction;
  actor: Actor;
  reason?: string | null;
  today?: Date;
}): Promise<ActionResult<{ status: SubscriptionStatus }>> {
  const { id, action, actor } = args;
  const today = args.today ?? businessToday();
  const reason = args.reason?.trim().slice(0, 500) || null;
  const userId = actor.kind === "system" ? null : actor.userId;

  const result = await db.$transaction(async (tx): Promise<ActionResult<Done>> => {
    await lockSubscription(tx, id);
    const sub = await tx.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        customer: { select: { name: true, email: true } },
        lines: { orderBy: { sequence: "asc" }, include: { taxes: true } },
      },
    });
    if (!sub || (actor.kind === "customer" && sub.customerId !== actor.customerId)) return fail("Subscription not found.");

    const verdict = checkTransition(action, factsOf(sub), sub.plan, actor.kind, today);
    if (!verdict.ok) return fail(verdict.reason);
    if (REASON[action] === "required" && !reason) {
      return fail("Say why, so the team can see it later.", { reason: ["Enter a reason"] });
    }

    const log = (name: string, message: string) =>
      logActivity({ entityType: "subscription", entityId: id, action: name, message, userId }, tx);
    const closeFields = { status: "CLOSED", closedAt: today, nextInvoiceDate: null, closeReason: reason } as const;

    /** Goes live: the first invoice is dated the start date. */
    const activate = async () => {
      await tx.subscription.update({
        where: { id },
        data: { status: "ACTIVE", nextInvoiceDate: sub.startDate, cycleStart: sub.startDate },
      });
      await log("activated", `Active since ${formatDate(sub.startDate)}. The first invoice is dated ${formatDate(sub.startDate)}`);
    };

    let status = verdict.to;
    let message: string;
    let email: EmailInput | undefined;

    switch (action) {
      case "SEND_QUOTATION": {
        const validUntil = addDays(today, sub.validityDays);
        await tx.subscription.update({ where: { id }, data: { status: "QUOTATION", validUntil } });
        await log("quotation_sent", `Quotation sent to ${sub.customer.email}, valid until ${formatDate(validUntil)}`);
        const totals = calcTotals(
          sub.lines.map((l) => ({
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxes: l.taxes.map((t) => ({ name: t.name, kind: t.kind, rate: t.rate })),
          })),
        );
        message = `Quotation sent to ${sub.customer.email}.`;
        email = {
          to: sub.customer.email,
          ...quotationEmail({
            name: sub.customer.name,
            number: sub.number,
            planName: sub.plan.name,
            startDate: sub.startDate,
            expiryDate: sub.expiryDate,
            validUntil,
            lines: sub.lines.map((l, i) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: totals.lines[i].amount,
            })),
            untaxed: totals.untaxed,
            tax: totals.taxTotal,
            total: totals.total,
            periodLabel: formatPeriod(sub.plan.period, sub.plan.interval),
          }),
        };
        break;
      }

      case "EDIT":
        await tx.subscription.update({ where: { id }, data: { status: "DRAFT" } });
        await log("reopened", "Reopened for editing");
        message = "Back to draft. You can edit it now.";
        break;

      case "CONFIRM": {
        await tx.subscription.update({ where: { id }, data: { status: "CONFIRMED" } });
        await log("confirmed", "Confirmed");
        // One that has already started goes live straight away; otherwise the billing run activates it.
        const activation = checkTransition("ACTIVATE", { ...factsOf(sub), status: "CONFIRMED" }, sub.plan, "system", today);
        if (activation.ok) {
          await activate();
          status = "ACTIVE";
          message = "Confirmed. The subscription is active.";
        } else {
          message = `Confirmed. It becomes active on ${formatDate(sub.startDate)}.`;
        }
        break;
      }

      case "ACTIVATE":
        await activate();
        message = "Activated.";
        break;

      case "PAUSE":
        await tx.subscription.update({ where: { id }, data: { status: "PAUSED", pausedAt: today } });
        await log("paused", "Paused. Nothing is billed until it resumes");
        message = "Paused. Nothing will be billed until it is resumed.";
        break;

      case "RESUME": {
        // The billing cycle restarts today. If an invoice already starts today (paused and resumed the same day),
        // that period is taken and billing carries on from the next one.
        const taken = await tx.invoice.findFirst({ where: { subscriptionId: id, periodStart: today }, select: { id: true } });
        const nextInvoiceDate = taken ? addPeriod(today, sub.plan.period, sub.plan.interval) : today;
        await tx.subscription.update({
          where: { id },
          data: { status: "ACTIVE", pausedAt: null, cycleStart: today, nextInvoiceDate },
        });
        await log("resumed", `Resumed. Billing restarts on ${formatDate(nextInvoiceDate)}`);
        message = "Resumed.";
        break;
      }

      case "RENEW": {
        const current = sub.expiryDate!; // checkTransition hides Renew when there is no expiry date
        const initial = sub.initialExpiryDate ?? current;
        const expiry = renewedExpiry({ start: sub.startDate, initialExpiry: initial, expiry: current, today });
        await tx.subscription.update({ where: { id }, data: { expiryDate: expiry, initialExpiryDate: initial } });
        await log("renewed", `Renewed. Expiry ${formatDate(current)} → ${formatDate(expiry)}`);
        message = `Renewed until ${formatDate(expiry)}.`;
        break;
      }

      case "CLOSE":
        await tx.subscription.update({ where: { id }, data: closeFields });
        await log("closed", reason ? `Closed: ${reason}` : "Closed");
        message = "Closed.";
        break;

      case "AUTO_CLOSE":
        await tx.subscription.update({ where: { id }, data: { ...closeFields, closeReason: "Reached its expiry date" } });
        await log("closed", `Closed automatically: it expired on ${formatDate(sub.expiryDate)}`);
        message = "Closed at expiry.";
        break;

      case "CANCEL":
        await tx.subscription.update({ where: { id }, data: closeFields });
        await log("cancelled", `Cancelled: ${reason}`);
        message = "Cancelled.";
        break;
    }

    return ok(undefined, { status, message, email });
  });

  if (!result.ok) return result;
  const { status, message, email } = result.data!;
  // The email goes out once the change is saved. sendEmail never throws: a failure shows up in the Outbox.
  if (email) await sendEmail(email);
  return ok(message, { status });
}
