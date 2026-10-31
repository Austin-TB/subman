import type { Metadata } from "next";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";
import { formatTaxRate } from "@/lib/taxes";
import { TaxDialog } from "./tax-dialog";

export const metadata: Metadata = { title: "Taxes" };

const SORTABLE = ["name", "kind", "rate"] as const;

export default async function TaxesPage({ searchParams }: PageProps<"/settings/taxes">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const params = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });

  const [rows, total] = await Promise.all([
    db.tax.findMany({
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: { id: true, name: true, kind: true, rate: true, active: true, _count: { select: { products: true } } },
    }),
    db.tax.count(),
  ]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", sortKey: "name", cell: (t) => <span className="font-medium">{t.name}</span> },
    { key: "kind", header: "Type", sortKey: "kind", cell: (t) => (t.kind === "PERCENT" ? "Percentage" : "Fixed per unit") },
    { key: "rate", header: "Rate", sortKey: "rate", cell: (t) => <span className="tabular-nums">{formatTaxRate(t)}</span> },
    {
      key: "products",
      header: "Default on",
      cell: (t) => (t._count.products === 1 ? "1 product" : `${t._count.products} products`),
    },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.active ? "ACTIVE" : "INACTIVE"} /> },
  ];
  if (canEdit) {
    columns.push({
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (t) => <TaxDialog tax={{ id: t.id, name: t.name, kind: t.kind, rate: t.rate, active: t.active }} />,
    });
  }

  return (
    <>
      <PageHeader
        title="Taxes"
        description={
          canEdit
            ? "Rules for the tax added to invoice lines. Set a product's default taxes on the product."
            : "Rules for the tax added to invoice lines. View only: an admin changes these."
        }
        actions={canEdit && <TaxDialog />}
      />
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(t) => t.id}
        emptyTitle="No taxes yet"
        emptyDescription="Add a tax, then make it a default on products."
      />
    </>
  );
}
