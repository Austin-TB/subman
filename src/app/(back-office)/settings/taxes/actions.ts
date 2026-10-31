"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { describeChanges } from "@/lib/changes";
import { db } from "@/lib/db";
import { taxSchema } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";
import { formatTaxRate } from "@/lib/taxes";

const NAME_TAKEN = "A tax with this name already exists";

// Names are compared ignoring case so "gst 18%" can't sit beside "GST 18%" in a picker.
async function nameTaken(name: string, exceptId?: string) {
  const other = await db.tax.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  return !!other;
}

export async function createTax(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = taxSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (await nameTaken(parsed.data.name)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });

  const tax = await db.tax.create({ data: parsed.data });
  await logActivity({
    entityType: "tax",
    entityId: tax.id,
    action: "created",
    message: `Tax "${tax.name}" created at ${formatTaxRate(tax)}`,
    userId: admin.id,
  });
  revalidatePath("/settings/taxes");
  return ok(`${tax.name} was added.`);
}

/**
 * Taxes are never deleted: removing one would silently drop it from every product and subscription line that uses it.
 * Switching one off keeps it where it is but stops it being offered for new products and lines.
 */
export async function updateTax(id: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = taxSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const before = await db.tax.findUnique({ where: { id } });
  if (!before) return fail("This tax no longer exists.");
  if (await nameTaken(parsed.data.name, id)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });

  const tax = await db.tax.update({ where: { id }, data: parsed.data });

  const view = (t: typeof tax) => ({ name: t.name, rate: formatTaxRate(t), active: t.active ? "active" : "inactive" });
  const changed = await logChanges({
    entityType: "tax",
    entityId: id,
    subject: `Tax "${tax.name}"`,
    changes: describeChanges(view(before), view(tax), { name: ["name", String], rate: ["rate", String], active: ["status", String] }),
    userId: admin.id,
  });
  revalidatePath("/settings/taxes");
  return ok(changed ? `${tax.name} was updated.` : "Nothing was changed.");
}
