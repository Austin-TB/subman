import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoiceDisplayStatus } from "@/lib/billing/status";
import { businessToday, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My account" };

export default async function PortalHome() {
  const user = await requireCustomer();
  const today = businessToday();
  const [subs, due, invoices] = await Promise.all([
    db.subscription.findMany({
      where: { customerId: user.customerId, status: { in: ["ACTIVE", "PAUSED", "CONFIRMED", "QUOTATION"] } },
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { name: true } } },
    }),
    db.invoice.aggregate({ where: { customerId: user.customerId, status: "CONFIRMED" }, _sum: { amountDue: true } }),
    db.invoice.findMany({
      where: { customerId: user.customerId, status: { in: ["CONFIRMED", "PAID"] } },
      orderBy: { invoiceDate: "desc" },
      take: 5,
    }),
  ]);

  return (
    <>
      <PageHeader title={`Hello, ${user.name}`} description="Your subscriptions and invoices." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Amount due</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(due._sum.amountDue ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active subscriptions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{subs.filter((s) => s.status === "ACTIVE").length}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {subs.length === 0 && <p className="text-sm text-muted-foreground">You have no subscriptions yet.</p>}
          {subs.map((s) => (
            <Link key={s.id} href={`/portal/subscriptions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40">
              <div>
                <div className="font-medium">{s.plan.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.number}
                  {s.status === "ACTIVE" && s.nextInvoiceDate && ` · next invoice ${formatDate(s.nextInvoiceDate)}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{formatMoney(s.recurringAmount)}</span>
                <StatusBadge status={s.status} />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
          {invoices.map((i) => (
            <Link key={i.id} href={`/portal/invoices/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40">
              <div>
                <div className="font-medium">{i.number}</div>
                <div className="text-xs text-muted-foreground">Due {formatDate(i.dueDate)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{formatMoney(i.amountDue)}</span>
                <StatusBadge status={invoiceDisplayStatus(i, today)} />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
