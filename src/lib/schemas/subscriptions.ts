import { z } from "zod";
import { MAX_RECURRING_AMOUNT, recurringAmount } from "@/lib/billing/pricing";
import { date, int, money, optionalDate, optionalId, requiredId } from "@/lib/schemas/fields";

// Subscription forms (PLAN.md Phase 3). Like the catalog forms, every field is a string (or a list of ids)
// and the schema turns it into minor units and dates; the server action runs the same schema again.

export const MAX_SUBSCRIPTION_LINES = 30;

const lineFields = {
  variantId: optionalId,
  quantity: int("quantity", 1),
  /** A subscription line always carries its price: it was copied from the product or plan and may have been edited. */
  unitPrice: money("unit price"),
  taxIds: z.array(z.string()),
};

export const subscriptionSchema = z
  .object({
    customerId: requiredId("a customer"),
    planId: requiredId("a plan"),
    startDate: date("start date"),
    expiryDate: optionalDate("expiry date"),
    validityDays: int("validity", 1, 365),
    paymentTermId: requiredId("payment terms"),
    // The first line always sells the plan's product; the server takes its product from the plan.
    planLine: z.object(lineFields),
    lines: z
      .array(z.object({ productId: requiredId("a product"), ...lineFields }))
      .max(MAX_SUBSCRIPTION_LINES, `A subscription can have at most ${MAX_SUBSCRIPTION_LINES} extra lines`),
  })
  .superRefine((v, ctx) => {
    if (v.expiryDate && v.expiryDate <= v.startDate) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "The expiry date must be after the start date" });
    }
    if (recurringAmount([v.planLine, ...v.lines]) > MAX_RECURRING_AMOUNT) {
      ctx.addIssue({
        code: "custom",
        path: ["planLine", "quantity"],
        message: "The lines add up to more than can be billed in one period",
      });
    }
  });

/** A line switched on for a subscription that is already running (an add-on). */
export const addLineSchema = z.object({ productId: requiredId("a product"), ...lineFields });

export type SubscriptionInput = z.input<typeof subscriptionSchema>;
export type SubscriptionData = z.output<typeof subscriptionSchema>;
export type AddLineInput = z.input<typeof addLineSchema>;
export type AddLineData = z.output<typeof addLineSchema>;
