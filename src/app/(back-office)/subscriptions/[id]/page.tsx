import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { ActionButton } from "@/components/app/action-button";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { SubscriptionStatusBar } from "@/components/app/subscription-status-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invoiceDisplayStatus } from "@/lib/billing/status";
import { calcTotals } from "@/lib/billing/totals";
import { businessToday, formatDate, formatPeriod, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney, toInputValue } from "@/lib/money";
import { planSummary } from "@/lib/plans";
import { can } from "@/lib/roles";
import type { SubscriptionInput } from "@/lib/schemas/subscriptions";
import { requireBackOffice } from "@/lib/session";
import { subscriptionFormData } from "@/lib/subscriptions/form-data";
import { factsOf, isExpired, offeredActions } from "@/lib/subscriptions/transitions";
import { addSubscriptionLine, billUpTo, removeSubscriptionLine, runSubscriptionAction } from "../actions";
import { AddLineDialog } from "../add-line-dialog";
import { BillUpTo, LifecycleActions } from "@/components/app/lifecycle-actions";
import { SubscriptionForm, Totals } from "../subscription-form";

export const metadata: Metadata = { title: "Subscription" };

export default async function SubscriptionPage({ params }: PageProps<"/subscriptions/[id]">) {
  const user = await requireBackOffice();
  const { id } = await params;
  const today = businessToday();

  const sub = await db.subscription.findUnique({
    where: { id },
    include: {
      plan: true,
      customer: true,
      paymentTerm: true,
      lines: { orderBy: { sequence: "asc" }, include: { taxes: true } },
      invoices: { orderBy: { periodStart: "desc" }, take: 24 },
    },
  });
  if (!sub) notFound();

  const offered = offeredActions(factsOf(sub), sub.plan, "staff", today);
  const totals = calcTotals(
    sub.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, taxes: l.taxes.map((t) => ({ name: t.name, kind: t.kind, rate: t.rate })) })),
  );
  const running = sub.status === "ACTIVE" || sub.status === "PAUSED";
  const expired = running && isExpired(sub, today);
  const formData =
    sub.status === "DRAFT" || running
      ? await subscriptionFormData({ planId: sub.planId, productIds: sub.lines.map((l) => l.productId), taxIds: sub.lines.flatMap((l) => l.taxes.map((t) => t.id)) })
      : null;

  const note =
    sub.status === "QUOTATION" && sub.validUntil
      ? `Quotation valid until ${formatDate(sub.validUntil)}.`
      : sub.status === "CONFIRMED"
        ? `Becomes active on ${formatDate(sub.startDate)}.`
        : sub.status === "ACTIVE" && sub.nextInvoiceDate
          ? `Next invoice ${formatDate(sub.nextInvoiceDate)}.`
          : sub.status === "CLOSED" && sub.closedAt
            ? `Closed ${formatDate(sub.closedAt)}${sub.closeReason ? `: ${sub.closeReason}` : ""}.`
            : undefined;

  const [planLine, ...others] = sub.lines;
  const values: SubscriptionInput = {
    customerId: sub.customerId,
    planId: sub.planId,
    startDate: toISODate(sub.startDate),
    expiryDate: sub.expiryDate ? toISODate(sub.expiryDate) : "",
    validityDays: String(sub.validityDays),
    paymentTermId: sub.paymentTermId,
    planLine: {
      variantId: planLine?.variantId ?? "",
      quantity: String(planLine?.quantity ?? sub.plan.minQuantity),
      unitPrice: toInputValue(planLine?.unitPrice ?? sub.plan.price),
      taxIds: planLine?.taxes.map((t) => t.id) ?? [],
    },
    lines: others.map((l) => ({
      productId: l.productId,
      variantId: l.variantId ?? "",
      quantity: String(l.quantity),
      unitPrice: toInputValue(l.unitPrice),
      taxIds: l.taxes.map((t) => t.id),
    })),
  };

  return (
    <>
      <PageHeader
        back={{ href: "/subscriptions", label: "Subscriptions" }}
        title={
          <span className="flex items-center gap-2">
            {sub.number} <StatusBadge status={sub.status} />
            {expired && <StatusBadge status="EXPIRED" label="Expired: renew or close" />}
          </span>
        }
        description={
          <>
            <Link href={`/customers/${sub.customerId}`} className="hover:underline">
              {sub.customer.name}
            </Link>{" "}
            · {sub.plan.name}
          </>
        }
        actions={<LifecycleActions offered={offered} run={runSubscriptionAction.bind(null, sub.id)} />}
      />
      <SubscriptionStatusBar status={sub.status} note={note} />
      {offered
        .filter((a) => a.blocked)
        .map((a) => (
          <Alert key={a.action}>
            <AlertDescription>
              <strong>{a.label}:</strong> {a.blocked}
            </AlertDescription>
          </Alert>
        ))}

      {sub.status === "DRAFT" && formData ? (
        <SubscriptionForm subscriptionId={sub.id} values={values} {...formData} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <Detail label="Customer" value={sub.customer.name} />
              <Detail label="Plan" value={`${sub.plan.name} · ${planSummary(sub.plan)}`} />
              <Detail label="Payment terms" value={sub.paymentTerm.name} />
              <Detail label="Start" value={formatDate(sub.startDate)} />
              <Detail label="Expiry" value={sub.expiryDate ? formatDate(sub.expiryDate) : "No expiry"} />
              <Detail label="Next invoice" value={sub.status === "ACTIVE" ? formatDate(sub.nextInvoiceDate) : "—"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lines · billed every {formatPeriod(sub.plan.period, sub.plan.interval)}</CardTitle>
              {running && formData && (
                <CardAction>
                  <AddLineDialog products={formData.products} taxes={formData.taxes} add={addSubscriptionLine.bind(null, sub.id)} />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead>Taxes</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {running && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sub.lines.map((l, i) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        {l.description}
                        {l.isPlanLine && <span className="ml-2 text-xs text-muted-foreground">Plan</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
                      <TableCell>{l.taxes.map((t) => t.name).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(totals.lines[i].amount)}</TableCell>
                      {running && (
                        <TableCell className="text-right">
                          {!l.isPlanLine && (
                            <ActionButton size="sm" variant="ghost" action={removeSubscriptionLine.bind(null, sub.id, l.id)}>
                              Remove
                            </ActionButton>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Totals totals={totals} />
            </CardContent>
          </Card>
        </>
      )}

      {sub.status === "ACTIVE" && can.billUpToDate(user.role) && (
        <Card>
          <CardHeader>
            <CardTitle>Bill up to date (admin)</CardTitle>
          </CardHeader>
          <CardContent>
            <BillUpTo defaultDate={toISODate(today)} run={billUpTo.bind(null, sub.id)} />
          </CardContent>
        </Card>
      )}

      {sub.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sub.invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
                        {i.number ?? "Draft"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatDate(i.periodStart)} – {formatDate(i.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invoiceDisplayStatus(i, today)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.amountDue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ActivityTimeline entityType="subscription" entityId={sub.id} />
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
