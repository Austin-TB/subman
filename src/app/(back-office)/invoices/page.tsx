import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type Column } from "@/components/app/data-table";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Prisma } from "@/generated/prisma/client";
import { AGING_BUCKETS, daysOverdue, invoiceDisplayStatus } from "@/lib/billing/status";
import { addDays, businessToday, formatDate, toISODate, tryParseDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param, parseListParams, withParams } from "@/lib/list-params";
import { formatMoney } from "@/lib/money";
import { requireBackOffice } from "@/lib/session";
import { bulkConfirmAction } from "./actions";
import { DateAction } from "./invoice-controls";
import { DateRange } from "@/components/app/date-range";

export const metadata: Metadata = { title: "Invoices" };

const SORTABLE = ["invoiceDate", "dueDate", "total", "amountDue", "number"] as const;
const SHOW = ["DRAFT", "CONFIRMED", "OVERDUE", "PAID", "CANCELLED"] as const;
type Show = (typeof SHOW)[number];

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  await requireBackOffice();
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: SORTABLE, defaultSort: "invoiceDate" });
  const today = businessToday();
  const show = SHOW.find((s) => s === param(sp, "show"));
  const from = tryParseDate(param(sp, "from"));
  const to = tryParseDate(param(sp, "to"));
  const bucket = AGING_BUCKETS.find((b) => b.key === param(sp, "aging"));
  const plan = param(sp, "plan");

  const tabs: Record<Show, Prisma.InvoiceWhereInput> = {
    DRAFT: { status: "DRAFT" },
    CONFIRMED: { status: "CONFIRMED" }, // outstanding
    OVERDUE: { status: "CONFIRMED", dueDate: { lt: today }, amountDue: { gt: 0 } },
    PAID: { status: "PAID" },
    CANCELLED: { status: "CANCELLED" },
  };
  const base: Prisma.InvoiceWhereInput = {
    AND: [
      from || to ? { invoiceDate: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {},
      plan ? { subscription: { planId: plan } } : {},
      params.q
        ? {
            OR: [
              { number: { contains: params.q, mode: "insensitive" } },
              { customer: { name: { contains: params.q, mode: "insensitive" } } },
              { customer: { company: { contains: params.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const agingWhere: Prisma.InvoiceWhereInput = bucket
    ? { dueDate: { lte: addDays(today, -bucket.min), gte: addDays(today, -bucket.max) } }
    : {};
  const where: Prisma.InvoiceWhereInput = { AND: [base, show ? tabs[show] : {}, show === "OVERDUE" ? agingWhere : {}] };

  const [rows, total, sums, ...counts] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        number: true,
        status: true,
        invoiceDate: true,
        dueDate: true,
        total: true,
        amountDue: true,
        customer: { select: { id: true, name: true } },
        subscription: { select: { number: true } },
      },
    }),
    db.invoice.count({ where }),
    db.invoice.aggregate({ where, _sum: { total: true, amountDue: true } }),
    db.invoice.count({ where: base }),
    ...SHOW.map((s) => db.invoice.count({ where: { AND: [base, tabs[s]] } })),
  ]);
  const [all, ...tabCounts] = counts;

  // Aging of overdue amounts, for the Overdue tab.
  const aging =
    show === "OVERDUE"
      ? await Promise.all(
          AGING_BUCKETS.map((b) =>
            db.invoice.aggregate({
              where: { AND: [base, tabs.OVERDUE, { dueDate: { lte: addDays(today, -b.min), gte: addDays(today, -b.max) } }] },
              _sum: { amountDue: true },
              _count: { _all: true },
            }),
          ),
        )
      : null;

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      cell: (i) => (
        <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
          {i.number ?? "Draft"}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (i) => (
        <Link href={`/customers/${i.customer.id}`} className="hover:underline">
          {i.customer.name}
          <div className="text-xs text-muted-foreground">{i.subscription.number}</div>
        </Link>
      ),
    },
    { key: "date", header: "Date", sortKey: "invoiceDate", cell: (i) => formatDate(i.invoiceDate) },
    { key: "due", header: "Due", sortKey: "dueDate", cell: (i) => formatDate(i.dueDate) },
    {
      key: "late",
      header: "Days overdue",
      align: "right",
      cell: (i) => {
        const d = daysOverdue(i, today);
        return d ? <span className="text-destructive tabular-nums">{d}</span> : "—";
      },
    },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={invoiceDisplayStatus(i, today)} /> },
    { key: "total", header: "Total", sortKey: "total", align: "right", cell: (i) => <span className="tabular-nums">{formatMoney(i.total)}</span> },
    { key: "amountDue", header: "Amount due", sortKey: "amountDue", align: "right", cell: (i) => <span className="tabular-nums">{formatMoney(i.amountDue)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${total.toLocaleString()} invoices · ${formatMoney(sums._sum.total ?? 0)} total · ${formatMoney(sums._sum.amountDue ?? 0)} due`}
        actions={show === "DRAFT" && <DateAction label="Confirm drafts up to" defaultDate={toISODate(today)} run={bulkConfirmAction} />}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          param="show"
          value={show ?? ""}
          raw={sp}
          tabs={[
            { value: "", label: "All", count: all },
            { value: "DRAFT", label: "Draft", count: tabCounts[0] },
            { value: "CONFIRMED", label: "Outstanding", count: tabCounts[1] },
            { value: "OVERDUE", label: "Overdue", count: tabCounts[2] },
            { value: "PAID", label: "Paid", count: tabCounts[3] },
            { value: "CANCELLED", label: "Cancelled", count: tabCounts[4] },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <DateRange />
          <SearchInput placeholder="Number or customer…" />
        </div>
      </div>
      {aging && (
        <div className="grid gap-3 sm:grid-cols-4">
          {AGING_BUCKETS.map((b, i) => (
            <Link key={b.key} href={withParams(sp, { aging: bucket?.key === b.key ? null : b.key, page: null })}>
              <Card className={bucket?.key === b.key ? "ring-2 ring-primary" : undefined}>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">{b.label} overdue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold tabular-nums">{formatMoney(aging[i]._sum.amountDue ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">{aging[i]._count._all} invoices</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <DataTable columns={columns} rows={rows} total={total} params={params} getRowKey={(i) => i.id} emptyTitle="No invoices" emptyDescription="Run billing to create invoices from due subscriptions." />
    </>
  );
}
