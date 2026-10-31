import { daysBetween } from "@/lib/dates";

type InvoiceLike = { status: string; dueDate: Date; amountDue: number };

/** Overdue = Confirmed, past the due date, with an amount still due (PLAN.md defaults). */
export const isOverdue = (i: InvoiceLike, today: Date) => i.status === "CONFIRMED" && i.amountDue > 0 && i.dueDate < today;

/** The status to show: the stored one, or OVERDUE for a confirmed invoice past its due date. */
export const invoiceDisplayStatus = (i: InvoiceLike, today: Date) => (isOverdue(i, today) ? "OVERDUE" : i.status);

export const daysOverdue = (i: InvoiceLike, today: Date) => (isOverdue(i, today) ? daysBetween(i.dueDate, today) : 0);

export const AGING_BUCKETS = [
  { key: "0-30", label: "0–30 days", min: 1, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "61-90", label: "61–90 days", min: 61, max: 90 },
  { key: "90+", label: "90+ days", min: 91, max: 100_000 },
] as const;

export const PAYMENT_METHODS = [
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
];
