import type { Metadata } from "next";
import Link from "next/link";
import { DateRange } from "@/components/app/date-range";
import { PageHeader } from "@/components/app/page-header";
import { ParamSelect } from "@/components/app/param-select";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { addMonthsClamped, businessToday, daysBetween, formatDate, toISODate, tryParseDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param } from "@/lib/list-params";
import { formatMoney } from "@/lib/money";
import { requireBackOffice } from "@/lib/session";
import { CountChart, MoneyByMonthChart } from "./charts";

export const metadata: Metadata = { title: "Dashboard" };

const STATUSES = ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"];
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** The finance lead's page (PLAN.md Phase 7). Every total is computed in SQL, never by loading rows. */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireBackOffice();
  const sp = await searchParams;
  const today = businessToday();
  const to = tryParseDate(param(sp, "to")) ?? today;
  const from = tryParseDate(param(sp, "from")) ?? addMonthsClamped(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)), -11);
  const planId = param(sp, "plan") || null;
  const status = STATUSES.find((s) => s === param(sp, "status")) ?? null;

  const planSub = planId ? Prisma.sql`AND s."planId" = ${planId}` : Prisma.empty;
  const planInv = planId ? Prisma.sql`AND i."subscriptionId" IN (SELECT id FROM "Subscription" WHERE "planId" = ${planId})` : Prisma.empty;
  const statusSub = status ? Prisma.sql`AND s.status = ${status}::"SubscriptionStatus"` : Prisma.empty;

  const [subs, money, overdue, months, byPlan, byStatus, overdueRows, plans] = await Promise.all([
    db.$queryRaw<{ active: bigint; mrr: number | null }[]>`
      SELECT COUNT(*) AS active,
             SUM(s."recurringAmount" * CASE p.period WHEN 'DAILY' THEN 365.0/12 WHEN 'WEEKLY' THEN 52.0/12
                                                      WHEN 'MONTHLY' THEN 1 ELSE 1.0/12 END / p.interval)::float8 AS mrr
      FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
      WHERE s.status = 'ACTIVE' ${planSub}`,
    db.$queryRaw<{ collected: bigint | null; invoiced: bigint | null; outstanding: bigint | null; outstandingCount: bigint }[]>`
      SELECT
        (SELECT SUM(pay.amount) FROM "Payment" pay JOIN "Invoice" i ON i.id = pay."invoiceId"
          WHERE pay."paymentDate" BETWEEN ${from} AND ${to} ${planInv}) AS collected,
        (SELECT SUM(i.total) FROM "Invoice" i WHERE i.status IN ('CONFIRMED','PAID') AND i."invoiceDate" BETWEEN ${from} AND ${to} ${planInv}) AS invoiced,
        (SELECT SUM(i."amountDue") FROM "Invoice" i WHERE i.status = 'CONFIRMED' ${planInv}) AS outstanding,
        (SELECT COUNT(*) FROM "Invoice" i WHERE i.status = 'CONFIRMED' AND i."amountDue" > 0 ${planInv}) AS "outstandingCount"`,
    db.$queryRaw<{ count: bigint; amount: bigint | null }[]>`
      SELECT COUNT(*) AS count, SUM(i."amountDue") AS amount FROM "Invoice" i
      WHERE i.status = 'CONFIRMED' AND i."dueDate" < ${today} AND i."amountDue" > 0 ${planInv}`,
    db.$queryRaw<{ month: Date; invoiced: bigint | null; collected: bigint | null }[]>`
      WITH m AS (SELECT generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${to}::date), interval '1 month')::date AS month)
      SELECT m.month,
        (SELECT SUM(i.total) FROM "Invoice" i WHERE i.status IN ('CONFIRMED','PAID')
           AND i."invoiceDate" >= m.month AND i."invoiceDate" < (m.month + interval '1 month') ${planInv}) AS invoiced,
        (SELECT SUM(pay.amount) FROM "Payment" pay JOIN "Invoice" i ON i.id = pay."invoiceId"
           WHERE pay."paymentDate" >= m.month AND pay."paymentDate" < (m.month + interval '1 month') ${planInv}) AS collected
      FROM m ORDER BY m.month`,
    db.$queryRaw<{ label: string; count: bigint }[]>`
      SELECT p.name AS label, COUNT(*) AS count FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
      WHERE TRUE ${status ? statusSub : Prisma.sql`AND s.status = 'ACTIVE'`} ${planSub}
      GROUP BY p.name ORDER BY count DESC LIMIT 10`,
    db.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT s.status::text AS status, COUNT(*) AS count FROM "Subscription" s WHERE TRUE ${planSub} GROUP BY s.status`,
    db.invoice.findMany({
      where: { status: "CONFIRMED", dueDate: { lt: today }, amountDue: { gt: 0 }, ...(planId && { subscription: { planId } }) },
      orderBy: { amountDue: "desc" },
      take: 10,
      select: { id: true, number: true, dueDate: true, amountDue: true, customer: { select: { name: true } } },
    }),
    db.plan.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const mrr = Math.round(subs[0]?.mrr ?? 0);
  const m = money[0];
  const range = `from=${toISODate(from)}&to=${toISODate(to)}`;
  const planQ = planId ? `&plan=${planId}` : "";
  const kpis = [
    { label: "Active subscriptions", value: n(subs[0]?.active).toLocaleString(), href: `/subscriptions?status=ACTIVE${planQ}` },
    { label: "MRR", value: formatMoney(mrr), sub: `ARR ${formatMoney(mrr * 12)}`, href: `/subscriptions?status=ACTIVE${planQ}` },
    { label: "Collected", value: formatMoney(n(m?.collected)), sub: `${formatDate(from)} – ${formatDate(to)}`, href: `/payments?${range}` },
    { label: "Invoiced", value: formatMoney(n(m?.invoiced)), sub: "confirmed in range", href: `/invoices?${range}${planQ}` },
    { label: "Outstanding", value: formatMoney(n(m?.outstanding)), sub: `${n(m?.outstandingCount).toLocaleString()} invoices`, href: `/invoices?show=CONFIRMED${planQ}` },
    {
      label: "Overdue",
      value: formatMoney(n(overdue[0]?.amount)),
      sub: `${n(overdue[0]?.count).toLocaleString()} invoices`,
      href: `/invoices?show=OVERDUE${planQ}`,
      danger: true,
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Subscriptions, revenue, what is owed and what is late." />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ParamSelect param="plan" placeholder="All plans" options={plans.map((p) => ({ value: p.id, label: p.name }))} />
        <ParamSelect param="status" placeholder="Active (by plan chart)" options={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
        <DateRange />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardDescription>{k.label}</CardDescription>
                <CardTitle className={`text-xl tabular-nums ${k.danger ? "text-destructive" : ""}`}>{k.value}</CardTitle>
                {k.sub && <CardDescription className="text-xs">{k.sub}</CardDescription>}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoiced vs collected</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyByMonthChart
              data={months.map((r) => ({
                month: r.month.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
                invoiced: n(r.invoiced),
                collected: n(r.collected),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions by status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {STATUSES.map((s) => (
              <Link key={s} href={`/subscriptions?status=${s}${planQ}`} className="flex items-center justify-between hover:underline">
                <StatusBadge status={s} />
                <span className="tabular-nums">{n(byStatus.find((b) => b.status === s)?.count).toLocaleString()}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{status ? `${status.charAt(0)}${status.slice(1).toLowerCase()}` : "Active"} subscriptions by plan</CardTitle>
          </CardHeader>
          <CardContent>
            <CountChart data={byPlan.map((r) => ({ label: r.label, count: n(r.count) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Largest overdue invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {overdueRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is overdue.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueRows.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
                          {i.number}
                        </Link>
                      </TableCell>
                      <TableCell>{i.customer.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{daysBetween(i.dueDate, today)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.amountDue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
