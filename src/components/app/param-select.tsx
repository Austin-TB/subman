"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A small native select that writes one URL param (and goes back to page 1). An empty value clears it. */
export function ParamSelect({ param, options, placeholder }: { param: string; options: { value: string; label: string }[]; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label={placeholder}
      value={sp.get(param) ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set(param, e.target.value);
        else next.delete(param);
        next.delete("page");
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
      className="h-8 rounded-lg border bg-transparent px-2.5 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
