// Line pricing (PLAN.md §4.2). Phase 4 adds the invoice maths next to this file.

/**
 * The unit price a new line starts with, per billing period.
 * The plan's own line uses the plan price (not the product's sales price); every other line uses its
 * product's sales price. A variant's extra price is added on top in both cases.
 */
export function defaultUnitPrice(args: {
  isPlanLine: boolean;
  planPrice: number;
  productPrice: number;
  variantExtra?: number | null;
}): number {
  return (args.isPlanLine ? args.planPrice : args.productPrice) + (args.variantExtra ?? 0);
}

/** Money columns are 32-bit. Capping what a subscription bills per period leaves room for tax on its invoices. */
export const MAX_RECURRING_AMOUNT = 1_500_000_000;

/** What a set of lines bills per period before tax and discounts: the sum of quantity × unit price. */
export function recurringAmount(lines: { quantity: number; unitPrice: number }[]): number {
  return lines.reduce((total, l) => total + l.quantity * l.unitPrice, 0);
}
