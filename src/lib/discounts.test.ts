import { describe, expect, it } from "vitest";
import { parseDate } from "@/lib/dates";
import { discountConditions, discountState, discountValueLabel, isDiscountLive } from "./discounts";

const rule = {
  active: true,
  startDate: parseDate("2026-11-01"),
  endDate: parseDate("2026-11-30"),
  usageLimit: 2,
  usedCount: 0,
};

describe("discountState", () => {
  it("applies from the start date to the end date, inclusive", () => {
    expect(discountState(rule, parseDate("2026-10-31"))).toBe("SCHEDULED");
    expect(discountState(rule, parseDate("2026-11-01"))).toBe("ACTIVE");
    expect(discountState(rule, parseDate("2026-11-30"))).toBe("ACTIVE");
    expect(discountState(rule, parseDate("2026-12-01"))).toBe("EXPIRED");
  });

  it("stops when the uses run out", () => {
    const on = parseDate("2026-11-15");
    expect(discountState({ ...rule, usedCount: 1 }, on)).toBe("ACTIVE");
    expect(discountState({ ...rule, usedCount: 2 }, on)).toBe("USED_UP");
    expect(isDiscountLive({ ...rule, usedCount: 2 }, on)).toBe(false);
  });

  it("has no limit or end date when they are empty", () => {
    const open = { ...rule, endDate: null, usageLimit: null, usedCount: 5000 };
    expect(discountState(open, parseDate("2040-01-01"))).toBe("ACTIVE");
  });

  it("never applies while switched off, whatever else is true", () => {
    expect(discountState({ ...rule, active: false }, parseDate("2026-11-15"))).toBe("INACTIVE");
  });

  it("reports an ended rule as expired even if it was also used up", () => {
    expect(discountState({ ...rule, usedCount: 2 }, parseDate("2026-12-05"))).toBe("EXPIRED");
  });
});

describe("labels", () => {
  it("describes the value", () => {
    expect(discountValueLabel({ kind: "PERCENT", value: 1000 })).toBe("10% off");
    expect(discountValueLabel({ kind: "PERCENT", value: 1250 })).toBe("12.5% off");
    expect(discountValueLabel({ kind: "FIXED", value: 50000 })).toBe("₹500.00 off");
  });

  it("describes the conditions", () => {
    expect(discountConditions({ minQuantity: 20, minPurchase: null })).toBe("20+ seats");
    expect(discountConditions({ minQuantity: 20, minPurchase: 1000000 })).toBe("20+ seats · min ₹10,000.00");
    expect(discountConditions({ minQuantity: null, minPurchase: null })).toBe("No minimum");
  });
});
