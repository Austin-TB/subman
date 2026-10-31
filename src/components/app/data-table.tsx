import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, ChevronLeftIcon, ChevronRightIcon, InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type ListParams, withParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Set to the sort key accepted by the page's parseListParams to make the header clickable. */
  sortKey?: string;
  align?: "left" | "right" | "center";
  className?: string;
};

/**
 * Server-rendered table. Paging and sorting are plain links that change URL params,
 * so the page re-queries the database with LIMIT/OFFSET and ORDER BY.
 */
export function DataTable<T>({
  columns,
  rows,
  total,
  params,
  getRowKey,
  emptyTitle = "Nothing here yet",
  emptyDescription,
}: {
  columns: Column<T>[];
  rows: T[];
  total: number;
  params: ListParams;
  getRowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  const pages = Math.max(Math.ceil(total / params.pageSize), 1);
  const from = total === 0 ? 0 : params.skip + 1;
  const to = Math.min(params.skip + rows.length, total);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={cn(alignClass(col.align), col.className)}>
                  {col.sortKey ? <SortLink col={col} params={params} /> : col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <InboxIcon />
                      </EmptyMedia>
                      <EmptyTitle>{params.q ? "No matches" : emptyTitle}</EmptyTitle>
                      {(params.q || emptyDescription) && (
                        <EmptyDescription>
                          {params.q ? `Nothing matches “${params.q}”.` : emptyDescription}
                        </EmptyDescription>
                      )}
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={getRowKey(row)}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={cn(alignClass(col.align), col.className)}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              Page {params.page} of {pages.toLocaleString()}
            </span>
            <PageButton params={params} page={params.page - 1} disabled={params.page <= 1} label="Previous page">
              <ChevronLeftIcon />
            </PageButton>
            <PageButton params={params} page={params.page + 1} disabled={params.page >= pages} label="Next page">
              <ChevronRightIcon />
            </PageButton>
          </div>
        </div>
      )}
    </div>
  );
}

function alignClass(align?: "left" | "right" | "center") {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : undefined;
}

function SortLink<T>({ col, params }: { col: Column<T>; params: ListParams }) {
  const active = params.sort === col.sortKey;
  const nextDir = active && params.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDownIcon : params.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Link
      href={withParams(params.raw, { sort: col.sortKey, dir: nextDir, page: null })}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        col.align === "right" && "flex-row-reverse",
        active && "text-foreground",
      )}
    >
      {col.header}
      <Icon className={cn("size-3.5", !active && "opacity-40")} />
    </Link>
  );
}

function PageButton({
  params,
  page,
  disabled,
  label,
  children,
}: {
  params: ListParams;
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon-sm" asChild>
      <Link href={withParams(params.raw, { page })} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
