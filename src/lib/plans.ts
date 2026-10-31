import { formatPeriod, type Period } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export type PlanTerms = {
  price: number;
  period: Period;
  interval: number;
  minQuantity: number;
  autoClose: boolean;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
};

/** "₹1,200.00 / month", "₹100.00 / 3 months" */
export function planPrice(plan: Pick<PlanTerms, "price" | "period" | "interval">): string {
  return `${formatMoney(plan.price)} / ${formatPeriod(plan.period, plan.interval)}`;
}

/** "₹1,200.00 / month · min 5 · Closable · Pausable · Renewable" */
export function planSummary(plan: PlanTerms): string {
  const parts = [planPrice(plan)];
  if (plan.minQuantity > 1) parts.push(`min ${plan.minQuantity}`);
  if (plan.closable) parts.push("Closable");
  if (plan.pausable) parts.push("Pausable");
  if (plan.renewable) parts.push("Renewable");
  if (plan.autoClose) parts.push("Auto-close");
  return parts.join(" · ");
}

export type PlanAvailability = "INACTIVE" | "SCHEDULED" | "ENDED" | "AVAILABLE";

/** Whether a plan can be sold on a business date: switched on, and inside its available dates. */
export function planAvailability(
  plan: { active: boolean; availableFrom: Date; availableUntil: Date | null },
  on: Date,
): PlanAvailability {
  if (!plan.active) return "INACTIVE";
  if (plan.availableFrom > on) return "SCHEDULED";
  if (plan.availableUntil && plan.availableUntil < on) return "ENDED";
  return "AVAILABLE";
}

export const isPlanAvailableOn = (plan: Parameters<typeof planAvailability>[0], on: Date) =>
  planAvailability(plan, on) === "AVAILABLE";
