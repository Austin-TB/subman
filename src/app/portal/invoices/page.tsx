import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invoiceDisplayStatus, PAYMENT_METHODS } from "@/lib/billing/status";
import { businessToday, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My invoices" };

export default async function PortalInvoices() {
  const user = await requireCustomer();
  const today = businessToday();
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({ where: { customerId: user.customerId, status: { in: ["CONFIRMED", "PAID"] } }, orderBy: { invoiceDate: "desc" }, take: 200 }),
    db.payment.findMany({
      where: { invoice: { customerId: user.customerId } },
      orderBy: { paymentDate: "desc" },
      take: 100,
      include: { invoice: { select: { id: true, number: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader title="My invoices" />
      <Card>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Amount due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/portal/invoices/${i.id}`} className="font-medium hover:underline">
                        {i.number}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(i.invoiceDate)}</TableCell>
                    <TableCell>{formatDate(i.dueDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={invoiceDisplayStatus(i, today)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.amountDue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {payments.length === 0 && <p className="text-muted-foreground">No payments yet.</p>}
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between gap-2">
              <span>
                {formatDate(p.paymentDate)} · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label} ·{" "}
                <Link href={`/portal/invoices/${p.invoice.id}`} className="hover:underline">
                  {p.invoice.number}
                </Link>
              </span>
              <span className="tabular-nums">{formatMoney(p.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
