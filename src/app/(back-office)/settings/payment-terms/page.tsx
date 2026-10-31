import type { Metadata } from "next";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";
import { PaymentTermDialog, PaymentTermRowActions } from "./payment-term-dialog";

export const metadata: Metadata = { title: "Payment terms" };

const SORTABLE = ["name", "dueDays"] as const;

export default async function PaymentTermsPage({ searchParams }: PageProps<"/settings/payment-terms">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const params = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "dueDays", defaultDir: "asc" });

  const [rows, total] = await Promise.all([
    db.paymentTerm.findMany({
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: { id: true, name: true, dueDays: true, _count: { select: { subscriptions: true } } },
    }),
    db.paymentTerm.count(),
  ]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", sortKey: "name", cell: (t) => <span className="font-medium">{t.name}</span> },
    {
      key: "dueDays",
      header: "Due",
      sortKey: "dueDays",
      cell: (t) => (t.dueDays === 0 ? "On the invoice date" : `${t.dueDays} days after the invoice date`),
    },
    {
      key: "subscriptions",
      header: "Used by",
      cell: (t) => (t._count.subscriptions === 1 ? "1 subscription" : `${t._count.subscriptions} subscriptions`),
    },
  ];
  if (canEdit) {
    columns.push({
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (t) => (
        <PaymentTermRowActions term={{ id: t.id, name: t.name, dueDays: t.dueDays, inUse: t._count.subscriptions > 0 }} />
      ),
    });
  }

  return (
    <>
      <PageHeader
        title="Payment terms"
        description={
          canEdit
            ? "When an invoice falls due. Each subscription picks one, and the due date is the invoice date plus its days."
            : "When an invoice falls due. View only: an admin changes these."
        }
        actions={canEdit && <PaymentTermDialog />}
      />
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(t) => t.id}
        emptyTitle="No payment terms yet"
        emptyDescription="Add one (Immediate, Net 15, Net 30…) before creating subscriptions."
      />
    </>
  );
}
