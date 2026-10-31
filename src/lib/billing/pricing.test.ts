import { describe, expect, it } from "vitest";
import { defaultUnitPrice, recurringAmount } from "./pricing";

describe("defaultUnitPrice", () => {
  const base = { planPrice: 120000, productPrice: 100000 };

  it("uses the plan price for the plan's own line, not the product's sales price", () => {
    expect(defaultUnitPrice({ ...base, isPlanLine: true })).toBe(120000);
  });

  it("uses the product's sales price for any other line", () => {
    expect(defaultUnitPrice({ ...base, isPlanLine: false })).toBe(100000);
  });

  it("adds the variant's extra price on top in both cases (Odoo +560)", () => {
    expect(defaultUnitPrice({ ...base, isPlanLine: true, variantExtra: 56000 })).toBe(176000);
    expect(defaultUnitPrice({ ...base, isPlanLine: false, variantExtra: 56000 })).toBe(156000);
    expect(defaultUnitPrice({ ...base, isPlanLine: false, variantExtra: null })).toBe(100000);
  });
});

describe("recurringAmount", () => {
  it("adds up quantity × unit price over the lines", () => {
    expect(
      recurringAmount([
        { quantity: 10, unitPrice: 120000 }, // 10 seats on the plan
        { quantity: 1, unitPrice: 50000 }, // one add-on
      ]),
    ).toBe(1250000);
  });

  it("is zero for no lines", () => {
    expect(recurringAmount([])).toBe(0);
  });
});
