import { describe, expect, it } from "vitest";
import { parseDate } from "@/lib/dates";
import { addressLines, customerSchema, BLANK_CUSTOMER } from "@/lib/schemas/customers";
import { addLineSchema, subscriptionSchema, type SubscriptionInput } from "@/lib/schemas/subscriptions";

const valid: SubscriptionInput = {
  customerId: "c1",
  planId: "p1",
  startDate: "2026-11-01",
  expiryDate: "2027-11-01",
  validityDays: "30",
  paymentTermId: "t1",
  planLine: { variantId: "", quantity: "5", unitPrice: "1,200.00", taxIds: ["gst18"] },
  lines: [{ productId: "addon", variantId: "", quantity: "1", unitPrice: "300", taxIds: [] }],
};

const issues = (input: unknown) => {
  const r = subscriptionSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("subscriptionSchema", () => {
  it("turns text into minor units, whole numbers and dates", () => {
    const r = subscriptionSchema.parse(valid);
    expect(r.planLine).toEqual({ variantId: null, quantity: 5, unitPrice: 120_000, taxIds: ["gst18"] });
    expect(r.lines[0]).toMatchObject({ productId: "addon", quantity: 1, unitPrice: 30_000 });
    expect(r.startDate).toEqual(parseDate("2026-11-01"));
    expect(r.expiryDate).toEqual(parseDate("2027-11-01"));
    expect(r.validityDays).toBe(30);
  });

  it("allows no expiry date", () => {
    expect(subscriptionSchema.parse({ ...valid, expiryDate: "" }).expiryDate).toBeNull();
  });

  it("wants the expiry after the start", () => {
    expect(issues({ ...valid, expiryDate: "2026-11-01" })).toEqual(["expiryDate: The expiry date must be after the start date"]);
    expect(issues({ ...valid, expiryDate: "2026-10-01" })).toEqual(["expiryDate: The expiry date must be after the start date"]);
  });

  it("asks for a customer, a plan and payment terms", () => {
    expect(issues({ ...valid, customerId: "", planId: "", paymentTermId: "" })).toEqual([
      "customerId: Choose a customer",
      "planId: Choose a plan",
      "paymentTermId: Choose payment terms",
    ]);
  });

  it("wants a whole quantity of at least 1 and a valid price on every line", () => {
    expect(
      issues({
        ...valid,
        planLine: { ...valid.planLine, quantity: "0" },
        lines: [{ productId: "x", variantId: "", quantity: "1.5", unitPrice: "abc", taxIds: [] }],
      }),
    ).toEqual([
      "planLine.quantity: Quantity must be at least 1",
      "lines.0.quantity: Quantity must be a whole number",
      "lines.0.unitPrice: Unit price must be a number, like 1200.50",
    ]);
  });

  it("needs a product on every extra line", () => {
    expect(issues({ ...valid, lines: [{ ...valid.lines[0], productId: "" }] })).toEqual(["lines.0.productId: Choose a product"]);
  });

  it("limits the number of extra lines", () => {
    const many = Array.from({ length: 31 }, () => valid.lines[0]);
    expect(issues({ ...valid, lines: many })).toEqual(["lines: A subscription can have at most 30 extra lines"]);
  });

  it("refuses lines that add up to more than a 32-bit column can bill", () => {
    const big = { ...valid.planLine, quantity: "100000", unitPrice: "100000" }; // 10^7 × 100 = 10^9 each
    expect(issues({ ...valid, planLine: big, lines: [{ ...valid.lines[0], quantity: "100000", unitPrice: "100000" }] })).toEqual([
      "planLine.quantity: The lines add up to more than can be billed in one period",
    ]);
  });

  it("accepts a price of zero (a free add-on)", () => {
    expect(issues({ ...valid, lines: [{ ...valid.lines[0], unitPrice: "0" }] })).toEqual([]);
  });
});

describe("addLineSchema", () => {
  it("reads an add-on line", () => {
    expect(addLineSchema.parse({ productId: "p", variantId: "v", quantity: "2", unitPrice: "99.50", taxIds: ["t"] })).toEqual({
      productId: "p",
      variantId: "v",
      quantity: 2,
      unitPrice: 9_950,
      taxIds: ["t"],
    });
  });

  it("wants a product", () => {
    expect(addLineSchema.safeParse({ productId: "", variantId: "", quantity: "1", unitPrice: "1", taxIds: [] }).success).toBe(false);
  });
});

describe("customerSchema", () => {
  const ok = { ...BLANK_CUSTOMER, name: "  Priya Nair ", email: " Priya@Acme.TEST " };

  it("trims, lowercases the email and turns blank optional fields into null", () => {
    expect(customerSchema.parse(ok)).toMatchObject({ name: "Priya Nair", email: "priya@acme.test", company: null, phone: null, taxId: null });
  });

  it("needs a name and a valid email", () => {
    const r = customerSchema.safeParse({ ...BLANK_CUSTOMER, email: "nope" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => `${String(i.path[0])}: ${i.message}`)).toEqual([
      "name: Enter the customer name",
      "email: Enter a valid email address",
    ]);
  });

  it("asks for the email when it is blank", () => {
    const r = customerSchema.safeParse({ ...ok, email: "" });
    expect(r.error?.issues.map((i) => i.message)).toEqual(["Enter the email address"]);
  });
});

describe("addressLines", () => {
  it("leaves out what is blank", () => {
    expect(
      addressLines({ addressLine1: "12 MG Road", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" }),
    ).toEqual(["12 MG Road", "Bengaluru, Karnataka 560001", "India"]);
    expect(addressLines({ city: "Pune" })).toEqual(["Pune"]);
    expect(addressLines({})).toEqual([]);
  });
});
