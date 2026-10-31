import type { Metadata } from "next";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { SearchInput } from "@/components/app/search-input";
import { StatusBadge } from "@/components/app/status-badge";
import { DataTable, type Column } from "@/components/app/data-table";
import { Badge } from "@/components/ui/badge";
import { Prisma } from "@/generated/prisma/client";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param, parseListParams } from "@/lib/list-params";
import { requireAdmin } from "@/lib/session";
import { AddStaffDialog } from "./add-staff-dialog";
import { UserRowActions } from "./user-row-actions";

export const metadata: Metadata = { title: "Users" };

const SORTABLE = ["name", "email", "role", "createdAt"] as const;
const ROLES = ["ADMIN", "STAFF", "CUSTOMER"] as const;
const ROLE_LABEL = { ADMIN: "Admin", STAFF: "Staff", CUSTOMER: "Customer" } as const;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const params = parseListParams(sp, { sortable: SORTABLE, defaultSort: "createdAt", defaultDir: "desc" });
  const role = ROLES.find((r) => r === param(sp, "role"));

  const where: Prisma.UserWhereInput = {
    ...(role && { role }),
    ...(params.q && {
      OR: [
        { name: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
      ],
    }),
  };

  const [rows, total, byRole] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { [params.sort]: params.dir },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        // A user with no credential account hasn't set a password yet (an invited staff member).
        accounts: { where: { providerId: "credential" }, select: { id: true }, take: 1 },
      },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);

  const count = (r: (typeof ROLES)[number]) => byRole.find((g) => g.role === r)?._count._all ?? 0;
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", sortKey: "name", cell: (u) => <span className="font-medium">{u.name}</span> },
    { key: "email", header: "Email", sortKey: "email", cell: (u) => u.email },
    {
      key: "role",
      header: "Role",
      sortKey: "role",
      cell: (u) => <Badge variant="secondary">{ROLE_LABEL[u.role]}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (u) =>
        !u.active ? (
          <StatusBadge status="DEACTIVATED" />
        ) : u.accounts.length === 0 ? (
          <StatusBadge status="PENDING" />
        ) : (
          <StatusBadge status="ACTIVE" />
        ),
    },
    { key: "createdAt", header: "Added", sortKey: "createdAt", cell: (u) => formatDate(u.createdAt) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (u) => (
        <UserRowActions
          user={{ id: u.id, name: u.name, active: u.active, pending: u.accounts.length === 0, isSelf: u.id === admin.id }}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can log in. Staff are added here; customers sign themselves up."
        actions={<AddStaffDialog />}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          param="role"
          value={role ?? ""}
          raw={sp}
          tabs={[
            { value: "", label: "All", count: ROLES.reduce((n, r) => n + count(r), 0) },
            { value: "ADMIN", label: "Admins", count: count("ADMIN") },
            { value: "STAFF", label: "Staff", count: count("STAFF") },
            { value: "CUSTOMER", label: "Customers", count: count("CUSTOMER") },
          ]}
        />
        <SearchInput placeholder="Search name or email…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        getRowKey={(u) => u.id}
        emptyTitle="No users"
      />
    </>
  );
}
