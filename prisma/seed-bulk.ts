// Bulk seed (PLAN.md Phase 7): ~3k customers, ~10k subscriptions across plans and states, and a year of
// invoices and payments, some of them overdue. Billing days are spread over days 1–28 of the month, so a
// few hundred subscriptions come due on any given day. Everything is inserted with createMany in chunks.
// Run `npm run seed` first (it creates the catalog). Safe to run twice: it stops if the bulk data exists.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { fakerEN_IN as faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type InvoiceStatus,
  type PaymentMethod,
  type Prisma,
  type SubscriptionStatus,
} from "../src/generated/prisma/client";
import { periodAt } from "../src/lib/billing/invoice";
import { calcLine, type TaxRule } from "../src/lib/billing/totals";
import { addDays, addMonthsClamped, businessToday } from "../src/lib/dates";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CUSTOMERS = 3000;
const SUBSCRIPTIONS = 10_000;
const DOMAIN = "@bulk.example";
const CHUNK = 5000;

faker.seed(20261031);
const rand = () => faker.number.float({ min: 0, max: 1 });
const int = (min: number, max: number) => faker.number.int({ min, max });
const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)];
const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

async function chunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, label: string) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
  log(`${rows.length.toLocaleString()} ${label}`);
}

/** Reserves `count` numbers in a sequence in one statement (so the app can keep numbering meanwhile); returns the first. */
async function reserve(key: string, count: number): Promise<number> {
  const rows = await db.$queryRaw<{ first: number }[]>`
    INSERT INTO "Sequence" ("key", "next") VALUES (${key}, ${count + 1})
    ON CONFLICT ("key") DO UPDATE SET "next" = "Sequence"."next" + ${count}
    RETURNING "next" - ${count} AS first`;
  return Number(rows[0].first);
}

const STATUS_MIX: [SubscriptionStatus, number][] = [
  ["ACTIVE", 0.8],
  ["PAUSED", 0.04],
  ["CLOSED", 0.08],
  ["QUOTATION", 0.03],
  ["DRAFT", 0.03],
  ["CONFIRMED", 0.02],
];
function pickStatus(): SubscriptionStatus {
  let r = rand();
  for (const [s, p] of STATUS_MIX) if ((r -= p) < 0) return s;
  return "ACTIVE";
}

const METHODS: PaymentMethod[] = ["UPI", "UPI", "BANK_TRANSFER", "BANK_TRANSFER", "CARD", "CASH", "CHEQUE"];

async function main() {
  const existing = await db.customer.count({ where: { email: { endsWith: DOMAIN } } });
  if (existing >= CUSTOMERS) {
    log(`Bulk data already there (${existing} bulk customers). Nothing to do.`);
    return;
  }

  const today = businessToday();
  const plans = await db.plan.findMany({
    where: { active: true, name: { notIn: ["CRM 2027 Pricing", "Billing Suite Launch Offer"] } },
    include: { product: { include: { taxes: { where: { active: true } } } } },
  });
  const monthly = plans.filter((p) => p.period === "MONTHLY");
  const yearly = plans.filter((p) => p.period !== "MONTHLY");
  const addons = await db.product.findMany({ where: { isAddon: true, active: true }, include: { taxes: { where: { active: true } } } });
  const terms = await db.paymentTerm.findMany();
  if (monthly.length === 0 || terms.length === 0) throw new Error("Run `npm run seed` first: no plans or payment terms found.");

  // ───────────── Customers ─────────────
  const customers = Array.from({ length: CUSTOMERS }, (_, i) => {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const company = faker.company.name();
    return {
      id: randomUUID(),
      name: `${first} ${last}`,
      company,
      email: `${first}.${last}.${i}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + DOMAIN,
      phone: `+91 9${int(100000000, 999999999)}`,
      addressLine1: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      postalCode: String(int(110001, 855999)),
      country: "India",
      taxId: rand() < 0.6 ? `29${faker.string.alphanumeric({ length: 13, casing: "upper" })}` : null,
    };
  });
  await chunked(customers, (c) => db.customer.createMany({ data: c }), "customers");

  // ───────────── Subscriptions & lines ─────────────
  const year = today.getUTCFullYear();
  let subNo = await reserve(`SUB/${year}`, SUBSCRIPTIONS);
  const subs: Prisma.SubscriptionCreateManyInput[] = [];
  const lines: Prisma.SubscriptionLineCreateManyInput[] = [];
  const lineTaxes: { a: string; b: string }[] = [];
  type BillPlan = {
    sub: Prisma.SubscriptionCreateManyInput & { id: string };
    plan: (typeof plans)[number];
    customer: (typeof customers)[number];
    dueDays: number;
    lines: { productId: string; description: string; quantity: number; unitPrice: number; taxes: TaxRule[] }[];
    until: Date; // bill periods that start on or before this date
  };
  const toBill: BillPlan[] = [];

  for (let i = 0; i < SUBSCRIPTIONS; i++) {
    const status = pickStatus();
    const plan = rand() < 0.92 || yearly.length === 0 ? pick(monthly) : pick(yearly);
    const customer = customers[i % CUSTOMERS];
    const term = pick(terms);

    // Start: running/closed ones in the past 12 months on day 1–28; the rest around today or later.
    let start: Date;
    if (status === "ACTIVE" || status === "PAUSED" || status === "CLOSED") {
      start = new Date(Date.UTC(year, today.getUTCMonth() - int(0, 11), int(1, 28)));
      if (start > today) start = addMonthsClamped(start, -1);
    } else if (status === "CONFIRMED") start = addDays(today, int(1, 30));
    else start = addDays(today, int(0, 20));
    const expiry = addMonthsClamped(start, 12);

    const id = randomUUID();
    const subLines: BillPlan["lines"] = [];
    const addLine = (productId: string, description: string, quantity: number, unitPrice: number, taxes: { id: string; name: string; kind: "PERCENT" | "FIXED"; rate: number }[], isPlanLine: boolean) => {
      const lineId = randomUUID();
      lines.push({ id: lineId, subscriptionId: id, productId, description, quantity, unitPrice, isPlanLine, sequence: subLines.length });
      for (const t of taxes) lineTaxes.push({ a: lineId, b: t.id });
      subLines.push({ productId, description, quantity, unitPrice, taxes: taxes.map((t) => ({ name: t.name, kind: t.kind, rate: t.rate })) });
    };
    addLine(plan.productId, plan.product.name, int(plan.minQuantity, plan.minQuantity + 20), plan.price, plan.product.taxes, true);
    const extra = int(0, 2);
    for (const addon of faker.helpers.arrayElements(addons, Math.min(extra, addons.length))) {
      addLine(addon.id, addon.name, int(1, 3), addon.salesPrice, addon.taxes, false);
    }

    const running = status === "ACTIVE" || status === "PAUSED" || status === "CLOSED";
    const pausedAt = status === "PAUSED" ? addDays(start, int(0, Math.max(0, Math.round((today.getTime() - start.getTime()) / 86_400_000)))) : null;
    const closedAt = status === "CLOSED" ? addDays(start, int(1, Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000)))) : null;
    const sub = {
      id,
      number: `SUB/${year}/${String(subNo++).padStart(5, "0")}`,
      customerId: customer.id,
      planId: plan.id,
      status,
      startDate: start,
      expiryDate: expiry,
      validUntil: status === "QUOTATION" ? addDays(today, int(5, 30)) : status === "DRAFT" ? addDays(today, 30) : null,
      validityDays: 30,
      paymentTermId: term.id,
      nextInvoiceDate: null as Date | null,
      cycleStart: running ? start : null,
      recurringAmount: subLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      pausedAt,
      closedAt: closedAt && closedAt > today ? today : closedAt,
      closeReason: status === "CLOSED" ? pick(["Moved to a competitor", "Budget cuts", "No longer needed", "Merged accounts"]) : null,
    };
    subs.push(sub);
    if (running) {
      const until = status === "ACTIVE" ? today : status === "PAUSED" ? pausedAt! : addDays(sub.closedAt!, -1);
      toBill.push({ sub, plan, customer, dueDays: term.dueDays, lines: subLines, until });
    }
  }

  // ───────────── Invoices, lines & payments ─────────────
  type InvoiceRow = Prisma.InvoiceCreateManyInput & { id: string; invoiceDate: Date };
  const invoices: InvoiceRow[] = [];
  const invoiceLines: Prisma.InvoiceLineCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];

  for (const b of toBill) {
    const anchor = b.sub.startDate as Date;
    const expiry = b.sub.expiryDate as Date;
    const c = b.customer;
    const snapshot = {
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      addressLine1: c.addressLine1,
      addressLine2: null,
      city: c.city,
      state: c.state,
      postalCode: c.postalCode,
      country: c.country,
      taxId: c.taxId,
    };
    let next = anchor;
    while (next <= b.until && next < expiry) {
      const period = periodAt(anchor, b.plan.period, b.plan.interval, next);
      const built = b.lines.map((l) => ({ ...l, ...calcLine(l) }));
      const untaxed = built.reduce((s, l) => s + l.subtotal, 0);
      const taxTotal = built.reduce((s, l) => s + l.taxAmount, 0);
      const total = untaxed + taxTotal;
      const invoiceDate = period.start;
      const dueDate = addDays(invoiceDate, b.dueDays);
      const id = randomUUID();

      let status: InvoiceStatus = "CONFIRMED";
      let amountPaid = 0;
      if (invoiceDate.getTime() === today.getTime()) status = "DRAFT";
      else if (rand() < 0.02) status = "CANCELLED";
      else {
        const paidChance = dueDate < addDays(today, -30) ? 0.92 : dueDate < today ? 0.7 : 0.4;
        const payDate = () => {
          const d = addDays(invoiceDate, int(0, b.dueDays + 10));
          return d > today ? today : d;
        };
        if (rand() < paidChance) {
          status = "PAID";
          amountPaid = total;
          payments.push({ id: randomUUID(), invoiceId: id, method: pick(METHODS), amount: total, paymentDate: payDate() });
        } else if (rand() < 0.05 && total > 1) {
          amountPaid = Math.floor(total / 2);
          payments.push({ id: randomUUID(), invoiceId: id, method: pick(METHODS), amount: amountPaid, paymentDate: payDate(), note: "Part payment" });
        }
      }

      invoices.push({
        id,
        number: null,
        subscriptionId: b.sub.id,
        customerId: c.id,
        status,
        periodStart: period.start,
        periodEnd: period.end,
        invoiceDate,
        dueDate,
        untaxed,
        discountTotal: 0,
        taxTotal,
        total,
        amountPaid,
        amountDue: status === "CANCELLED" ? 0 : total - amountPaid,
        customerSnapshot: snapshot,
        confirmedAt: status === "DRAFT" ? null : invoiceDate,
        cancelledAt: status === "CANCELLED" ? invoiceDate : null,
      });
      built.forEach((l, sequence) =>
        invoiceLines.push({
          invoiceId: id,
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.amount,
          discountAmount: 0,
          subtotal: l.subtotal,
          taxAmount: l.taxAmount,
          total: l.total,
          taxSnapshot: l.taxes,
          sequence,
        }),
      );
      next = period.next;
    }
    // Billing carries on from the next period; a closed one has nothing more to bill.
    if (b.sub.status !== "CLOSED") b.sub.nextInvoiceDate = next;
  }

  // Invoice numbers: gap-free per year, in date order, continuing each year's sequence.
  const numbered = invoices.filter((i) => i.status !== "DRAFT").sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());
  const perYear = new Map<number, number>();
  for (const inv of numbered) perYear.set(inv.invoiceDate.getUTCFullYear(), (perYear.get(inv.invoiceDate.getUTCFullYear()) ?? 0) + 1);
  const counters = new Map<number, number>();
  for (const [y, count] of perYear) counters.set(y, await reserve(`INV/${y}`, count));
  for (const inv of numbered) {
    const y = inv.invoiceDate.getUTCFullYear();
    const n = counters.get(y)!;
    inv.number = `INV/${y}/${String(n).padStart(5, "0")}`;
    counters.set(y, n + 1);
  }
  log(`built ${subs.length.toLocaleString()} subscriptions, ${invoices.length.toLocaleString()} invoices, ${payments.length.toLocaleString()} payments in memory`);

  await chunked(subs, (c) => db.subscription.createMany({ data: c }), "subscriptions");
  await chunked(lines, (c) => db.subscriptionLine.createMany({ data: c }), "subscription lines");
  await chunked(
    lineTaxes,
    (c) =>
      db.$executeRaw`INSERT INTO "_SubscriptionLineTaxes" ("A", "B") SELECT * FROM unnest(${c.map((x) => x.a)}::text[], ${c.map((x) => x.b)}::text[]) ON CONFLICT DO NOTHING`,
    "line taxes",
  );
  await chunked(invoices, (c) => db.invoice.createMany({ data: c }), "invoices");
  await chunked(invoiceLines, (c) => db.invoiceLine.createMany({ data: c }), "invoice lines");
  await chunked(payments, (c) => db.payment.createMany({ data: c }), "payments");
  log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
