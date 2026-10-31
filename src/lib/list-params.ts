// Paging, sorting and search for list pages, all kept in URL params
// so every filtered view can be linked to and survives a refresh.

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams<S extends string = string> = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  q: string;
  sort: S;
  dir: "asc" | "desc";
  /** Raw params, for building links that keep the current filters. */
  raw: SearchParams;
};

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseListParams<S extends string>(
  sp: SearchParams,
  opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc"; pageSize?: number },
): ListParams<S> {
  const pageSize = Math.min(Math.max(Number(param(sp, "size")) || opts.pageSize || 25, 5), 100);
  const page = Math.max(Number(param(sp, "page")) || 1, 1);
  const sortParam = param(sp, "sort") as S | undefined;
  const sort = sortParam && opts.sortable.includes(sortParam) ? sortParam : opts.defaultSort;
  const dirParam = param(sp, "dir");
  const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : (opts.defaultDir ?? "desc");
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    q: (param(sp, "q") ?? "").trim().slice(0, 100),
    sort,
    dir,
    raw: sp,
  };
}

/** Builds "?a=1&b=2" from the current params with some keys changed (null removes a key). */
export function withParams(sp: SearchParams, patch: Record<string, string | number | null | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    for (const one of Array.isArray(v) ? v : [v]) out.append(k, one);
  }
  for (const [k, v] of Object.entries(patch)) {
    out.delete(k);
    if (v != null && v !== "") out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "?";
}
