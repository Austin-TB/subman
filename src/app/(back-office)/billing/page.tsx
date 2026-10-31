import type { Metadata } from "next";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { businessToday, formatDate, formatDateTime, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { requireBackOffice } from "@/lib/session";
import { runBillingAction } from "../invoices/actions";
import { DateAction } from "../invoices/invoice-controls";

export const metadata: Metadata = { title: "Billing runs" };

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  await requireBackOffice();
  const params = parseListParams(await searchParams, { sortable: ["startedAt"] as const, defaultSort: "startedAt" });
  const today = businessToday();

  const [rows, total, due] = await Promise.all([
    db.billingRun.findMany({ orderBy: { startedAt: "desc" }, skip: params.skip, take: params.take }),
    db.billingRun.count(),
    db.subscription.count({ where: { status: "ACTIVE", nextInvoiceDate: { lte: today } } }),
  ]);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "asOf", header: "Billed up to", cell: (r) => formatDate(r.asOf) },
    { key: "started", header: "Run at", cell: (r) => formatDateTime(r.startedAt) },
    { key: "trigger", header: "Trigger", cell: (r) => r.trigger },
    { key: "activated", header: "Activated", align: "right", cell: (r) => r.activated },
    { key: "invoices", header: "Invoices", align: "right", cell: (r) => r.invoicesCreated },
    { key: "closed", header: "Closed", align: "right", cell: (r) => r.closed },
    {
      key: "errors",
      header: "Errors",
      align: "right",
      cell: (r) => (
        <span title={JSON.stringify(r.errors)} className={r.errorCount ? "text-destructive" : undefined}>
          {r.errorCount}
        </span>
      ),
    },
    {
      key: "took",
      header: "Took",
      align: "right",
      cell: (r) => (r.finishedAt ? `${((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1)}s` : "running"),
    },
  ];

  return (
    <>
      <PageHeader title="Billing runs" description="Turn due subscriptions into draft invoices. Running it twice for the same date creates nothing new." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Run billing</CardTitle>
          <CardDescription>
            {due.toLocaleString()} active subscription{due === 1 ? " is" : "s are"} due today. Missed periods are caught up; nothing is billed twice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DateAction label="Run billing" defaultDate={toISODate(today)} run={runBillingAction} />
        </CardContent>
      </Card>
      <DataTable columns={columns} rows={rows} total={total} params={params} getRowKey={(r) => r.id} emptyTitle="No billing runs yet" />
    </>
  );
}
