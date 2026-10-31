import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/app/data-table";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { param, parseListParams } from "@/lib/list-params";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";

export const metadata: Metadata = { title: "Products" };

const SORTABLE = ["name", "type", "salesPrice", "costPrice"] as const;
const SHOW = ["SERVICE", "GOODS", "ADDON", "INACTIVE"] as const;
type Show = (typeof SHOW)[number];

const WHERE: Record<Show, Prisma.ProductWhereInput> = {
  SERVICE: { type: "SERVICE" },
  GOODS: { type: "GOODS" },
  ADDON: { isAddon: true },
  INACTIVE: { active: false },
};

export default async function ProductsPage({ searchParams }: PageProps<"/catalog/products">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const show = SHOW.find((s) => s === param(sp, "show"));

  const where: Prisma.ProductWhereInput = {
    ...(show && WHERE[show]),
    ...(params.q && { name: { contains: params.q, mode: "insensitive" } }),
  };

  // Tab counts ignore the search box, so they say how many products each tab holds.
  const [rows, total, ...counts] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        name: true,
        type: true,
        isAddon: true,
        salesPrice: true,
        costPrice: true,
        active: true,
        taxes: { select: { name: true }, orderBy: { name: "asc" } },
        _count: { select: { variants: true } },
      },
    }),
    db.product.count({ where }),
    db.product.count(),
    ...SHOW.map((s) => db.product.count({ where: WHERE[s] })),
  ]);
  const [all, ...byShow] = counts;
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Product",
      sortKey: "name",
      cell: (p) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/catalog/products/${p.id}`} className="font-medium hover:underline">
            {p.name}
          </Link>
          {p.isAddon && <Badge variant="secondary">Add-on</Badge>}
        </div>
      ),
    },
    { key: "type", header: "Type", sortKey: "type", cell: (p) => (p.type === "SERVICE" ? "Service" : "Goods") },
    {
      key: "salesPrice",
      header: "Sales price",
      sortKey: "salesPrice",
      align: "right",
      cell: (p) => <span className="tabular-nums">{formatMoney(p.salesPrice)}</span>,
    },
    {
      key: "costPrice",
      header: "Cost price",
      sortKey: "costPrice",
      align: "right",
      cell: (p) => <span className="tabular-nums">{formatMoney(p.costPrice)}</span>,
    },
    {
      key: "taxes",
      header: "Default taxes",
      cell: (p) =>
        p.taxes.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {p.taxes.map((t) => (
              <Badge key={t.name} variant="outline">
                {t.name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "variants",
      header: "Variants",
      align: "right",
      cell: (p) => <span className="tabular-nums">{p._count.variants}</span>,
    },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description={
          canEdit
            ? "What Brightloop sells. A plan sets how a product is billed; variants are the choices it comes in."
            : "What Brightloop sells. View only: an admin changes these."
        }
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/catalog/products/new">
                <PlusIcon />
                Add product
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
            { value: "SERVICE", label: "Services", count: byShow[0] },
            { value: "GOODS", label: "Goods", count: byShow[1] },
            { value: "ADDON", label: "Add-ons", count: byShow[2] },
            { value: "INACTIVE", label: "Inactive", count: byShow[3] },
          ]}
        />
        <SearchInput placeholder="Search products…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(p) => p.id}
        emptyTitle="No products yet"
        emptyDescription={canEdit ? "Add the first product, then give it a plan." : undefined}
      />
    </>
  );
}
