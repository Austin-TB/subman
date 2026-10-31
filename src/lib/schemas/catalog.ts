import { z } from "zod";
import {
  date,
  int,
  money,
  optionalDate,
  optionalId,
  optionalInt,
  optionalMoney,
  optionalText,
  readMoney,
  readPercent,
  requiredId,
  text,
  unwrap,
} from "@/lib/schemas/fields";

// Catalog and configuration forms (PLAN.md Phase 2). Every form field is a string (or boolean / list of ids);
// the schemas turn them into minor units, basis points, dates and so on. See fields.ts.

export const PRODUCT_TYPES = [
  { value: "SERVICE", label: "Service" },
  { value: "GOODS", label: "Goods" },
] as const;

export const BILLING_PERIODS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
] as const;

export const TAX_KINDS = [
  { value: "PERCENT", label: "Percentage of the amount" },
  { value: "FIXED", label: "Fixed amount per unit" },
] as const;

export const DISCOUNT_KINDS = [
  { value: "PERCENT", label: "Percentage" },
  { value: "FIXED", label: "Fixed amount" },
] as const;

export const DISCOUNT_SCOPES = [
  { value: "PRODUCTS", label: "Selected products" },
  { value: "SUBSCRIPTION", label: "Whole subscription" },
] as const;

// ───────────── Taxes & payment terms ─────────────

// The rate is a percentage or an amount depending on the kind, so it can only be read once the kind is known.
// Cross-field checks live in superRefine (it still runs when another field has a problem, so all errors show
// at once); the transform that follows only converts, and only runs when everything is valid.
const readTaxRate = (v: { kind: "PERCENT" | "FIXED"; rate: string }) =>
  (v.kind === "PERCENT" ? readPercent("rate") : readMoney("amount per unit"))(v.rate);

export const taxSchema = z
  .object({
    name: text("tax name", 60),
    kind: z.enum(["PERCENT", "FIXED"]),
    rate: z.string().trim(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const rate = readTaxRate(v);
    if ("error" in rate) ctx.addIssue({ code: "custom", path: ["rate"], message: rate.error });
  })
  .transform((v) => ({ ...v, rate: unwrap(readTaxRate(v)) }));

export const paymentTermSchema = z.object({
  name: text("name", 60),
  dueDays: int("number of days", 0, 365),
});

// ───────────── Products, attributes & variants ─────────────

export const productSchema = z.object({
  name: text("product name"),
  type: z.enum(["SERVICE", "GOODS"]),
  isAddon: z.boolean(),
  salesPrice: money("sales price"),
  costPrice: money("cost price"),
  notes: optionalText(),
  active: z.boolean(),
  taxIds: z.array(z.string()),
});

export const attributeSchema = z.object({ name: text("attribute name", 60) });

/** One box for several values (an attribute's options are added together): "Odoo, SAP, Zoho". Names are trimmed and repeats (any case) are dropped. */
export const attributeValuesSchema = z.object({
  names: z.string({ error: "Enter at least one value" }).transform((raw, ctx) => {
    const names = raw
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter((n, i, all) => n && all.findIndex((m) => m.trim().toLowerCase() === n.toLowerCase()) === i);
    const problem =
      names.length === 0
        ? "Enter at least one value"
        : names.some((n) => n.length > 60)
          ? "Each value can have at most 60 characters"
          : null;
    if (problem) {
      ctx.issues.push({ code: "custom", message: problem, input: raw });
      return z.NEVER;
    }
    return names;
  }),
});

export const variantSchema = z.object({
  attributeValueId: requiredId("an option"),
  extraPrice: money("extra price"),
});
export const variantPriceSchema = variantSchema.pick({ extraPrice: true });

// ───────────── Plans ─────────────

export const planSchema = z
  .object({
    name: text("plan name"),
    productId: requiredId("a product"),
    price: money("price"),
    period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: int("billing interval", 1, 99),
    minQuantity: int("minimum quantity", 1),
    availableFrom: date("start date"),
    availableUntil: optionalDate("end date"),
    autoClose: z.boolean(),
    closable: z.boolean(),
    pausable: z.boolean(),
    renewable: z.boolean(),
    active: z.boolean(),
  })
  .refine((v) => !v.availableUntil || v.availableUntil >= v.availableFrom, {
    path: ["availableUntil"],
    error: "The end date can't be before the start date",
  });

// ───────────── Quotation templates ─────────────

const templateLineFields = {
  variantId: optionalId,
  quantity: int("quantity", 1),
  /** Blank = use the current price of the product (or the plan). */
  unitPrice: optionalMoney("unit price"),
};

export const MAX_TEMPLATE_LINES = 30;

export const templateSchema = z.object({
  name: text("template name", 80),
  planId: requiredId("a plan"),
  validityDays: int("validity", 1, 365),
  // The first line always sells the plan's product; the server takes its product from the plan.
  planLine: z.object(templateLineFields),
  lines: z
    .array(z.object({ productId: requiredId("a product"), ...templateLineFields }))
    .max(MAX_TEMPLATE_LINES, `A template can have at most ${MAX_TEMPLATE_LINES} extra lines`),
});

// ───────────── Discount rules ─────────────

// A percentage is in basis points; 0.01% is the smallest rule that does anything.
function readDiscountValue(v: { kind: "PERCENT" | "FIXED"; value: string }) {
  const result = (v.kind === "PERCENT" ? readPercent("discount", { min: 1 }) : readMoney("discount amount"))(v.value);
  return "value" in result && result.value === 0 ? { error: "The discount amount must be more than 0" } : result;
}

export const discountSchema = z
  .object({
    name: text("rule name", 80),
    kind: z.enum(["PERCENT", "FIXED"]),
    value: z.string().trim(),
    scope: z.enum(["PRODUCTS", "SUBSCRIPTION"]),
    productIds: z.array(z.string()),
    minPurchase: optionalMoney("minimum purchase"),
    minQuantity: optionalInt("minimum quantity", 1),
    startDate: date("start date"),
    endDate: optionalDate("end date"),
    usageLimit: optionalInt("usage limit", 1, 1_000_000),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const value = readDiscountValue(v);
    if ("error" in value) ctx.addIssue({ code: "custom", path: ["value"], message: value.error });
    if (v.scope === "PRODUCTS" && v.productIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product" });
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date can't be before the start date" });
    }
  })
  .transform((v) => ({
    ...v,
    value: unwrap(readDiscountValue(v)),
    // Products only matter to a rule that is limited to them.
    productIds: v.scope === "PRODUCTS" ? [...new Set(v.productIds)] : [],
  }));

// What each form holds (input) and what the server action gets after parsing (output).
export type TaxInput = z.input<typeof taxSchema>;
export type TaxData = z.output<typeof taxSchema>;
export type PaymentTermInput = z.input<typeof paymentTermSchema>;
export type PaymentTermData = z.output<typeof paymentTermSchema>;
export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;
export type AttributeInput = z.input<typeof attributeSchema>;
export type AttributeValuesInput = z.input<typeof attributeValuesSchema>;
export type VariantInput = z.input<typeof variantSchema>;
export type VariantData = z.output<typeof variantSchema>;
export type VariantPriceInput = z.input<typeof variantPriceSchema>;
export type VariantPriceData = z.output<typeof variantPriceSchema>;
export type PlanInput = z.input<typeof planSchema>;
export type PlanData = z.output<typeof planSchema>;
export type TemplateInput = z.input<typeof templateSchema>;
export type TemplateData = z.output<typeof templateSchema>;
export type DiscountInput = z.input<typeof discountSchema>;
export type DiscountData = z.output<typeof discountSchema>;
