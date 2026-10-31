import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { Button } from "@/components/ui/button";
import { Prisma } from "@/generated/prisma/client";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { requireBackOffice } from "@/lib/session";

export const metadata: Metadata = { title: "Customers" };

const SORTABLE = ["name", "email", "createdAt"] as const;

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireBackOffice();
  const params = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });

  const where: Prisma.CustomerWhereInput = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" } },
          { company: { contains: params.q, mode: "insensitive" } },
          { email: { contains: params.q, mode: "insensitive" } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        phone: true,
        city: true,
        createdAt: true,
        user: { select: { id: true } },
        _count: { select: { subscriptions: true } },
      },
    }),
    db.customer.count({ where }),
  ]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Customer",
      sortKey: "name",
      cell: (c) => (
        <Link href={`/customers/${c.id}`} className="hover:underline">
          <div className="font-medium">{c.name}</div>
          {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
        </Link>
      ),
    },
    { key: "email", header: "Email", sortKey: "email", cell: (c) => c.email },
    { key: "phone", header: "Phone", cell: (c) => c.phone ?? "—" },
    { key: "city", header: "City", cell: (c) => c.city ?? "—" },
    { key: "portal", header: "Portal", cell: (c) => (c.user ? "Yes" : "—") },
    {
      key: "subs",
      header: "Subscriptions",
      align: "right",
      cell: (c) => <span className="tabular-nums">{c._count.subscriptions}</span>,
    },
    { key: "created", header: "Added", sortKey: "createdAt", cell: (c) => formatDate(c.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone Brightloop bills, with their subscriptions and invoices."
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <PlusIcon />
              Add customer
            </Link>
          </Button>
        }
      />
      <div className="flex justify-end">
        <SearchInput placeholder="Search name, company or email…" />
      </div>
      <DataTable columns={columns} rows={rows} total={total} params={params} getRowKey={(c) => c.id} emptyTitle="No customers yet" />
    </>
  );
}
