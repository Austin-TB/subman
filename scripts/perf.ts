// Page timing check (PLAN.md Phase 7): logs in as admin and as the demo customer, opens every main page of a
// running production build twice and reports the second (warm) time. Fails if a page isn't 200 or takes over 2 s.
//
//   npm run build && PORT=3100 BETTER_AUTH_URL=http://localhost:3100 npx next start -p 3100
//   BASE_URL=http://localhost:3100 npm run perf
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PASSWORD = "Demo@12345";
const BUDGET_MS = 2000;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/** Signs in through Better Auth and returns the Cookie header for the session. Once per role: 3 sign-ins per 10 s. */
async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`Sign-in as ${email} failed: ${res.status} ${await res.text()}`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (cookies.length === 0) throw new Error(`Sign-in as ${email} returned no session cookie`);
  return cookies.join("; ");
}

type Result = { area: string; path: string; status: number; ms: number; max: number };

async function time(cookie: string, path: string): Promise<{ status: number; ms: number }> {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: "manual" });
  await res.arrayBuffer(); // the whole page, not just the headers
  return { status: res.status, ms: performance.now() - started };
}

async function measure(area: string, cookie: string, paths: string[]): Promise<Result[]> {
  const out: Result[] = [];
  for (const path of paths) {
    const first = await time(cookie, path); // warms caches and the route's code
    const second = await time(cookie, path);
    out.push({ area, path, status: second.status, ms: second.ms, max: Math.max(first.ms, second.ms) });
  }
  return out;
}

async function main() {
  // Sample records to open detail pages for.
  const [customer, subscription, invoice, demoUser] = await Promise.all([
    db.customer.findFirst({ where: { subscriptions: { some: {} } }, select: { id: true } }),
    db.subscription.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }),
    db.invoice.findFirst({ where: { status: "CONFIRMED" }, select: { id: true } }),
    db.user.findUnique({ where: { email: "customer@brightloop.test" }, select: { customerId: true } }),
  ]);
  const ownCustomerId = demoUser?.customerId ?? "";
  const [ownSubscription, ownInvoice] = await Promise.all([
    db.subscription.findFirst({ where: { customerId: ownCustomerId, status: { not: "DRAFT" } }, select: { id: true } }),
    db.invoice.findFirst({ where: { customerId: ownCustomerId, status: { in: ["CONFIRMED", "PAID"] } }, select: { id: true } }),
  ]);
  const counts = await Promise.all([db.customer.count(), db.subscription.count(), db.invoice.count(), db.payment.count()]);
  await db.$disconnect();

  console.log(`Base URL: ${BASE}`);
  console.log(`Data: ${counts[0].toLocaleString()} customers, ${counts[1].toLocaleString()} subscriptions, ${counts[2].toLocaleString()} invoices, ${counts[3].toLocaleString()} payments\n`);

  const backOffice = [
    "/dashboard",
    "/dashboard?from=2026-01-01&to=2026-10-31",
    "/subscriptions",
    "/subscriptions?status=ACTIVE",
    "/subscriptions?q=SUB",
    subscription && `/subscriptions/${subscription.id}`,
    "/subscriptions/new",
    "/customers",
    "/customers?q=a",
    customer && `/customers/${customer.id}`,
    "/invoices",
    "/invoices?show=OVERDUE",
    invoice && `/invoices/${invoice.id}`,
    "/payments",
    "/billing",
    "/catalog/products",
    "/catalog/plans",
    invoice && `/print/invoices/${invoice.id}`,
  ].filter((p): p is string => !!p);

  const portal = [
    "/portal",
    "/portal/subscriptions",
    "/portal/invoices",
    ownSubscription && `/portal/subscriptions/${ownSubscription.id}`,
    ownInvoice && `/portal/invoices/${ownInvoice.id}`,
  ].filter((p): p is string => !!p);

  const admin = await signIn("admin@brightloop.test");
  const customerCookie = await signIn("customer@brightloop.test");

  const results = [...(await measure("admin", admin, backOffice)), ...(await measure("customer", customerCookie, portal))];

  const width = Math.max(...results.map((r) => r.path.length), 4);
  console.log(`${"Area".padEnd(9)}${"Page".padEnd(width + 2)}${"Status".padStart(6)}${"Warm ms".padStart(10)}${"Max ms".padStart(9)}`);
  for (const r of results) {
    const flag = r.status !== 200 ? "  ✗ status" : r.ms > BUDGET_MS ? "  ✗ slow" : "";
    console.log(
      `${r.area.padEnd(9)}${r.path.padEnd(width + 2)}${String(r.status).padStart(6)}${r.ms.toFixed(0).padStart(10)}${r.max.toFixed(0).padStart(9)}${flag}`,
    );
  }

  const slowest = results.reduce((a, b) => (b.ms > a.ms ? b : a));
  const average = results.reduce((s, r) => s + r.ms, 0) / results.length;
  console.log(`\nSlowest: ${slowest.path} at ${slowest.ms.toFixed(0)} ms · average ${average.toFixed(0)} ms over ${results.length} pages`);

  const failed = results.filter((r) => r.status !== 200 || r.ms > BUDGET_MS);
  if (failed.length > 0) {
    console.error(`${failed.length} page(s) failed: not 200, or slower than ${BUDGET_MS} ms.`);
    process.exit(1);
  }
  console.log(`All pages returned 200 in under ${BUDGET_MS} ms.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
