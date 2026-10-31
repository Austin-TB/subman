// Building an invoice from a subscription's lines (PLAN.md §4.3–4.5): billing periods, automatic discounts,
// taxes and totals. Pure functions only; run.ts does the database work.
import { calcLine, type LineTotals, type TaxRule } from "@/lib/billing/totals";
import { addDays, periodStart, type Period } from "@/lib/dates";
import { applyBps } from "@/lib/money";

// ───────────── Periods ─────────────

/** Index k of the period that contains `date`, counting from `anchor` (period 0 starts on the anchor). */
export function periodIndex(anchor: Date, period: Period, interval: number, date: Date): number {
  let k = 0;
  while (periodStart(anchor, period, interval, k + 1) <= date) k++;
  return k;
}

/** The period that starts on `start` (or contains it): its first and last day, and when the next one starts. */
export function periodAt(anchor: Date, period: Period, interval: number, start: Date) {
  const k = periodIndex(anchor, period, interval, start);
  const next = periodStart(anchor, period, interval, k + 1);
  return { start, end: addDays(next, -1), next };
}

// ───────────── Discounts ─────────────

export type DiscountRuleInput = {
  id: string;
  name: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  scope: "PRODUCTS" | "SUBSCRIPTION";
  minPurchase: number | null;
  minQuantity: number | null;
  productIds: string[];
};

export type BillLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxes: TaxRule[];
};

export type BuiltLine = BillLine & LineTotals & { discountName: string | null };

export type BuiltInvoice = {
  lines: BuiltLine[];
  untaxed: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  /** One use per rule that saved something on this invoice. */
  usages: { discountId: string; amount: number }[];
};

const saving = (rule: DiscountRuleInput, base: number) =>
  rule.kind === "PERCENT" ? applyBps(base, rule.value) : Math.min(rule.value, base);

const meets = (rule: DiscountRuleInput, quantity: number, amount: number) =>
  (rule.minQuantity == null || quantity >= rule.minQuantity) && (rule.minPurchase == null || amount >= rule.minPurchase);

/**
 * Applies the live rules and totals the invoice. Discounts don't stack: a line gets at most one product rule and
 * the invoice at most one subscription rule, whichever saves more. A subscription discount is split across the
 * lines in proportion to their amounts, so tax is charged on the discounted amounts.
 */
export function buildInvoice(lines: BillLine[], rules: DiscountRuleInput[]): BuiltInvoice {
  const amounts = lines.map((l) => l.quantity * l.unitPrice);
  const discount = lines.map(() => 0);
  const names: (string | null)[] = lines.map(() => null);
  const used = new Map<string, number>();
  const record = (id: string, amount: number) => used.set(id, (used.get(id) ?? 0) + amount);

  // Product rules, line by line.
  const productRules = rules.filter((r) => r.scope === "PRODUCTS");
  lines.forEach((line, i) => {
    let best: { rule: DiscountRuleInput; amount: number } | null = null;
    for (const rule of productRules) {
      if (!line.productId || !rule.productIds.includes(line.productId)) continue;
      if (!meets(rule, line.quantity, amounts[i])) continue;
      const amount = saving(rule, amounts[i]);
      if (amount > 0 && (!best || amount > best.amount)) best = { rule, amount };
    }
    if (best) {
      discount[i] = best.amount;
      names[i] = best.rule.name;
      record(best.rule.id, best.amount);
    }
  });

  // One subscription rule on what is left.
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const gross = amounts.reduce((s, a) => s + a, 0);
  const remaining = amounts.map((a, i) => a - discount[i]);
  const base = remaining.reduce((s, a) => s + a, 0);
  let best: { rule: DiscountRuleInput; amount: number } | null = null;
  for (const rule of rules.filter((r) => r.scope === "SUBSCRIPTION")) {
    if (!meets(rule, totalQty, gross)) continue;
    const amount = saving(rule, base);
    if (amount > 0 && (!best || amount > best.amount)) best = { rule, amount };
  }
  if (best && base > 0) {
    // Split in proportion; the rounding remainder goes to the largest line.
    const shares = remaining.map((r) => Math.floor((best.amount * r) / base));
    const largest = remaining.indexOf(Math.max(...remaining));
    shares[largest] += best.amount - shares.reduce((s, x) => s + x, 0);
    shares.forEach((share, i) => {
      if (share <= 0) return;
      discount[i] += share;
      names[i] = names[i] ? `${names[i]}, ${best.rule.name}` : best.rule.name;
    });
    record(best.rule.id, best.amount);
  }

  const built = lines.map((line, i) => ({
    ...line,
    ...calcLine({ quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: discount[i], taxes: line.taxes }),
    discountName: names[i],
  }));
  const untaxed = built.reduce((s, l) => s + l.subtotal, 0);
  const taxTotal = built.reduce((s, l) => s + l.taxAmount, 0);
  return {
    lines: built,
    untaxed,
    discountTotal: built.reduce((s, l) => s + l.discountAmount, 0),
    taxTotal,
    total: untaxed + taxTotal,
    usages: [...used].map(([discountId, amount]) => ({ discountId, amount })),
  };
}
