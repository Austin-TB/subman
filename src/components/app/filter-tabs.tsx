import Link from "next/link";
import { type SearchParams, withParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export type FilterTab = { value: string; label: string; count?: number };

/**
 * Link-based tabs that set one URL param (and go back to page 1), e.g. ?role=STAFF.
 * A tab with an empty value clears the param.
 */
export function FilterTabs({
  tabs,
  param,
  value,
  raw,
}: {
  tabs: FilterTab[];
  param: string;
  value: string;
  raw: SearchParams;
}) {
  return (
    <nav aria-label="Filter" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1 text-sm">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <Link
            key={tab.value || "all"}
            href={withParams(raw, { [param]: tab.value || null, page: null })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            {tab.label}
            {tab.count != null && <span className="text-xs text-muted-foreground tabular-nums">{tab.count.toLocaleString()}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
