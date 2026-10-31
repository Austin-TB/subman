"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { variantLabel } from "@/lib/catalog-data";
import { describeChanges } from "@/lib/changes";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma-errors";
import { productSchema, variantPriceSchema, variantSchema } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";

type Saved = ActionResult<{ id: string }>;

const GONE = "This product no longer exists.";
const TAX_GONE = "One of the chosen taxes no longer exists. Reload the page and try again.";

async function allTaxesExist(ids: string[]) {
  return (await db.tax.count({ where: { id: { in: ids } } })) === ids.length;
}

function revalidateProduct(id?: string) {
  revalidatePath("/catalog/products");
  if (id) revalidatePath(`/catalog/products/${id}`);
}

export async function createProduct(input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { taxIds: chosen, ...data } = parsed.data;
  const taxIds = [...new Set(chosen)];
  if (!(await allTaxesExist(taxIds))) return fail(TAX_GONE, { taxIds: [TAX_GONE] });

  const product = await db.product.create({ data: { ...data, taxes: { connect: taxIds.map((id) => ({ id })) } } });
  await logActivity({
    entityType: "product",
    entityId: product.id,
    action: "created",
    message: `Product "${product.name}" created at ${formatMoney(product.salesPrice)}`,
    userId: admin.id,
  });
  revalidateProduct();
  return ok(`${product.name} was created. Add its variants below.`, { id: product.id });
}

/**
 * A product is switched off rather than deleted: plans, templates, subscriptions and invoices all point at it.
 * Changing prices here never touches subscriptions that already exist; their lines keep the price they were created with.
 */
export async function updateProduct(id: string, input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { taxIds: chosen, ...data } = parsed.data;
  const taxIds = [...new Set(chosen)];
  if (!(await allTaxesExist(taxIds))) return fail(TAX_GONE, { taxIds: [TAX_GONE] });

  const include = { taxes: { select: { name: true } } } as const;
  const before = await db.product.findUnique({ where: { id }, include });
  if (!before) return fail(GONE);
  const after = await db.product.update({
    where: { id },
    data: { ...data, taxes: { set: taxIds.map((taxId) => ({ id: taxId })) } },
    include,
  });

  const view = (p: typeof after) => ({
    name: p.name,
    type: p.type,
    isAddon: p.isAddon,
    salesPrice: p.salesPrice,
    costPrice: p.costPrice,
    taxes: p.taxes.map((t) => t.name),
    notes: p.notes,
    active: p.active ? "active" : "inactive",
  });
  const changed = await logChanges({
    entityType: "product",
    entityId: id,
    subject: `Product "${after.name}"`,
    changes: describeChanges(view(before), view(after), {
      name: "name",
      type: "type",
      isAddon: "add-on flag",
      salesPrice: ["sales price", formatMoney],
      costPrice: ["cost price", formatMoney],
      taxes: "default taxes",
      notes: "notes",
      active: ["status", String],
    }),
    userId: admin.id,
  });
  revalidateProduct(id);
  return ok(changed ? `${after.name} was saved.` : "Nothing was changed.", { id });
}

// ───────────── Variants ─────────────

export async function addVariant(productId: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const [product, value] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { name: true } }),
    db.attributeValue.findUnique({
      where: { id: parsed.data.attributeValueId },
      select: { name: true, attribute: { select: { name: true } } },
    }),
  ]);
  if (!product) return fail(GONE);
  if (!value) return fail("That option no longer exists.", { attributeValueId: ["That option no longer exists"] });

  const label = variantLabel(value);
  try {
    await db.productVariant.create({ data: { productId, ...parsed.data } });
  } catch (e) {
    // The unique index on (product, option) is the real check; it also covers two admins adding it at once.
    if (isUniqueViolation(e)) {
      return fail(`${product.name} already has ${label}.`, { attributeValueId: [`Already added to ${product.name}`] });
    }
    throw e;
  }
  await logActivity({
    entityType: "product",
    entityId: productId,
    action: "variant-added",
    message: `Variant ${label} added (+${formatMoney(parsed.data.extraPrice)})`,
    userId: admin.id,
  });
  revalidateProduct(productId);
  return ok(`${label} was added.`);
}

/** A new extra price applies to lines added from now on; lines already on subscriptions keep their price. */
export async function updateVariantPrice(variantId: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = variantPriceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const before = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { productId: true, extraPrice: true, attributeValue: { select: { name: true, attribute: { select: { name: true } } } } },
  });
  if (!before) return fail("This variant no longer exists.");
  if (before.extraPrice === parsed.data.extraPrice) return ok("Nothing was changed.");

  await db.productVariant.update({ where: { id: variantId }, data: parsed.data });
  const label = variantLabel(before.attributeValue);
  await logActivity({
    entityType: "product",
    entityId: before.productId,
    action: "variant-updated",
    message: `Variant ${label} extra price ${formatMoney(before.extraPrice)} → ${formatMoney(parsed.data.extraPrice)}`,
    userId: admin.id,
  });
  revalidateProduct(before.productId);
  return ok(`${label} now adds ${formatMoney(parsed.data.extraPrice)}.`);
}

/** A variant that a template or subscription line still points at stays, so those lines don't silently lose it. */
export async function deleteVariant(variantId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      productId: true,
      attributeValue: { select: { name: true, attribute: { select: { name: true } } } },
      _count: { select: { templateLines: true, subscriptionLines: true } },
    },
  });
  if (!variant) return ok();

  const label = variantLabel(variant.attributeValue);
  const { templateLines, subscriptionLines } = variant._count;
  if (templateLines + subscriptionLines > 0) {
    const uses = [
      templateLines && `${templateLines} quotation template line${templateLines === 1 ? "" : "s"}`,
      subscriptionLines && `${subscriptionLines} subscription line${subscriptionLines === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return fail(`${label} is used by ${uses.join(" and ")}, so it can't be removed.`);
  }

  try {
    await db.productVariant.delete({ where: { id: variantId } });
  } catch (e) {
    if (isNotFound(e)) return ok();
    if (isForeignKeyViolation(e)) return fail(`${label} is in use, so it can't be removed.`);
    throw e;
  }
  await logActivity({
    entityType: "product",
    entityId: variant.productId,
    action: "variant-removed",
    message: `Variant ${label} removed`,
    userId: admin.id,
  });
  revalidateProduct(variant.productId);
  return ok(`${label} was removed.`);
}
