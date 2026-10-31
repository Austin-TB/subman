import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "QUOTATION", label: "Quotation" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "ACTIVE", label: "Active" },
  { key: "CLOSED", label: "Closed" },
] as const;

/** Where a subscription stands: Draft → Quotation → Confirmed → Active → Closed. Paused shows on the Active step. */
export function SubscriptionStatusBar({ status, note }: { status: string; note?: string }) {
  const at = STEPS.findIndex((s) => s.key === (status === "PAUSED" ? "ACTIVE" : status));
  return (
    <div className="flex flex-col gap-1">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1",
                i < at && "border-transparent bg-muted text-muted-foreground",
                i === at && "border-primary bg-primary font-medium text-primary-foreground",
                i > at && "text-muted-foreground",
              )}
            >
              {i < at && <CheckIcon className="size-3.5" />}
              {s.label}
              {i === at && status === "PAUSED" && " · Paused"}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        ))}
      </ol>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
