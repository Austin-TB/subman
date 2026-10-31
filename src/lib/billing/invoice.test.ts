import { describe, expect, it } from "vitest";
import { buildInvoice, periodAt, periodIndex, type DiscountRuleInput } from "@/lib/billing/invoice";
import { parseDate } from "@/lib/dates";

const d = parseDate;
const gst18 = { name: "GST 18%", kind: "PERCENT" as const, rate: 1800 };

const rule = (over: Partial<DiscountRuleInput>): DiscountRuleInput => ({
  id: "r1",
  name: "10% off",
  kind: "PERCENT",
  value: 1000,
  scope: "SUBSCRIPTION",
  minPurchase: null,
  minQuantity: null,
  productIds: [],
  ...over,
});

describe("periods", () => {
  it("clamps month ends and returns to the original day", () => {
    const a = d("2026-01-31");
    expect(periodAt(a, "MONTHLY", 1, d("2026-01-31"))).toEqual({ start: d("2026-01-31"), end: d("2026-02-27"), next: d("2026-02-28") });
    expect(periodAt(a, "MONTHLY", 1, d("2026-02-28")).next).toEqual(d("2026-03-31"));
  });

  it("finds the period index", () => {
    expect(periodIndex(d("2026-01-01"), "MONTHLY", 1, d("2026-01-01"))).toBe(0);
    expect(periodIndex(d("2026-01-01"), "MONTHLY", 1, d("2026-03-15"))).toBe(2);
    expect(periodIndex(d("2026-01-01"), "WEEKLY", 2, d("2026-01-15"))).toBe(1);
  });

  it("handles yearly periods", () => {
    expect(periodAt(d("2026-03-01"), "YEARLY", 1, d("2026-03-01"))).toMatchObject({ end: d("2027-02-28"), next: d("2027-03-01") });
  });
});

describe("buildInvoice", () => {
  const lines = [
    { productId: "seat", description: "Seats", quantity: 20, unitPrice: 100_000, taxes: [gst18] },
    { productId: "addon", description: "Support", quantity: 1, unitPrice: 50_000, taxes: [gst18] },
  ];

  it("totals without discounts", () => {
    const inv = buildInvoice(lines, []);
    expect(inv).toMatchObject({ untaxed: 2_050_000, discountTotal: 0, taxTotal: 369_000, total: 2_419_000, usages: [] });
  });

  it("applies a subscription rule split across lines, taxed after the discount", () => {
    const inv = buildInvoice(lines, [rule({ minQuantity: 20 })]);
    expect(inv.discountTotal).toBe(205_000);
    expect(inv.lines.map((l) => l.discountAmount)).toEqual([200_000, 5_000]);
    expect(inv.untaxed).toBe(1_845_000);
    expect(inv.taxTotal).toBe(332_100);
    expect(inv.usages).toEqual([{ discountId: "r1", amount: 205_000 }]);
    expect(inv.lines[0].discountName).toBe("10% off");
  });

  it("skips a rule whose minimum isn't met", () => {
    expect(buildInvoice(lines, [rule({ minQuantity: 50 })]).discountTotal).toBe(0);
    expect(buildInvoice(lines, [rule({ minPurchase: 5_000_000 })]).discountTotal).toBe(0);
  });

  it("applies a product rule only to its products", () => {
    const inv = buildInvoice(lines, [rule({ scope: "PRODUCTS", productIds: ["addon"], kind: "FIXED", value: 10_000 })]);
    expect(inv.lines.map((l) => l.discountAmount)).toEqual([0, 10_000]);
  });

  it("picks the rule that saves more instead of stacking", () => {
    const inv = buildInvoice(lines, [rule({ id: "a", value: 500 }), rule({ id: "b", value: 1000, name: "Better" })]);
    expect(inv.usages).toEqual([{ discountId: "b", amount: 205_000 }]);
  });

  it("caps a fixed discount at the amount", () => {
    const inv = buildInvoice([lines[1]], [rule({ kind: "FIXED", value: 9_999_999 })]);
    expect(inv.discountTotal).toBe(50_000);
    expect(inv.total).toBe(0);
  });

  it("splits with no rounding loss", () => {
    const three = [1, 2, 3].map((i) => ({ productId: `p${i}`, description: "", quantity: 1, unitPrice: 333, taxes: [] }));
    const inv = buildInvoice(three, [rule({ kind: "FIXED", value: 100 })]);
    expect(inv.discountTotal).toBe(100);
  });
});
