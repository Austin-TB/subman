"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/** From / to date boxes kept in ?from= and ?to=. */
export function DateRange({ fromParam = "from", toParam = "to" }: { fromParam?: string; toParam?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="flex items-center gap-1 text-sm">
      <Input type="date" aria-label="From" className="w-36" value={sp.get(fromParam) ?? ""} onChange={(e) => set(fromParam, e.target.value)} />
      <span className="text-muted-foreground">to</span>
      <Input type="date" aria-label="To" className="w-36" value={sp.get(toParam) ?? ""} onChange={(e) => set(toParam, e.target.value)} />
    </div>
  );
}
