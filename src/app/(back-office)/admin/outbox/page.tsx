import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { StatusBadge } from "@/components/app/status-badge";
import { DataTable, type Column } from "@/components/app/data-table";
import { Prisma } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Outbox" };

const SORTABLE = ["createdAt", "to", "subject", "status"] as const;

export default async function OutboxPage({ searchParams }: PageProps<"/admin/outbox">) {
  await requireAdmin();
  const params = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "createdAt", defaultDir: "desc" });

  const where: Prisma.EmailLogWhereInput = params.q
    ? {
        OR: [
          { to: { contains: params.q, mode: "insensitive" } },
          { subject: { contains: params.q, mode: "insensitive" } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.emailLog.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      // The body can be large and isn't shown in the list.
      select: { id: true, to: true, subject: true, status: true, createdAt: true },
    }),
    db.emailLog.count({ where }),
  ]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: "createdAt", header: "Sent", sortKey: "createdAt", cell: (e) => formatDateTime(e.createdAt), className: "whitespace-nowrap" },
    { key: "to", header: "To", sortKey: "to", cell: (e) => e.to },
    {
      key: "subject",
      header: "Subject",
      sortKey: "subject",
      cell: (e) => (
        <Link href={`/admin/outbox/${e.id}`} className="font-medium underline-offset-4 hover:underline">
          {e.subject}
        </Link>
      ),
    },
    { key: "status", header: "Status", sortKey: "status", cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Outbox"
        description="Every email the system sends is saved here, whether or not SMTP is set up. Open one to read it and follow its links."
      />
      <SearchInput placeholder="Search recipient or subject…" />
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(e) => e.id}
        emptyTitle="No emails yet"
        emptyDescription="Emails appear here as soon as the system sends one, such as a password reset link."
      />
    </>
  );
}
