import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, XIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/app/data-table";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { ParamSelect } from "@/components/app/param-select";
import { SearchInput } from "@/components/app/search-input";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Prisma, type SubscriptionStatus } from "@/generated/prisma/client";
import { businessToday, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param, parseListParams, withParams } from "@/lib/list-params";
import { formatMoney } from "@/lib/money";
import { requireBackOffice } from "@/lib/session";
import { isExpired } from "@/lib/subscriptions/transitions";

export const metadata: Metadata = { title: "Subscriptions" };

const SORTABLE = ["number", "startDate", "recurringAmount", "nextInvoiceDate", "createdAt"] as const;
const STATUSES: { value: SubscriptionStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "QUOTATION", label: "Quotation" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "CLOSED", label: "Closed" },
];

export default async function SubscriptionsPage({ searchParams }: PageProps<"/subscriptions">) {
  await requireBackOffice();
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: SORTABLE, defaultSort: "createdAt" });
  const today = businessToday();
  const status = STATUSES.find((s) => s.value === param(sp, "status"))?.value;
  const planId = param(sp, "plan");
  const customerId = param(sp, "customer");

  const base: Prisma.SubscriptionWhereInput = {
    AND: [
      planId ? { planId } : {},
      customerId ? { customerId } : {},
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
  const where: Prisma.SubscriptionWhereInput = status ? { AND: [base, { status }] } : base;

  const [rows, total, groups, plans, customer] = await Promise.all([
    db.subscription.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        number: true,
        status: true,
        startDate: true,
        expiryDate: true,
        nextInvoiceDate: true,
        recurringAmount: true,
        customer: { select: { id: true, name: true, company: true } },
        plan: { select: { name: true } },
      },
    }),
    db.subscription.count({ where }),
    db.subscription.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    db.plan.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    customerId ? db.customer.findUnique({ where: { id: customerId }, select: { name: true } }) : null,
  ]);
  const count = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      cell: (s) => (
        <Link href={`/subscriptions/${s.id}`} className="font-medium hover:underline">
          {s.number}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (s) => (
        <Link href={`/customers/${s.customer.id}`} className="hover:underline">
          {s.customer.name}
          {s.customer.company && <div className="text-xs text-muted-foreground">{s.customer.company}</div>}
        </Link>
      ),
    },
    { key: "plan", header: "Plan", cell: (s) => s.plan.name },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={s.status} />
          {(s.status === "ACTIVE" || s.status === "PAUSED") && isExpired(s, today) && <StatusBadge status="EXPIRED" />}
        </div>
      ),
    },
    { key: "start", header: "Start", sortKey: "startDate", cell: (s) => formatDate(s.startDate) },
    { key: "next", header: "Next invoice", sortKey: "nextInvoiceDate", cell: (s) => (s.status === "ACTIVE" ? formatDate(s.nextInvoiceDate) : "—") },
    {
      key: "amount",
      header: "Per period",
      sortKey: "recurringAmount",
      align: "right",
      cell: (s) => <span className="tabular-nums">{formatMoney(s.recurringAmount)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Every quotation and subscription, and where it stands."
        actions={
          <Button asChild>
            <Link href={`/subscriptions/new${customerId ? `?customer=${customerId}` : ""}`}>
              <PlusIcon />
              New subscription
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          param="status"
          value={status ?? ""}
          raw={sp}
          tabs={[{ value: "", label: "All", count: groups.reduce((s, g) => s + g._count._all, 0) }, ...STATUSES.map((s) => ({ ...s, count: count(s.value) }))]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {customer && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={withParams(sp, { customer: null, page: null })}>
                {customer.name}
                <XIcon />
              </Link>
            </Button>
          )}
          <ParamSelect param="plan" placeholder="All plans" options={plans.map((p) => ({ value: p.id, label: p.name }))} />
          <SearchInput placeholder="Number or customer…" />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} total={total} params={params} getRowKey={(s) => s.id} emptyTitle="No subscriptions" />
    </>
  );
}
