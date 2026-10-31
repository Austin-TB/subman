import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { businessToday, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { addressLines } from "@/lib/schemas/customers";
import { requireBackOffice } from "@/lib/session";
import { invoiceDisplayStatus } from "@/lib/billing/status";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await requireBackOffice();
  const { id } = await params;
  const today = businessToday();

  const c = await db.customer.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, active: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, number: true, status: true, startDate: true, recurringAmount: true, plan: { select: { name: true } } },
      },
      invoices: {
        orderBy: { invoiceDate: "desc" },
        take: 25,
        select: { id: true, number: true, status: true, invoiceDate: true, dueDate: true, total: true, amountDue: true },
      },
    },
  });
  if (!c) notFound();

  const owed = await db.invoice.aggregate({ where: { customerId: id, status: "CONFIRMED" }, _sum: { amountDue: true } });

  return (
    <>
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title={c.name}
        description={c.company ?? undefined}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/customers/${c.id}/edit`}>
                <PencilIcon />
                Edit
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/subscriptions/new?customer=${c.id}`}>
                <PlusIcon />
                New subscription
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <span>{c.email}</span>
            {c.phone && <span>{c.phone}</span>}
            {addressLines(c).map((l) => (
              <span key={l} className="text-muted-foreground">
                {l}
              </span>
            ))}
            {c.taxId && <span className="text-muted-foreground">Tax ID: {c.taxId}</span>}
            <span className="mt-2 text-muted-foreground">
              Portal login: {c.user ? `${c.user.email}${c.user.active ? "" : " (deactivated)"}` : "none"}
            </span>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(owed._sum.amountDue ?? 0)}</p>
            <p className="text-sm text-muted-foreground">Still due on confirmed invoices.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {c.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Per period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/subscriptions/${s.id}`} className="font-medium hover:underline">
                        {s.number}
                      </Link>
                    </TableCell>
                    <TableCell>{s.plan.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>{formatDate(s.startDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(s.recurringAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {c.invoices.length === 0 ? (
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
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
                        {i.number ?? "Draft"}
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

      <ActivityTimeline entityType="customer" entityId={c.id} />
    </>
  );
}
