import { formatBps, formatMoney } from "@/lib/money";

/** "18%" for a percentage tax, "₹5.00 per unit" for a fixed one. */
export function formatTaxRate(tax: { kind: "PERCENT" | "FIXED"; rate: number }): string {
  return tax.kind === "PERCENT" ? formatBps(tax.rate) : `${formatMoney(tax.rate)} per unit`;
}
