"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma-errors";
import { attributeSchema, attributeValuesSchema } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";

const NAME_TAKEN = "An attribute with this name already exists";

// Attribute.name is unique, but only case-sensitively; look first ignoring case so "brand" can't sit beside "Brand".
async function nameTaken(name: string, exceptId?: string) {
  const other = await db.attribute.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  return !!other;
}

const revalidate = () => {
  revalidatePath("/catalog/attributes");
  revalidatePath("/catalog/products/[id]", "page");
};

export async function createAttribute(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (await nameTaken(parsed.data.name)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });

  let attribute;
  try {
    attribute = await db.attribute.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });
    throw e;
  }
  await logActivity({
    entityType: "attribute",
    entityId: attribute.id,
    action: "created",
    message: `Attribute "${attribute.name}" created`,
    userId: admin.id,
  });
  revalidate();
  return ok(`${attribute.name} was added. Now add its values.`);
}

export async function renameAttribute(id: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const before = await db.attribute.findUnique({ where: { id }, select: { name: true } });
  if (!before) return fail("This attribute no longer exists.");
  if (before.name === parsed.data.name) return ok("Nothing was changed.");
  if (await nameTaken(parsed.data.name, id)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });

  try {
    await db.attribute.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });
    throw e;
  }
  await logActivity({
    entityType: "attribute",
    entityId: id,
    action: "updated",
    message: `Attribute renamed from "${before.name}" to "${parsed.data.name}"`,
    userId: admin.id,
  });
  revalidate();
  return ok(`Renamed to ${parsed.data.name}.`);
}

/** Variants point at attribute values, so an attribute whose values are in use stays until those variants go. */
export async function deleteAttribute(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const attribute = await db.attribute.findUnique({ where: { id }, select: { name: true } });
  if (!attribute) return ok();

  const inUse = await db.productVariant.count({ where: { attributeValue: { attributeId: id } } });
  if (inUse > 0) {
    return fail(
      `${attribute.name} is used by ${inUse === 1 ? "1 product variant" : `${inUse} product variants`}. Remove those variants first.`,
    );
  }
  try {
    await db.attribute.delete({ where: { id } }); // its values go with it
  } catch (e) {
    if (isNotFound(e)) return ok();
    if (isForeignKeyViolation(e)) return fail(`${attribute.name} is in use, so it can't be deleted.`);
    throw e;
  }
  await logActivity({
    entityType: "attribute",
    entityId: id,
    action: "deleted",
    message: `Attribute "${attribute.name}" deleted`,
    userId: admin.id,
  });
  revalidate();
  return ok(`${attribute.name} was deleted.`);
}

/** Adds several values at once ("Odoo, SAP, Zoho"); ones the attribute already has are skipped. */
export async function addAttributeValues(attributeId: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = attributeValuesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const attribute = await db.attribute.findUnique({
    where: { id: attributeId },
    select: { name: true, values: { select: { name: true } } },
  });
  if (!attribute) return fail("This attribute no longer exists.");

  const have = new Set(attribute.values.map((v) => v.name.toLowerCase()));
  const fresh = parsed.data.names.filter((n) => !have.has(n.toLowerCase()));
  if (fresh.length === 0) {
    const message = parsed.data.names.length === 1 ? "That value already exists" : "Those values already exist";
    return fail(`${message} on ${attribute.name}.`, { names: [message] });
  }

  await db.attributeValue.createMany({ data: fresh.map((name) => ({ attributeId, name })), skipDuplicates: true });
  await logActivity({
    entityType: "attribute",
    entityId: attributeId,
    action: "values-added",
    message: `Added ${fresh.map((n) => `"${n}"`).join(", ")} to ${attribute.name}`,
    userId: admin.id,
  });
  revalidate();
  const skipped = parsed.data.names.length - fresh.length;
  return ok(
    `Added ${fresh.length === 1 ? `"${fresh[0]}"` : `${fresh.length} values`} to ${attribute.name}${skipped ? ` (${skipped} already existed)` : ""}.`,
  );
}

export async function deleteAttributeValue(valueId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const value = await db.attributeValue.findUnique({
    where: { id: valueId },
    select: { name: true, attributeId: true, attribute: { select: { name: true } }, _count: { select: { variants: true } } },
  });
  if (!value) return ok();
  if (value._count.variants > 0) {
    const n = value._count.variants;
    return fail(`${value.name} is used by ${n === 1 ? "1 product variant" : `${n} product variants`}. Remove those variants first.`);
  }
  try {
    await db.attributeValue.delete({ where: { id: valueId } });
  } catch (e) {
    if (isNotFound(e)) return ok();
    if (isForeignKeyViolation(e)) return fail(`${value.name} is in use, so it can't be removed.`);
    throw e;
  }
  await logActivity({
    entityType: "attribute",
    entityId: value.attributeId,
    action: "value-removed",
    message: `Removed "${value.name}" from ${value.attribute.name}`,
    userId: admin.id,
  });
  revalidate();
  return ok(`${value.name} was removed.`);
}
