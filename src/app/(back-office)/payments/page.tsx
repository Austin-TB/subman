import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type Column } from "@/components/app/data-table";
import { DateRange } from "@/components/app/date-range";
import { PageHeader } from "@/components/app/page-header";
import { ParamSelect } from "@/components/app/param-select";
import { SearchInput } from "@/components/app/search-input";
import { Prisma, type PaymentMethod } from "@/generated/prisma/client";
import { formatDate, tryParseDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param, parseListParams } from "@/lib/list-params";
import { formatMoney } from "@/lib/money";
import { requireBackOffice } from "@/lib/session";
import { PAYMENT_METHODS } from "@/lib/billing/status";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  await requireBackOffice();
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: ["paymentDate", "amount"] as const, defaultSort: "paymentDate" });
  const method = PAYMENT_METHODS.find((m) => m.value === param(sp, "method"))?.value as PaymentMethod | undefined;
  const from = tryParseDate(param(sp, "from"));
  const to = tryParseDate(param(sp, "to"));

  const where: Prisma.PaymentWhereInput = {
    AND: [
      method ? { method } : {},
      from || to ? { paymentDate: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {},
      params.q
        ? {
            OR: [
              { invoice: { number: { contains: params.q, mode: "insensitive" } } },
              { invoice: { customer: { name: { contains: params.q, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, sum] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      include: { invoice: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } }, recordedBy: { select: { name: true } } },
    }),
    db.payment.count({ where }),
    db.payment.aggregate({ where, _sum: { amount: true } }),
  ]);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "date", header: "Date", sortKey: "paymentDate", cell: (p) => formatDate(p.paymentDate) },
    {
      key: "invoice",
      header: "Invoice",
      cell: (p) => (
        <Link href={`/invoices/${p.invoice.id}`} className="font-medium hover:underline">
          {p.invoice.number}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (p) => (
        <Link href={`/customers/${p.invoice.customer.id}`} className="hover:underline">
          {p.invoice.customer.name}
        </Link>
      ),
    },
    { key: "method", header: "Method", cell: (p) => PAYMENT_METHODS.find((m) => m.value === p.method)?.label },
    { key: "note", header: "Note", cell: (p) => p.note ?? "—" },
    { key: "by", header: "Recorded by", cell: (p) => p.recordedBy?.name ?? "—" },
    { key: "amount", header: "Amount", sortKey: "amount", align: "right", cell: (p) => <span className="tabular-nums">{formatMoney(p.amount)}</span> },
  ];

  return (
    <>
      <PageHeader title="Payments" description={`${total.toLocaleString()} payments · ${formatMoney(sum._sum.amount ?? 0)} collected`} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ParamSelect param="method" placeholder="All methods" options={PAYMENT_METHODS} />
        <DateRange />
        <SearchInput placeholder="Invoice or customer…" />
      </div>
      <DataTable columns={columns} rows={rows} total={total} params={params} getRowKey={(p) => p.id} emptyTitle="No payments yet" />
    </>
  );
}
