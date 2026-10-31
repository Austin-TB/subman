import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { Button } from "@/components/ui/button";
import { Prisma } from "@/generated/prisma/client";
import { defaultUnitPrice, recurringAmount } from "@/lib/billing/pricing";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";

export const metadata: Metadata = { title: "Quotation templates" };

const SORTABLE = ["name", "validityDays", "createdAt"] as const;

export default async function TemplatesPage({ searchParams }: PageProps<"/catalog/templates">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const params = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });

  const where: Prisma.QuotationTemplateWhereInput = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" } },
          { plan: { name: { contains: params.q, mode: "insensitive" } } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.quotationTemplate.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        name: true,
        validityDays: true,
        plan: { select: { id: true, name: true, price: true } },
        lines: {
          select: {
            quantity: true,
            unitPrice: true,
            isPlanLine: true,
            product: { select: { salesPrice: true } },
            variant: { select: { extraPrice: true } },
          },
        },
      },
    }),
    db.quotationTemplate.count({ where }),
  ]);
  type Row = (typeof rows)[number];

  // What each template bills per period: an empty price on a line means the current price.
  const perPeriod = (t: Row) =>
    recurringAmount(
      t.lines.map((l) => ({
        quantity: l.quantity,
        unitPrice:
          l.unitPrice ??
          defaultUnitPrice({
            isPlanLine: l.isPlanLine,
            planPrice: t.plan.price,
            productPrice: l.product.salesPrice,
            variantExtra: l.variant?.extraPrice,
          }),
      })),
    );

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Template",
      sortKey: "name",
      cell: (t) => (
        <Link href={`/catalog/templates/${t.id}`} className="font-medium hover:underline">
          {t.name}
        </Link>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      cell: (t) => (
        <Link href={`/catalog/plans/${t.plan.id}`} className="hover:underline">
          {t.plan.name}
        </Link>
      ),
    },
    { key: "validity", header: "Quotation valid for", sortKey: "validityDays", cell: (t) => `${t.validityDays} days` },
    { key: "lines", header: "Lines", align: "right", cell: (t) => <span className="tabular-nums">{t.lines.length}</span> },
    {
      key: "amount",
      header: "Per billing period",
      align: "right",
      cell: (t) => <span className="tabular-nums">{formatMoney(perPeriod(t))}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotation templates"
        description={
          canEdit
            ? "A ready-made offer: the plan, its lines and how long a quotation stays valid. Start a subscription from one instead of from scratch."
            : "A ready-made offer to start a subscription from. View only: an admin changes these."
        }
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/catalog/templates/new">
                <PlusIcon />
                Add template
              </Link>
            </Button>
          )
        }
      />
      <div className="flex justify-end">
        <SearchInput placeholder="Search templates or plans…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(t) => t.id}
        emptyTitle="No templates yet"
        emptyDescription={canEdit ? "Create a plan first, then a template that uses it." : undefined}
      />
    </>
  );
}
