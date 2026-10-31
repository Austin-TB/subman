import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = {
  gray: "border-transparent bg-muted text-muted-foreground",
  blue: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300",
  violet: "border-transparent bg-violet-500/10 text-violet-700 dark:text-violet-300",
  green: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
  red: "border-transparent bg-red-500/10 text-red-700 dark:text-red-300",
} as const;

type Tone = keyof typeof TONES;

// Subscription, invoice and email statuses share one badge.
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  QUOTATION: { label: "Quotation", tone: "blue" },
  CONFIRMED: { label: "Confirmed", tone: "violet" },
  ACTIVE: { label: "Active", tone: "green" },
  PAUSED: { label: "Paused", tone: "amber" },
  CLOSED: { label: "Closed", tone: "gray" },
  PAID: { label: "Paid", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "red" },
  OVERDUE: { label: "Overdue", tone: "red" },
  EXPIRED: { label: "Expired", tone: "amber" },
  SENT: { label: "Sent", tone: "green" },
  LOGGED: { label: "Outbox only", tone: "gray" },
  FAILED: { label: "Failed", tone: "red" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const s = STATUS[status] ?? { label: status, tone: "gray" as Tone };
  return (
    <Badge variant="outline" className={cn(TONES[s.tone], className)}>
      {label ?? s.label}
    </Badge>
  );
}
