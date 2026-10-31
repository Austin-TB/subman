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
import { discountConditions, discountState, discountValueLabel, type DiscountState } from "@/lib/discounts";
import { param, parseListParams } from "@/lib/list-params";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";

export const metadata: Metadata = { title: "Discount rules" };

const SORTABLE = ["name", "startDate", "usedCount"] as const;
const SHOW: DiscountState[] = ["ACTIVE", "SCHEDULED", "EXPIRED", "USED_UP", "INACTIVE"];
const SHOW_LABEL: Record<DiscountState, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  USED_UP: "Used up",
  INACTIVE: "Inactive",
};

export default async function DiscountsPage({ searchParams }: PageProps<"/catalog/discounts">) {
  const user = await requireBackOffice();
  const canEdit = can.editDiscounts(user.role);
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: SORTABLE, defaultSort: "startDate", defaultDir: "desc" });
  const show = SHOW.find((s) => s === param(sp, "show"));
  const today = businessToday();

  const where: Prisma.DiscountWhereInput = params.q ? { name: { contains: params.q, mode: "insensitive" } } : {};
  // A rule's state (active, scheduled, expired, used up) depends on today's date and its uses, so it is worked out
  // here with the same discountState() the billing run uses, not re-written as a query. The rule list stays small.
  const all = (
    await db.discount.findMany({
      where,
      take: 500,
      include: { products: { select: { name: true }, orderBy: { name: "asc" } } },
    })
  ).map((d) => ({ ...d, state: discountState(d, today) }));

  const countOf = (s: DiscountState) => all.filter((d) => d.state === s).length;
  const filtered = all.filter((d) => !show || d.state === show);
  const sorted = filtered.toSorted((a, b) => {
    const [x, y] = [a[params.sort], b[params.sort]];
    const order = typeof x === "string" ? x.localeCompare(y as string) : Number(x) - Number(y);
    return params.dir === "asc" ? order : -order;
  });
  const rows = sorted.slice(params.skip, params.skip + params.take);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Rule",
      sortKey: "name",
      cell: (d) => (
        <Link href={`/catalog/discounts/${d.id}`} className="font-medium hover:underline">
          {d.name}
        </Link>
      ),
    },
    { key: "discount", header: "Discount", cell: (d) => <span className="tabular-nums">{discountValueLabel(d)}</span> },
    {
      key: "scope",
      header: "Applies to",
      className: "min-w-40 whitespace-normal",
      cell: (d) =>
        d.scope === "SUBSCRIPTION"
          ? "Whole subscription"
          : d.products.length <= 2
            ? d.products.map((p) => p.name).join(", ")
            : `${d.products[0].name} +${d.products.length - 1} more`,
    },
    { key: "conditions", header: "Conditions", cell: (d) => discountConditions(d) },
    {
      key: "valid",
      header: "Valid",
      sortKey: "startDate",
      cell: (d) => (
        <span className="whitespace-nowrap">
          {formatDate(d.startDate)} → {d.endDate ? formatDate(d.endDate) : "no end"}
        </span>
      ),
    },
    {
      key: "uses",
      header: "Uses",
      sortKey: "usedCount",
      align: "right",
      cell: (d) => (
        <span className="tabular-nums">
          {d.usedCount} / {d.usageLimit ?? "∞"}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (d) => <StatusBadge status={d.state} label={SHOW_LABEL[d.state]} /> },
  ];

  return (
    <>
      <PageHeader
        title="Discount rules"
        description={
          canEdit
            ? "Rules the system applies by itself when it creates an invoice. They stop when they expire or run out."
            : "Rules the system applies by itself when it creates an invoice. View only: an admin changes these."
        }
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/catalog/discounts/new">
                <PlusIcon />
                Add rule
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
            { value: "", label: "All", count: all.length },
            ...SHOW.map((s) => ({ value: s, label: SHOW_LABEL[s], count: countOf(s) })),
          ]}
        />
        <SearchInput placeholder="Search rules…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={filtered.length}
        params={params}
        getRowKey={(d) => d.id}
        emptyTitle="No discount rules"
        emptyDescription={canEdit ? "Add a rule, such as 10% off for 20 or more seats." : undefined}
      />
    </>
  );
}
