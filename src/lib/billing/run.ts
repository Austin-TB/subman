import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/lib/activity";
import { buildInvoice, periodAt, type DiscountRuleInput } from "@/lib/billing/invoice";
import { addDays, formatDate } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { isDiscountLive } from "@/lib/discounts";
import { formatMoney } from "@/lib/money";
import { lockSubscription, transitionSubscription } from "@/lib/subscriptions/service";

type LoadedRule = DiscountRuleInput & {
  active: boolean;
  startDate: Date;
  endDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
};

async function loadRules(): Promise<LoadedRule[]> {
  const rules = await db.discount.findMany({ where: { active: true }, include: { products: { select: { id: true } } } });
  return rules.map(({ products, ...r }) => ({ ...r, productIds: products.map((p) => p.id) }));
}

/** Claims one use of a rule. The guarded update means two invoices can't both take the last use. */
async function claimUse(tx: Tx, discountId: string): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "Discount" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
    WHERE "id" = ${discountId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
  return n === 1;
}

/**
 * Bills every period of one subscription that starts on or before `asOf` (and before its expiry), each as a
 * Draft invoice. Must run inside a transaction: the row lock makes overlapping runs wait, and the unique index
 * on (subscriptionId, periodStart) rejects a duplicate even if something else goes wrong.
 */
export async function billSubscription(tx: Tx, id: string, asOf: Date, rules: LoadedRule[], userId: string | null) {
  await lockSubscription(tx, id);
  const sub = await tx.subscription.findUnique({
    where: { id },
    include: {
      plan: true,
      paymentTerm: true,
      customer: true,
      lines: { orderBy: { sequence: "asc" }, include: { taxes: true } },
    },
  });
  if (!sub || sub.status !== "ACTIVE" || !sub.nextInvoiceDate) return 0;

  const anchor = sub.cycleStart ?? sub.startDate;
  let next: Date = sub.nextInvoiceDate;
  let created = 0;
  const snapshot = {
    name: sub.customer.name,
    company: sub.customer.company,
    email: sub.customer.email,
    phone: sub.customer.phone,
    addressLine1: sub.customer.addressLine1,
    addressLine2: sub.customer.addressLine2,
    city: sub.customer.city,
    state: sub.customer.state,
    postalCode: sub.customer.postalCode,
    country: sub.customer.country,
    taxId: sub.customer.taxId,
  };

  while (next <= asOf && (!sub.expiryDate || next < sub.expiryDate) && created < 400) {
    const period = periodAt(anchor, sub.plan.period, sub.plan.interval, next);
    const billLines = sub.lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxes: l.taxes.map((t) => ({ name: t.name, kind: t.kind, rate: t.rate })),
    }));

    // Live rules on the invoice date. A rule that runs out while we claim it is dropped and the invoice rebuilt.
    let live = rules.filter((r) => isDiscountLive(r, period.start));
    let built = buildInvoice(billLines, live);
    for (let attempt = 0; attempt < 5 && built.usages.length > 0; attempt++) {
      const lost: string[] = [];
      for (const u of built.usages) if (!(await claimUse(tx, u.discountId))) lost.push(u.discountId);
      if (lost.length === 0) break;
      // Give back what we did claim, drop the rules that ran out, and try again.
      for (const u of built.usages) {
        if (!lost.includes(u.discountId)) {
          await tx.$executeRaw`UPDATE "Discount" SET "usedCount" = "usedCount" - 1 WHERE "id" = ${u.discountId}`;
        }
      }
      live = live.filter((r) => !lost.includes(r.id));
      built = buildInvoice(billLines, live);
    }
    for (const u of built.usages) {
      const r = rules.find((x) => x.id === u.discountId);
      if (r) r.usedCount++;
    }

    const invoice = await tx.invoice.create({
      data: {
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: "DRAFT",
        periodStart: period.start,
        periodEnd: period.end,
        invoiceDate: period.start,
        dueDate: addDays(period.start, sub.paymentTerm.dueDays),
        untaxed: built.untaxed,
        discountTotal: built.discountTotal,
        taxTotal: built.taxTotal,
        total: built.total,
        amountDue: built.total,
        customerSnapshot: snapshot,
        lines: {
          create: built.lines.map((l, sequence) => ({
            productId: l.productId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            discountAmount: l.discountAmount,
            discountName: l.discountName,
            subtotal: l.subtotal,
            taxAmount: l.taxAmount,
            total: l.total,
            taxSnapshot: l.taxes,
            sequence,
          })),
        },
        discountUsages: { create: built.usages },
      },
    });
    await logActivity(
      {
        entityType: "subscription",
        entityId: sub.id,
        action: "invoiced",
        message: `Draft invoice for ${formatDate(period.start)} – ${formatDate(period.end)}: ${formatMoney(invoice.total)}${
          built.discountTotal ? ` (discount ${formatMoney(built.discountTotal)})` : ""
        }`,
        userId,
      },
      tx,
    );
    next = period.next;
    created++;
  }

  if (created > 0) await tx.subscription.update({ where: { id }, data: { nextInvoiceDate: next } });
  return created;
}

export type RunSummary = { id: string; activated: number; invoicesCreated: number; closed: number; errors: { id: string; error: string }[] };

/** The billing run (PLAN.md §4.3). Each subscription is billed in its own transaction; a failure is recorded and the run goes on. */
export async function runBilling(asOf: Date, opts: { trigger: string; userId: string | null; subscriptionIds?: string[] }): Promise<RunSummary> {
  const run = await db.billingRun.create({ data: { asOf, trigger: opts.trigger, triggeredById: opts.userId } });
  const only = opts.subscriptionIds ? { id: { in: opts.subscriptionIds } } : {};
  const errors: { id: string; error: string }[] = [];
  const message = (e: unknown) => (e instanceof Error ? e.message.split("\n").slice(-1)[0] : String(e));

  // 1. Activate confirmed subscriptions that have started.
  let activated = 0;
  const toActivate = await db.subscription.findMany({ where: { ...only, status: "CONFIRMED", startDate: { lte: asOf } }, select: { id: true } });
  for (const { id } of toActivate) {
    const r = await transitionSubscription({ id, action: "ACTIVATE", actor: { kind: "system" }, today: asOf });
    if (r.ok) activated++;
    else errors.push({ id, error: r.error });
  }

  // 2. Bill what is due.
  const rules = await loadRules();
  let invoicesCreated = 0;
  const due = await db.subscription.findMany({
    where: { ...only, status: "ACTIVE", nextInvoiceDate: { lte: asOf } },
    select: { id: true },
  });
  for (const { id } of due) {
    try {
      invoicesCreated += await db.$transaction((tx) => billSubscription(tx, id, asOf, rules, opts.userId), { timeout: 30_000 });
    } catch (e) {
      const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      errors.push({ id, error: dup ? "An invoice for this period already exists" : message(e) });
    }
  }

  // 3. Close subscriptions on auto-close plans that are past expiry.
  let closed = 0;
  const expired = await db.subscription.findMany({
    where: { ...only, status: { in: ["ACTIVE", "PAUSED"] }, expiryDate: { lt: asOf }, plan: { autoClose: true } },
    select: { id: true },
  });
  for (const { id } of expired) {
    const r = await transitionSubscription({ id, action: "AUTO_CLOSE", actor: { kind: "system" }, today: asOf });
    if (r.ok) closed++;
  }

  await db.billingRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), activated, invoicesCreated, closed, errorCount: errors.length, errors: errors.slice(0, 200) },
  });
  return { id: run.id, activated, invoicesCreated, closed, errors };
}
