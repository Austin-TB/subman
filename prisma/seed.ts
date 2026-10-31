// Demo seed. Safe to run more than once: every record is looked up before it is created.
// Phase 2 extends it with the Brightloop catalog.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type Role, type TaxKind } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

export const DEMO_PASSWORD = "Demo@12345";

async function seedTaxes() {
  const taxes: { name: string; kind: TaxKind; rate: number }[] = [
    { name: "GST 18%", kind: "PERCENT", rate: 1800 },
    { name: "GST 5%", kind: "PERCENT", rate: 500 },
    { name: "GST 12%", kind: "PERCENT", rate: 1200 },
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

async function main() {
  await seedTaxes();
  await seedPaymentTerms();
  await seedUser("Austin", "admin@brightloop.test", "ADMIN");
  await seedUser("Sam Staff", "staff@brightloop.test", "STAFF");
  await seedUser("Chris Customer", "customer@brightloop.test", "CUSTOMER", {
    company: "Acme Retail Pvt Ltd",
    phone: "+91 98765 43210",
    city: "Bengaluru",
  });
  console.log(`Seed done. Demo logins (password ${DEMO_PASSWORD}):`);
  console.log("  admin@brightloop.test · staff@brightloop.test · customer@brightloop.test");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
