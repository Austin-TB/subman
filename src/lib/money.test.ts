import { describe, expect, it } from "vitest";
import { applyBps, divRoundHalfUp, parseMoney, parsePercent, toInputValue } from "./money";

describe("parseMoney", () => {
  it("parses amounts without floats", () => {
    expect(parseMoney("1200")).toBe(120000);
    expect(parseMoney("1,200.5")).toBe(120050);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney(" 560 ")).toBe(56000);
  });
  it("rejects bad input", () => {
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("1e3")).toBeNull();
  });
  it("round-trips through the input format", () => {
    for (const v of [0, 7, 1999, 120050]) expect(parseMoney(toInputValue(v))).toBe(v);
  });
});

describe("rounding", () => {
  it("rounds half up", () => {
    expect(divRoundHalfUp(5, 10)).toBe(1);
    expect(divRoundHalfUp(4, 10)).toBe(0);
    expect(divRoundHalfUp(15, 10)).toBe(2);
    expect(divRoundHalfUp(-15, 10)).toBe(-2);
  });
  it("applies basis points", () => {
    expect(applyBps(100000, 1800)).toBe(18000); // 18% of 1,000.00
    expect(applyBps(333, 1800)).toBe(60); // 59.94 → 60
    expect(applyBps(25, 1000)).toBe(3); // 2.5 → 3
  });
  it("parses percentages to basis points", () => {
    expect(parsePercent("18")).toBe(1800);
    expect(parsePercent("12.5")).toBe(1250);
    expect(parsePercent("x")).toBeNull();
  });
});
