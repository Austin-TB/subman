import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/app/data-table";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Prisma } from "@/generated/prisma/client";
import { businessToday, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param, parseListParams } from "@/lib/list-params";
import { planAvailability, planSummary } from "@/lib/plans";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";

export const metadata: Metadata = { title: "Plans" };

const SORTABLE = ["name", "price", "availableFrom"] as const;
const SHOW = ["AVAILABLE", "SCHEDULED", "ENDED", "INACTIVE"] as const;
type Show = (typeof SHOW)[number];

// The same rules as planAvailability() in lib/plans.ts, written as a database filter.
const whereFor = (today: Date): Record<Show, Prisma.PlanWhereInput> => ({
  AVAILABLE: {
    active: true,
    availableFrom: { lte: today },
    OR: [{ availableUntil: null }, { availableUntil: { gte: today } }],
  },
  SCHEDULED: { active: true, availableFrom: { gt: today } },
  ENDED: { active: true, availableUntil: { lt: today } },
  INACTIVE: { active: false },
});

export default async function PlansPage({ searchParams }: PageProps<"/catalog/plans">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const today = businessToday();
  const tabs = whereFor(today);
  const show = SHOW.find((s) => s === param(sp, "show"));

  // AND, not a spread: the "Available" tab and the search both use OR, and one would overwrite the other.
  const where: Prisma.PlanWhereInput = {
    AND: [
      show ? tabs[show] : {},
      params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { product: { name: { contains: params.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, all, ...counts] = await Promise.all([
    db.plan.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      include: { product: { select: { id: true, name: true } }, _count: { select: { subscriptions: true } } },
    }),
    db.plan.count({ where }),
    db.plan.count(),
    ...SHOW.map((s) => db.plan.count({ where: tabs[s] })),
  ]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Plan",
      sortKey: "name",
      cell: (p) => (
        <Link href={`/catalog/plans/${p.id}`} className="font-medium hover:underline">
          {p.name}
        </Link>
      ),
    },
    {
      key: "product",
      header: "Product",
      cell: (p) => (
        <Link href={`/catalog/products/${p.product.id}`} className="hover:underline">
          {p.product.name}
        </Link>
      ),
    },
    {
      key: "price",
      header: "Price and terms",
      sortKey: "price",
      className: "min-w-64 whitespace-normal",
      cell: (p) => <span className="tabular-nums">{planSummary(p)}</span>,
    },
    {
      key: "available",
      header: "Available from",
      sortKey: "availableFrom",
      cell: (p) => (
        <div className="whitespace-nowrap">
          {formatDate(p.availableFrom)}
          {p.availableUntil && <div className="text-xs text-muted-foreground">until {formatDate(p.availableUntil)}</div>}
        </div>
      ),
    },
    {
      key: "subscriptions",
      header: <span title="Subscriptions on this plan">In use</span>,
      align: "right",
      cell: (p) => <span className="tabular-nums">{p._count.subscriptions}</span>,
    },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={planAvailability(p, today)} /> },
  ];

  return (
    <>
      <PageHeader
        title="Plans"
        description={
          canEdit
            ? "What a product costs and how often it bills, and what customers can do with the subscription."
            : "What a product costs and how often it bills. View only: an admin changes these."
        }
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/catalog/plans/new">
                <PlusIcon />
                Add plan
              </Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          param="show"
          value={show ?? ""}
          raw={sp}
          tabs={[
            { value: "", label: "All", count: all },
            { value: "AVAILABLE", label: "Available", count: counts[0] },
            { value: "SCHEDULED", label: "Scheduled", count: counts[1] },
            { value: "ENDED", label: "Ended", count: counts[2] },
            { value: "INACTIVE", label: "Inactive", count: counts[3] },
          ]}
        />
        <SearchInput placeholder="Search plans or products…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(p) => p.id}
        emptyTitle="No plans yet"
        emptyDescription={canEdit ? "Add a product first, then a plan that sells it." : undefined}
      />
    </>
  );
}
