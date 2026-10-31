import { describe, expect, it } from "vitest";
import { addMonthsClamped, businessToday, parseDate, periodStart, toISODate } from "./dates";

const d = parseDate;
const iso = toISODate;

describe("periodStart", () => {
  it("clamps month ends and returns to the original day", () => {
    const start = d("2026-01-31");
    expect(iso(periodStart(start, "MONTHLY", 1, 1))).toBe("2026-02-28");
    expect(iso(periodStart(start, "MONTHLY", 1, 2))).toBe("2026-03-31");
    expect(iso(periodStart(start, "MONTHLY", 1, 3))).toBe("2026-04-30");
  });
  it("handles leap years", () => {
    expect(iso(periodStart(d("2028-02-29"), "YEARLY", 1, 1))).toBe("2029-02-28");
    expect(iso(periodStart(d("2028-02-29"), "YEARLY", 1, 4))).toBe("2032-02-29");
    expect(iso(periodStart(d("2027-01-31"), "MONTHLY", 1, 13))).toBe("2028-02-29");
  });
  it("supports intervals and short periods", () => {
    expect(iso(periodStart(d("2026-10-31"), "MONTHLY", 3, 1))).toBe("2027-01-31");
    expect(iso(periodStart(d("2026-10-31"), "WEEKLY", 2, 1))).toBe("2026-11-14");
    expect(iso(periodStart(d("2026-12-31"), "DAILY", 1, 1))).toBe("2027-01-01");
  });
  it("crosses year boundaries backwards too", () => {
    expect(iso(addMonthsClamped(d("2026-03-31"), -1))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(d("2026-01-15"), -1))).toBe("2025-12-15");
  });
});

describe("businessToday", () => {
  it("uses the business timezone, not UTC", () => {
    // 20:00 UTC on Oct 31 is already Nov 1 in India
    expect(iso(businessToday(new Date("2026-10-31T20:00:00Z")))).toBe("2026-11-01");
    expect(iso(businessToday(new Date("2026-10-31T10:00:00Z")))).toBe("2026-10-31");
  });
});

describe("parseDate", () => {
  it("rejects impossible dates", () => {
    expect(() => d("2026-02-30")).toThrow();
    expect(() => d("31/10/2026")).toThrow();
  });
});
