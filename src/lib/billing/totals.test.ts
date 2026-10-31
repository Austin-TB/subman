import { describe, expect, it } from "vitest";
import { calcLine, calcTotals, type TaxRule } from "@/lib/billing/totals";

const gst18: TaxRule = { name: "GST 18%", kind: "PERCENT", rate: 1800 };
const gst5: TaxRule = { name: "GST 5%", kind: "PERCENT", rate: 500 };
const handling: TaxRule = { name: "Handling fee", kind: "FIXED", rate: 500 };

describe("calcLine", () => {
  it("multiplies quantity by unit price and adds a percentage tax", () => {
    // 5 × ₹1,200 = ₹6,000; 18% = ₹1,080
    const l = calcLine({ quantity: 5, unitPrice: 120_000, taxes: [gst18] });
    expect(l).toMatchObject({ amount: 600_000, discountAmount: 0, subtotal: 600_000, taxAmount: 108_000, total: 708_000 });
    expect(l.taxes).toEqual([{ ...gst18, amount: 108_000 }]);
  });

  it("charges a fixed tax per unit, not on the amount", () => {
    const l = calcLine({ quantity: 4, unitPrice: 100_000, taxes: [handling] });
    expect(l.taxAmount).toBe(2_000);
    expect(l.total).toBe(402_000);
  });

  it("charges tax on the discounted amount", () => {
    const l = calcLine({ quantity: 1, unitPrice: 100_000, discountAmount: 10_000, taxes: [gst18] });
    expect(l.subtotal).toBe(90_000);
    expect(l.taxAmount).toBe(16_200);
  });

  it("never lets a discount take the line below zero", () => {
    const l = calcLine({ quantity: 1, unitPrice: 5_000, discountAmount: 9_999, taxes: [gst18] });
    expect(l).toMatchObject({ discountAmount: 5_000, subtotal: 0, taxAmount: 0, total: 0 });
  });

  it("ignores a negative discount", () => {
    expect(calcLine({ quantity: 1, unitPrice: 5_000, discountAmount: -100, taxes: [] }).subtotal).toBe(5_000);
  });

  it("rounds each tax half-up, so the amounts beside the taxes add up to the line's tax", () => {
    // 5% of 0.10 = 0.005 → rounds up to 0.01; 18% of 0.10 = 0.018 → 0.02
    const l = calcLine({ quantity: 1, unitPrice: 10, taxes: [gst5, gst18] });
    expect(l.taxes.map((t) => t.amount)).toEqual([1, 2]);
    expect(l.taxAmount).toBe(3);
  });

  it("rounds exactly half up, not to even", () => {
    // 18% of 25 = 4.5 → 5
    expect(calcLine({ quantity: 1, unitPrice: 25, taxes: [gst18] }).taxAmount).toBe(5);
  });

  it("combines a percentage and a fixed tax", () => {
    const l = calcLine({ quantity: 2, unitPrice: 50_000, taxes: [gst18, handling] });
    expect(l.taxAmount).toBe(18_000 + 1_000);
  });

  it("is zero with no taxes", () => {
    expect(calcLine({ quantity: 3, unitPrice: 1_000, taxes: [] })).toMatchObject({ taxAmount: 0, total: 3_000 });
  });
});

describe("calcTotals", () => {
  it("adds the lines up and breaks tax down by name", () => {
    const t = calcTotals([
      { quantity: 10, unitPrice: 100_000, taxes: [gst18] },
      { quantity: 1, unitPrice: 50_000, taxes: [gst5] },
      { quantity: 2, unitPrice: 30_000, taxes: [gst18] },
    ]);
    expect(t.untaxed).toBe(1_110_000);
    expect(t.taxTotal).toBe(180_000 + 2_500 + 10_800);
    expect(t.total).toBe(t.untaxed + t.taxTotal);
    expect(t.taxBreakdown).toEqual([
      { name: "GST 18%", amount: 190_800 },
      { name: "GST 5%", amount: 2_500 },
    ]);
  });

  it("rounds per line, so the total is the sum of the rounded lines", () => {
    // Three lines of 0.25 at 18%: each 4.5 → 5 → 15 in total. Rounding the combined 75 × 18% would give 14.
    const t = calcTotals(Array.from({ length: 3 }, () => ({ quantity: 1, unitPrice: 25, taxes: [gst18] })));
    expect(t.taxTotal).toBe(15);
  });

  it("sums discounts", () => {
    const t = calcTotals([
      { quantity: 1, unitPrice: 10_000, discountAmount: 1_000, taxes: [] },
      { quantity: 1, unitPrice: 10_000, discountAmount: 500, taxes: [] },
    ]);
    expect(t).toMatchObject({ untaxed: 18_500, discountTotal: 1_500, total: 18_500 });
  });

  it("handles no lines", () => {
    expect(calcTotals([])).toMatchObject({ untaxed: 0, taxTotal: 0, total: 0, taxBreakdown: [] });
  });
});
