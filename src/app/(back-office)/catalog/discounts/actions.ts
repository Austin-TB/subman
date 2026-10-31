"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { describeChanges } from "@/lib/changes";
import { formatDate } from "@/lib/dates";
import { discountConditions, discountValueLabel } from "@/lib/discounts";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { discountSchema } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";

type Saved = ActionResult<{ id: string }>;

const PRODUCT_GONE = "One of the chosen products no longer exists. Reload the page and try again.";

const revalidateDiscounts = (id?: string) => {
  revalidatePath("/catalog/discounts");
  if (id) revalidatePath(`/catalog/discounts/${id}`);
};

async function allProductsExist(ids: string[]) {
  return ids.length === 0 || (await db.product.count({ where: { id: { in: ids } } })) === ids.length;
}

export async function createDiscount(input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { productIds, ...data } = parsed.data;
  if (!(await allProductsExist(productIds))) return fail(PRODUCT_GONE, { productIds: [PRODUCT_GONE] });

  const discount = await db.discount.create({
    data: { ...data, products: { connect: productIds.map((id) => ({ id })) } },
  });
  await logActivity({
    entityType: "discount",
    entityId: discount.id,
    action: "created",
    message: `Discount rule "${discount.name}" created: ${discountValueLabel(discount)}, ${discountConditions(discount)}`,
    userId: admin.id,
  });
  revalidateDiscounts();
  return ok(`${discount.name} was created. It applies by itself from ${formatDate(discount.startDate)}.`, { id: discount.id });
}

/**
 * Changes apply to invoices created from now on; invoices that already used the rule are not touched.
 * The limit can't go below the uses already taken.
 */
export async function updateDiscount(id: string, input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { productIds, ...data } = parsed.data;
  if (!(await allProductsExist(productIds))) return fail(PRODUCT_GONE, { productIds: [PRODUCT_GONE] });

  const include = { products: { select: { name: true }, orderBy: { name: "asc" } } } as const;
  const before = await db.discount.findUnique({ where: { id }, include });
  if (!before) return fail("This discount rule no longer exists.");

  if (data.usageLimit != null && data.usageLimit < before.usedCount) {
    const message = `It has already been used ${before.usedCount} time${before.usedCount === 1 ? "" : "s"}, so the limit can't be lower`;
    return fail(`${message}.`, { usageLimit: [message] });
  }

  const after = await db.discount.update({
    where: { id },
    data: { ...data, products: { set: productIds.map((productId) => ({ id: productId })) } },
    include,
  });

  const view = (d: typeof after) => ({
    name: d.name,
    discount: discountValueLabel(d),
    scope: d.scope === "PRODUCTS" ? "selected products" : "whole subscription",
    products: d.products.map((p) => p.name),
    minPurchase: d.minPurchase,
    minQuantity: d.minQuantity,
    startDate: d.startDate,
    endDate: d.endDate,
    usageLimit: d.usageLimit,
    active: d.active ? "active" : "inactive",
  });
  const changed = await logChanges({
    entityType: "discount",
    entityId: id,
    subject: `Discount rule "${after.name}"`,
    changes: describeChanges(view(before), view(after), {
      name: "name",
      discount: ["discount", String],
      scope: ["applies to", String],
      products: "products",
      minPurchase: ["minimum purchase", (v: number | null) => (v == null ? "none" : formatMoney(v))],
      minQuantity: ["minimum quantity", (v: number | null) => (v == null ? "none" : String(v))],
      startDate: ["start date", formatDate],
      endDate: ["end date", formatDate],
      usageLimit: ["usage limit", (v: number | null) => (v == null ? "unlimited" : String(v))],
      active: ["status", String],
    }),
    userId: admin.id,
  });
  revalidateDiscounts(id);
  return ok(changed ? `${after.name} was saved.` : "Nothing was changed.", { id });
}
