import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsOf, invalid } from "@/lib/action";
import { date, int, money, optionalInt, optionalMoney } from "./fields";
import {
  attributeValuesSchema,
  discountSchema,
  paymentTermSchema,
  planSchema,
  productSchema,
  taxSchema,
  templateSchema,
  variantSchema,
} from "./catalog";

/** Error messages by field path, or {} when the input is valid. */
function errors(schema: z.ZodType, input: unknown) {
  const r = schema.safeParse(input);
  return r.success ? {} : fieldErrorsOf(r.error);
}

/** The parsed value, or the error messages when parsing fails. */
function read(schema: z.ZodType, input: unknown) {
  const r = schema.safeParse(input);
  return r.success ? r.data : r.error.issues.map((i) => i.message);
}

describe("field helpers", () => {
  it("reads money as minor units", () => {
    expect(read(money("price"), "1,200.50")).toBe(120050);
    expect(read(money("price"), " 0 ")).toBe(0);
    expect(read(money("price"), "")).toEqual(["Enter the price"]);
    expect(read(money("price"), "12.345")).toEqual(["Price must be a number, like 1200.50"]);
    expect(read(money("price"), "-5")).toEqual(["Price can't be negative"]);
    expect(read(money("price"), "99999999")).toEqual(["Price is too large"]);
  });

  it("treats blank optional values as null", () => {
    expect(read(optionalMoney("minimum"), "")).toBeNull();
    expect(read(optionalMoney("minimum"), "10")).toBe(1000);
    expect(read(optionalInt("limit"), "  ")).toBeNull();
    expect(read(optionalInt("limit", 1), "0")).toEqual(["Limit must be at least 1"]);
  });

  it("reads whole numbers within bounds", () => {
    expect(read(int("quantity", 1), "5")).toBe(5);
    expect(read(int("quantity", 1), "0")).toEqual(["Quantity must be at least 1"]);
    expect(read(int("quantity", 1), "2.5")).toEqual(["Quantity must be a whole number"]);
    expect(read(int("days", 0, 365), "366")).toEqual(["Days can be at most 365"]);
  });

  it("reads dates as UTC midnight and rejects nonsense", () => {
    expect((read(date("start date"), "2026-11-01") as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(read(date("start date"), "2026-02-30")).toEqual(["Start date isn't a valid date"]);
    expect(read(date("start date"), "0202-01-01")).toEqual(["Start date isn't a valid date"]);
    expect(read(date("start date"), "")).toEqual(["Enter the start date"]);
  });
});

describe("taxSchema", () => {
  const base = { name: "GST 18%", kind: "PERCENT", rate: "18", active: true };

  it("reads a percentage rate as basis points", () => {
    expect(taxSchema.parse(base)).toEqual({ name: "GST 18%", kind: "PERCENT", rate: 1800, active: true });
    expect(taxSchema.parse({ ...base, rate: "12.5" }).rate).toBe(1250);
  });

  it("reads a fixed rate as an amount per unit", () => {
    expect(taxSchema.parse({ ...base, kind: "FIXED", rate: "2.50" }).rate).toBe(250);
  });

  it("rejects a percentage above 100% and reports it on the rate field", () => {
    expect(errors(taxSchema, { ...base, rate: "101" })).toEqual({ rate: ["Rate can be at most 100%"] });
  });

  it("rejects text that is not a number, with a message that fits the kind", () => {
    expect(errors(taxSchema, { ...base, rate: "abc" }).rate).toEqual(["Rate must be a percentage, like 18 or 12.5"]);
    expect(errors(taxSchema, { ...base, kind: "FIXED", rate: "abc" }).rate).toEqual([
      "Amount per unit must be a number, like 1200.50",
    ]);
  });

  it("needs a name", () => {
    expect(errors(taxSchema, { ...base, name: "  " })).toEqual({ name: ["Enter the tax name"] });
  });

  it("reports a missing name and a missing rate together, not one after the other", () => {
    expect(Object.keys(errors(taxSchema, { name: "", kind: "PERCENT", rate: "", active: true })).sort()).toEqual(["name", "rate"]);
  });
});

describe("paymentTermSchema", () => {
  it("accepts zero days (immediate) and rejects negatives", () => {
    expect(paymentTermSchema.parse({ name: "Immediate", dueDays: "0" })).toEqual({ name: "Immediate", dueDays: 0 });
    expect(errors(paymentTermSchema, { name: "x", dueDays: "-1" }).dueDays).toBeDefined();
  });
});

describe("productSchema", () => {
  const base = {
    name: " Brightloop CRM ",
    type: "SERVICE",
    isAddon: false,
    salesPrice: "1,000",
    costPrice: "300",
    notes: "  ",
    active: true,
    taxIds: ["t1"],
  };

  it("trims, converts prices and turns blank notes into null", () => {
    expect(productSchema.parse(base)).toEqual({
      name: "Brightloop CRM",
      type: "SERVICE",
      isAddon: false,
      salesPrice: 100000,
      costPrice: 30000,
      notes: null,
      active: true,
      taxIds: ["t1"],
    });
  });

  it("reports every bad field at once", () => {
    const e = errors(productSchema, { ...base, name: "", salesPrice: "x", costPrice: "" });
    expect(Object.keys(e).sort()).toEqual(["costPrice", "name", "salesPrice"]);
  });

  it("only accepts the known product types", () => {
    expect(errors(productSchema, { ...base, type: "OTHER" }).type).toBeDefined();
  });
});

describe("attributeValuesSchema", () => {
  it("splits on commas and new lines, trims, and drops repeats in any case", () => {
    expect(attributeValuesSchema.parse({ names: " Odoo, SAP ,odoo,\nZoho,, " }).names).toEqual(["Odoo", "SAP", "Zoho"]);
  });

  it("needs at least one value", () => {
    expect(errors(attributeValuesSchema, { names: " , " })).toEqual({ names: ["Enter at least one value"] });
    expect(errors(attributeValuesSchema, { names: "" })).toEqual({ names: ["Enter at least one value"] });
  });

  it("limits the length of each value", () => {
    expect(errors(attributeValuesSchema, { names: `ok, ${"x".repeat(61)}` }).names).toBeDefined();
  });
});

describe("variantSchema", () => {
  it("takes a zero extra price", () => {
    expect(variantSchema.parse({ attributeValueId: "v1", extraPrice: "0" }).extraPrice).toBe(0);
  });

  it("needs an option", () => {
    expect(errors(variantSchema, { attributeValueId: "", extraPrice: "0" })).toEqual({
      attributeValueId: ["Choose an option"],
    });
  });
});

describe("planSchema", () => {
  const base = {
    name: "Analytics Pro Monthly",
    productId: "p1",
    price: "1200",
    period: "MONTHLY",
    interval: "1",
    minQuantity: "5",
    availableFrom: "2026-11-01",
    availableUntil: "",
    autoClose: false,
    closable: true,
    pausable: true,
    renewable: true,
    active: true,
  };

  it("parses the spec's example plan", () => {
    const plan = planSchema.parse(base);
    expect(plan).toMatchObject({ price: 120000, interval: 1, minQuantity: 5, availableUntil: null });
    expect(plan.availableFrom.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("rejects an end date before the start date, but allows the same day", () => {
    expect(errors(planSchema, { ...base, availableUntil: "2026-10-31" })).toEqual({
      availableUntil: ["The end date can't be before the start date"],
    });
    expect(errors(planSchema, { ...base, availableUntil: "2026-11-01" })).toEqual({});
  });

  it("needs a billing interval and a minimum quantity of at least 1", () => {
    const e = errors(planSchema, { ...base, interval: "0", minQuantity: "0" });
    expect(Object.keys(e).sort()).toEqual(["interval", "minQuantity"]);
  });

  it("only accepts the four billing periods", () => {
    expect(errors(planSchema, { ...base, period: "HOURLY" }).period).toBeDefined();
  });
});

describe("templateSchema", () => {
  const line = { productId: "p2", variantId: "", quantity: "1", unitPrice: "" };
  const base = {
    name: "Enterprise Yearly",
    planId: "plan1",
    validityDays: "30",
    planLine: { variantId: "", quantity: "10", unitPrice: "" },
    lines: [line],
  };

  it("treats blanks as 'use the current price' and 'no variant'", () => {
    const t = templateSchema.parse(base);
    expect(t.planLine).toEqual({ variantId: null, quantity: 10, unitPrice: null });
    expect(t.lines).toEqual([{ productId: "p2", variantId: null, quantity: 1, unitPrice: null }]);
  });

  it("reports errors on the line that has them, by index", () => {
    const e = errors(templateSchema, { ...base, lines: [line, { ...line, productId: "", quantity: "0" }] });
    expect(Object.keys(e).sort()).toEqual(["lines.1.productId", "lines.1.quantity"]);
  });

  it("allows a template that is only the plan line", () => {
    expect(templateSchema.safeParse({ ...base, lines: [] }).success).toBe(true);
  });
});

describe("discountSchema", () => {
  const base = {
    name: "10% off 20+ seats",
    kind: "PERCENT",
    value: "10",
    scope: "SUBSCRIPTION",
    productIds: [],
    minPurchase: "",
    minQuantity: "20",
    startDate: "2026-11-01",
    endDate: "",
    usageLimit: "2",
    active: true,
  };

  it("parses the spec's example rule", () => {
    expect(discountSchema.parse(base)).toMatchObject({
      kind: "PERCENT",
      value: 1000,
      scope: "SUBSCRIPTION",
      minPurchase: null,
      minQuantity: 20,
      endDate: null,
      usageLimit: 2,
    });
  });

  it("reads a fixed amount in minor units", () => {
    expect(discountSchema.parse({ ...base, kind: "FIXED", value: "500" }).value).toBe(50000);
  });

  it("rejects a zero discount and a percentage over 100, but accepts exactly 100", () => {
    expect(errors(discountSchema, { ...base, value: "0" }).value).toBeDefined();
    expect(errors(discountSchema, { ...base, kind: "FIXED", value: "0" })).toEqual({
      value: ["The discount amount must be more than 0"],
    });
    expect(errors(discountSchema, { ...base, value: "100.01" }).value).toBeDefined();
    expect(errors(discountSchema, { ...base, value: "100" })).toEqual({});
  });

  it("needs a product when it applies to products, and drops the list for the whole subscription", () => {
    expect(errors(discountSchema, { ...base, scope: "PRODUCTS" })).toEqual({
      productIds: ["Choose at least one product"],
    });
    expect(discountSchema.parse({ ...base, scope: "PRODUCTS", productIds: ["a", "a", "b"] }).productIds).toEqual([
      "a",
      "b",
    ]);
    expect(discountSchema.parse({ ...base, productIds: ["a"] }).productIds).toEqual([]);
  });

  it("rejects an end date before the start date", () => {
    expect(errors(discountSchema, { ...base, endDate: "2026-10-01" })).toEqual({
      endDate: ["The end date can't be before the start date"],
    });
  });

  it("collects several problems in one pass", () => {
    const e = errors(discountSchema, { ...base, value: "x", scope: "PRODUCTS", endDate: "2020-01-01" });
    expect(Object.keys(e).sort()).toEqual(["endDate", "productIds", "value"]);
  });

  it("reports a missing name together with a bad value", () => {
    expect(Object.keys(errors(discountSchema, { ...base, name: "", value: "" })).sort()).toEqual(["name", "value"]);
  });
});

describe("invalid()", () => {
  it("puts field errors under their path with a generic summary", () => {
    const r = planSchema.safeParse({});
    expect(r.success).toBe(false);
    const result = invalid(r.error!);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Check the highlighted fields.");
      expect(result.fieldErrors?.name).toBeDefined();
    }
  });

  it("uses an error that belongs to no field as the summary", () => {
    const r = z
      .object({ a: z.string() })
      .refine(() => false, { error: "Something is off" })
      .safeParse({ a: "x" });
    expect(invalid(r.error!)).toEqual({ ok: false, error: "Something is off", fieldErrors: {} });
  });
});
