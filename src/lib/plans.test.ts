import { describe, expect, it } from "vitest";
import { parseDate } from "@/lib/dates";
import { isPlanAvailableOn, planAvailability, planPrice, planSummary } from "./plans";

const terms = {
  price: 120000,
  period: "MONTHLY" as const,
  interval: 1,
  minQuantity: 5,
  autoClose: false,
  closable: false,
  pausable: true,
  renewable: true,
};

describe("planSummary", () => {
  it("shows price, minimum and the flags that are on", () => {
    expect(planSummary(terms)).toBe("₹1,200.00 / month · min 5 · Pausable · Renewable");
  });

  it("leaves out a minimum of 1 and lists every flag", () => {
    expect(planSummary({ ...terms, minQuantity: 1, closable: true, autoClose: true })).toBe(
      "₹1,200.00 / month · Closable · Pausable · Renewable · Auto-close",
    );
  });

  it("says how often it bills when the interval is more than 1", () => {
    expect(planPrice({ price: 50000, period: "WEEKLY", interval: 2 })).toBe("₹500.00 / 2 weeks");
    expect(planPrice({ price: 1000000, period: "YEARLY", interval: 1 })).toBe("₹10,000.00 / year");
  });
});

describe("planAvailability", () => {
  const plan = { active: true, availableFrom: parseDate("2026-11-01"), availableUntil: parseDate("2026-12-31") };

  it("is available from the first day to the last day, inclusive", () => {
    expect(planAvailability(plan, parseDate("2026-10-31"))).toBe("SCHEDULED");
    expect(planAvailability(plan, parseDate("2026-11-01"))).toBe("AVAILABLE");
    expect(planAvailability(plan, parseDate("2026-12-31"))).toBe("AVAILABLE");
    expect(planAvailability(plan, parseDate("2027-01-01"))).toBe("ENDED");
  });

  it("has no end when availableUntil is empty", () => {
    expect(planAvailability({ ...plan, availableUntil: null }, parseDate("2035-01-01"))).toBe("AVAILABLE");
  });

  it("is never available while switched off", () => {
    expect(planAvailability({ ...plan, active: false }, parseDate("2026-11-15"))).toBe("INACTIVE");
    expect(isPlanAvailableOn({ ...plan, active: false }, parseDate("2026-11-15"))).toBe(false);
    expect(isPlanAvailableOn(plan, parseDate("2026-11-15"))).toBe(true);
  });
});
