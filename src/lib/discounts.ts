import { formatBps, formatMoney } from "@/lib/money";

export type DiscountRule = {
  active: boolean;
  startDate: Date;
  endDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
};

export type DiscountState = "INACTIVE" | "EXPIRED" | "USED_UP" | "SCHEDULED" | "ACTIVE";

/**
 * Why a rule does or doesn't apply on a business date (PLAN.md §4.4).
 * A rule applies to an invoice dated `on` only when this is "ACTIVE": switched on, within its dates, with uses left.
 */
export function discountState(rule: DiscountRule, on: Date): DiscountState {
  if (!rule.active) return "INACTIVE";
  if (rule.endDate && rule.endDate < on) return "EXPIRED";
  if (rule.usageLimit != null && rule.usedCount >= rule.usageLimit) return "USED_UP";
  if (rule.startDate > on) return "SCHEDULED";
  return "ACTIVE";
}

export const isDiscountLive = (rule: DiscountRule, on: Date) => discountState(rule, on) === "ACTIVE";

/** "10% off", "₹500.00 off" */
export function discountValueLabel(d: { kind: "PERCENT" | "FIXED"; value: number }): string {
  return `${d.kind === "PERCENT" ? formatBps(d.value) : formatMoney(d.value)} off`;
}

/** "20+ seats · min ₹10,000.00", or "No minimum" */
export function discountConditions(d: { minQuantity: number | null; minPurchase: number | null }): string {
  const parts: string[] = [];
  if (d.minQuantity) parts.push(`${d.minQuantity}+ seats`);
  if (d.minPurchase) parts.push(`min ${formatMoney(d.minPurchase)}`);
  return parts.length ? parts.join(" · ") : "No minimum";
}
