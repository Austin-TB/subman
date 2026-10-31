// Line and document totals (PLAN.md §4.5). The subscription line editor shows these live and Phase 4 builds
// invoices with the same functions, so the two can never disagree. Everything is integer minor units.
import { applyBps } from "@/lib/money";

export type TaxRule = { name: string; kind: "PERCENT" | "FIXED"; rate: number };
export type TaxAmount = TaxRule & { amount: number };

export type LineInput = {
  quantity: number;
  unitPrice: number;
  /** A discount already worked out for this line. It can't take the line below zero. */
  discountAmount?: number;
  taxes: TaxRule[];
};

export type LineTotals = {
  amount: number;
  discountAmount: number;
  /** amount − discount: what tax is charged on */
  subtotal: number;
  taxes: TaxAmount[];
  taxAmount: number;
  total: number;
};

/**
 * One line: amount = quantity × unit price, subtotal = amount − discount.
 * A percentage tax is charged on the subtotal and a fixed tax per unit, each rounded half-up on its own,
 * so the amounts shown beside each tax always add up to the line's tax.
 */
export function calcLine(line: LineInput): LineTotals {
  const amount = line.quantity * line.unitPrice;
  const discountAmount = Math.min(Math.max(line.discountAmount ?? 0, 0), amount);
  const subtotal = amount - discountAmount;
  const taxes = line.taxes.map((t) => ({
    ...t,
    amount: t.kind === "PERCENT" ? applyBps(subtotal, t.rate) : t.rate * line.quantity,
  }));
  const taxAmount = taxes.reduce((sum, t) => sum + t.amount, 0);
  return { amount, discountAmount, subtotal, taxes, taxAmount, total: subtotal + taxAmount };
}

export type DocumentTotals = {
  lines: LineTotals[];
  untaxed: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  /** Tax per tax name across all lines, in the order each first appears: "GST 18%" → 1,800. */
  taxBreakdown: { name: string; amount: number }[];
};

export function calcTotals(inputs: LineInput[]): DocumentTotals {
  const lines = inputs.map(calcLine);
  const byTax = new Map<string, number>();
  for (const line of lines) for (const t of line.taxes) byTax.set(t.name, (byTax.get(t.name) ?? 0) + t.amount);

  const untaxed = lines.reduce((s, l) => s + l.subtotal, 0);
  const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  return {
    lines,
    untaxed,
    discountTotal: lines.reduce((s, l) => s + l.discountAmount, 0),
    taxTotal,
    total: untaxed + taxTotal,
    taxBreakdown: [...byTax].map(([name, amount]) => ({ name, amount })),
  };
}
