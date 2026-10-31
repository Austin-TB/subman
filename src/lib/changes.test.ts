import { describe, expect, it } from "vitest";
import { describeChanges } from "./changes";
import { formatMoney } from "./money";

const before = { name: "Pro", price: 120000, until: new Date("2026-12-31"), taxIds: ["b", "a"], notes: null as string | null };

describe("describeChanges", () => {
  it("lists only the fields that changed, in the order given", () => {
    const after = { ...before, name: "Pro+", notes: "x" };
    expect(describeChanges(before, after, { notes: "notes", price: "price", name: "name" })).toEqual(["notes", "name"]);
  });

  it("shows old and new values when a formatter is given", () => {
    const after = { ...before, price: 150000 };
    expect(describeChanges(before, after, { price: ["price", formatMoney] })).toEqual(["price ₹1,200.00 → ₹1,500.00"]);
  });

  it("compares dates by day and lists regardless of order", () => {
    const after = { ...before, until: new Date("2026-12-31"), taxIds: ["a", "b"] };
    expect(describeChanges(before, after, { until: "end date", taxIds: "taxes" })).toEqual([]);
    expect(describeChanges(before, { ...after, until: new Date("2027-01-01") }, { until: "end date" })).toEqual(["end date"]);
  });

  it("treats a missing value and null as the same", () => {
    expect(describeChanges({ a: null }, { a: undefined as unknown as null }, { a: "a" })).toEqual([]);
  });
});
