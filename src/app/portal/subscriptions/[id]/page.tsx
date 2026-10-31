import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LifecycleActions } from "@/components/app/lifecycle-actions";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { SubscriptionStatusBar } from "@/components/app/subscription-status-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invoiceDisplayStatus } from "@/lib/billing/status";
import { calcTotals } from "@/lib/billing/totals";
import { businessToday, formatDate, formatPeriod } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { requireCustomer } from "@/lib/session";
import { factsOf, offeredActions } from "@/lib/subscriptions/transitions";
import { Totals } from "@/app/(back-office)/subscriptions/subscription-form";
import { portalSubscriptionAction } from "../../actions";

export const metadata: Metadata = { title: "Subscription" };

export default async function PortalSubscription({ params }: PageProps<"/portal/subscriptions/[id]">) {
  const user = await requireCustomer();
  const { id } = await params;
  const today = businessToday();
  // Always filtered by the logged-in customer: someone else's id is simply not found.
  const sub = await db.subscription.findFirst({
    where: { id, customerId: user.customerId, status: { not: "DRAFT" } },
    include: {
      plan: true,
      lines: { orderBy: { sequence: "asc" }, include: { taxes: true } },
      invoices: { where: { status: { in: ["CONFIRMED", "PAID"] } }, orderBy: { periodStart: "desc" }, take: 24 },
    },
  });
  if (!sub) notFound();

  const offered = offeredActions(factsOf(sub), sub.plan, "customer", today);
  const totals = calcTotals(sub.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, taxes: l.taxes.map((t) => ({ name: t.name, kind: t.kind, rate: t.rate })) })));

  return (
    <>
      <PageHeader
        back={{ href: "/portal/subscriptions", label: "My subscriptions" }}
        title={
          <span className="flex items-center gap-2">
            {sub.plan.name} <StatusBadge status={sub.status} />
          </span>
        }
        description={`${sub.number} · billed every ${formatPeriod(sub.plan.period, sub.plan.interval)}`}
        actions={<LifecycleActions offered={offered} run={portalSubscriptionAction.bind(null, sub.id)} />}
      />
      <SubscriptionStatusBar
        status={sub.status}
        note={`Started ${formatDate(sub.startDate)}${sub.expiryDate ? ` · expires ${formatDate(sub.expiryDate)}` : ""}${
          sub.status === "ACTIVE" && sub.nextInvoiceDate ? ` · next invoice ${formatDate(sub.nextInvoiceDate)}` : ""
        }`}
      />
      <Card>
        <CardHeader>
          <CardTitle>What you pay each period</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sub.lines.map((l, i) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(totals.lines[i].amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Totals totals={totals} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {sub.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
          {sub.invoices.map((i) => (
            <Link key={i.id} href={`/portal/invoices/${i.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40">
              <span>
                {i.number} · {formatDate(i.periodStart)} – {formatDate(i.periodEnd)}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">{formatMoney(i.total)}</span>
                <StatusBadge status={invoiceDisplayStatus(i, today)} />
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
