// Demo seed. Safe to run more than once: every record is looked up before it is created,
// and a record that already exists is left exactly as it is (so edits made in the app survive a re-seed).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type BillingPeriod, type ProductType, type Role, type TaxKind } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

export const DEMO_PASSWORD = "Demo@12345";

async function seedTaxes() {
  const taxes: { name: string; kind: TaxKind; rate: number }[] = [
    { name: "GST 18%", kind: "PERCENT", rate: 1800 },
    { name: "GST 5%", kind: "PERCENT", rate: 500 },
    { name: "GST 12%", kind: "PERCENT", rate: 1200 },
    // A fixed amount per unit, to show the second kind of tax. Not a default on any product.
    { name: "Handling fee", kind: "FIXED", rate: 500 },
  ];
  for (const t of taxes) {
    const existing = await db.tax.findFirst({ where: { name: t.name } });
    if (!existing) await db.tax.create({ data: t });
  }
}

async function seedPaymentTerms() {
  const terms = [
    { name: "Immediate", dueDays: 0 },
    { name: "Net 15", dueDays: 15 },
    { name: "Net 30", dueDays: 30 },
  ];
  for (const t of terms) {
    await db.paymentTerm.upsert({ where: { name: t.name }, update: {}, create: t });
  }
}

// ───────────────────────── Catalog ─────────────────────────

/** Rupees → minor units. */
const inr = (rupees: number) => rupees * 100;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function seedProduct(p: {
  name: string;
  type?: ProductType;
  isAddon?: boolean;
  price: number;
  cost: number;
  notes?: string;
  taxes: string[];
}) {
  const existing = await db.product.findFirst({ where: { name: p.name } });
  if (existing) return existing;
  const taxes = await db.tax.findMany({ where: { name: { in: p.taxes } }, select: { id: true } });
  return db.product.create({
    data: {
      name: p.name,
      type: p.type ?? "SERVICE",
      isAddon: p.isAddon ?? false,
      salesPrice: inr(p.price),
      costPrice: inr(p.cost),
      notes: p.notes,
      taxes: { connect: taxes },
    },
  });
}

async function seedPlan(p: {
  name: string;
  productId: string;
  price: number;
  period: BillingPeriod;
  minQuantity?: number;
  from?: string;
  until?: string;
  autoClose?: boolean;
  closable?: boolean;
  pausable?: boolean;
  renewable?: boolean;
}) {
  const existing = await db.plan.findFirst({ where: { name: p.name } });
  if (existing) return existing;
  return db.plan.create({
    data: {
      name: p.name,
      productId: p.productId,
      price: inr(p.price),
      period: p.period,
      minQuantity: p.minQuantity ?? 1,
      availableFrom: day(p.from ?? "2026-01-01"),
      availableUntil: p.until ? day(p.until) : null,
      autoClose: p.autoClose ?? false,
      closable: p.closable ?? true,
      pausable: p.pausable ?? false,
      renewable: p.renewable ?? false,
    },
  });
}

async function seedTemplate(t: {
  name: string;
  planId: string;
  validityDays: number;
  /** The plan's own line first, then any add-ons. */
  lines: { productId: string; quantity: number }[];
}) {
  const existing = await db.quotationTemplate.findFirst({ where: { name: t.name } });
  if (existing) return existing;
  return db.quotationTemplate.create({
    data: {
      name: t.name,
      planId: t.planId,
      validityDays: t.validityDays,
      lines: { create: t.lines.map((l, sequence) => ({ ...l, sequence, isPlanLine: sequence === 0 })) },
    },
  });
}

/**
 * A Brightloop catalog: one flagship product, a few add-ons, a product that comes in brand variants,
 * monthly and yearly plans, ready-made quotation templates and a volume discount.
 * The "Brightloop Analytics" product from the demo script is left out on purpose, so it can be created live.
 */
async function seedCatalog() {
  // Attribute: Brand → Odoo / SAP / Zoho
  const brand = await db.attribute.upsert({ where: { name: "Brand" }, update: {}, create: { name: "Brand" } });
  const values: Record<string, string> = {};
  for (const name of ["Odoo", "SAP", "Zoho"]) {
    const value = await db.attributeValue.upsert({
      where: { attributeId_name: { attributeId: brand.id, name } },
      update: {},
      create: { attributeId: brand.id, name },
    });
    values[name] = value.id;
  }

  const billing = await seedProduct({
    name: "Brightloop Billing Suite",
    price: 2000,
    cost: 600,
    notes: "Recurring billing, invoices and payment tracking. Priced per seat.",
    taxes: ["GST 18%"],
  });
  const crm = await seedProduct({
    name: "Brightloop CRM",
    price: 1500,
    cost: 450,
    notes: "Customer records and a sales pipeline. Priced per seat.",
    taxes: ["GST 18%"],
  });
  const connector = await seedProduct({
    name: "Brightloop ERP Connector",
    price: 1000,
    cost: 300,
    notes: "Syncs customers and invoices with the customer's ERP. The brand changes the price.",
    taxes: ["GST 18%"],
  });
  const pos = await seedProduct({
    name: "POS Terminal Rental",
    type: "GOODS",
    price: 800,
    cost: 500,
    notes: "A card terminal on loan, billed with the subscription.",
    taxes: ["GST 12%"],
  });

  // Add-ons customers switch on and off
  const support = await seedProduct({ name: "Priority Support", isAddon: true, price: 500, cost: 150, taxes: ["GST 18%"] });
  const storage = await seedProduct({ name: "Extra Storage (100 GB)", isAddon: true, price: 300, cost: 80, taxes: ["GST 18%"] });
  const reports = await seedProduct({ name: "Advanced Reports", isAddon: true, price: 750, cost: 200, taxes: ["GST 18%"] });
  await seedProduct({ name: "API Access", isAddon: true, price: 1000, cost: 250, taxes: ["GST 18%"] });

  // Variants of the connector: Brand: Odoo +560 (the spec's example), SAP, Zoho
  for (const [name, extra] of [["Odoo", 560], ["SAP", 900], ["Zoho", 250]] as const) {
    await db.productVariant.upsert({
      where: { productId_attributeValueId: { productId: connector.id, attributeValueId: values[name] } },
      update: {},
      create: { productId: connector.id, attributeValueId: values[name], extraPrice: inr(extra) },
    });
  }

  // Plans: the price is per unit per period, and each plan decides what customers may do with it.
  await seedPlan({ name: "Billing Suite Starter Monthly", productId: billing.id, price: 2000, period: "MONTHLY", pausable: true });
  const business = await seedPlan({
    name: "Billing Suite Business Monthly",
    productId: billing.id,
    price: 1800,
    period: "MONTHLY",
    minQuantity: 5,
    pausable: true,
    renewable: true,
  });
  const enterprise = await seedPlan({
    name: "Billing Suite Enterprise Yearly",
    productId: billing.id,
    price: 18000,
    period: "YEARLY",
    minQuantity: 10,
    renewable: true,
    autoClose: true,
  });
  const crmMonthly = await seedPlan({ name: "CRM Monthly", productId: crm.id, price: 1500, period: "MONTHLY", pausable: true });
  await seedPlan({ name: "CRM Yearly", productId: crm.id, price: 15000, period: "YEARLY", minQuantity: 3, renewable: true });
  await seedPlan({ name: "ERP Connector Monthly", productId: connector.id, price: 1000, period: "MONTHLY" });
  await seedPlan({ name: "POS Rental Monthly", productId: pos.id, price: 800, period: "MONTHLY", pausable: true });
  // One that has ended and one that hasn't started, to show the available dates at work.
  await seedPlan({
    name: "Billing Suite Launch Offer",
    productId: billing.id,
    price: 1500,
    period: "MONTHLY",
    until: "2026-06-30",
  });
  await seedPlan({ name: "CRM 2027 Pricing", productId: crm.id, price: 1700, period: "MONTHLY", from: "2027-01-01" });

  // Quotation templates
  await seedTemplate({
    name: "Enterprise Yearly",
    planId: enterprise.id,
    validityDays: 30,
    lines: [
      { productId: billing.id, quantity: 10 },
      { productId: support.id, quantity: 1 },
      { productId: reports.id, quantity: 1 },
    ],
  });
  await seedTemplate({
    name: "Business Monthly Starter",
    planId: business.id,
    validityDays: 14,
    lines: [
      { productId: billing.id, quantity: 5 },
      { productId: storage.id, quantity: 2 },
    ],
  });
  await seedTemplate({ name: "CRM Team", planId: crmMonthly.id, validityDays: 30, lines: [{ productId: crm.id, quantity: 3 }] });

  // A volume discount on the whole subscription. It is set high on purpose: the demo creates its own
  // "10% off 20+ seats" rule live, and the two shouldn't compete on the same invoice.
  if (!(await db.discount.findFirst({ where: { name: "Volume discount: 50+ seats" } }))) {
    await db.discount.create({
      data: {
        name: "Volume discount: 50+ seats",
        kind: "PERCENT",
        value: 1000,
        scope: "SUBSCRIPTION",
        minQuantity: 50,
        startDate: day("2026-01-01"),
      },
    });
  }
}

/** Creates a login with Better Auth's password hash, so it works with the normal sign-in. */
async function seedUser(name: string, email: string, role: Role, customer?: { company?: string; phone?: string; city?: string }) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;

  const customerId = customer
    ? (
        await db.customer.create({
          data: { name, email, company: customer.company, phone: customer.phone, city: customer.city, country: "India" },
        })
      ).id
    : null;

  const id = randomUUID();
  return db.user.create({
    data: {
      id,
      name,
      email,
      emailVerified: true,
      role,
      customerId,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(DEMO_PASSWORD),
        },
      },
    },
  });
}

/** An active, pausable subscription for the demo customer, so the portal has something to show. Billing creates its invoices. */
async function seedDemoSubscription() {
  const user = await db.user.findUnique({ where: { email: "customer@brightloop.test" }, select: { customerId: true } });
  if (!user?.customerId || (await db.subscription.count({ where: { customerId: user.customerId } })) > 0) return;
  const plan = await db.plan.findFirst({
    where: { name: "CRM Monthly" },
    include: { product: { include: { taxes: { where: { active: true }, select: { id: true } } } } },
  });
  const term = await db.paymentTerm.findUnique({ where: { name: "Net 15" } });
  if (!plan || !term) return;

  // Same gap-free numbering as the app (src/lib/sequences.ts).
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("key", "next") VALUES ('SUB/2026', 2)
    ON CONFLICT ("key") DO UPDATE SET "next" = "Sequence"."next" + 1
    RETURNING "next" - 1 AS value`;
  const number = `SUB/2026/${String(rows[0].value).padStart(5, "0")}`;
  const start = day("2026-09-01");
  const quantity = 5;

  await db.subscription.create({
    data: {
      number,
      customerId: user.customerId,
      planId: plan.id,
      status: "ACTIVE",
      startDate: start,
      expiryDate: day("2027-09-01"),
      paymentTermId: term.id,
      cycleStart: start,
      nextInvoiceDate: start,
      recurringAmount: quantity * plan.price,
      lines: {
        create: {
          productId: plan.productId,
          description: plan.product.name,
          quantity,
          unitPrice: plan.price,
          isPlanLine: true,
          taxes: { connect: plan.product.taxes },
        },
      },
    },
  });
}

async function main() {
  await seedTaxes();
  await seedPaymentTerms();
  await seedCatalog();
  await seedUser("Austin", "admin@brightloop.test", "ADMIN");
  await seedUser("Sam Staff", "staff@brightloop.test", "STAFF");
  await seedUser("Chris Customer", "customer@brightloop.test", "CUSTOMER", {
    company: "Acme Retail Pvt Ltd",
    phone: "+91 98765 43210",
    city: "Bengaluru",
  });
  await seedDemoSubscription();
  console.log(`Seed done. Demo logins (password ${DEMO_PASSWORD}):`);
  console.log("  admin@brightloop.test · staff@brightloop.test · customer@brightloop.test");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
