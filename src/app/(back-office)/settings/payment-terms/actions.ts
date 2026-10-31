"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { describeChanges } from "@/lib/changes";
import { db } from "@/lib/db";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma-errors";
import { paymentTermSchema } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";

const NAME_TAKEN = "A payment term with this name already exists";

// The unique index on PaymentTerm.name is the real check (it also catches two admins saving at once).
// It is case-sensitive, so look first ignoring case: "net 30" shouldn't sit beside "Net 30".
async function nameTaken(name: string, exceptId?: string) {
  const other = await db.paymentTerm.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  return !!other;
}

export async function createPaymentTerm(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = paymentTermSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (await nameTaken(parsed.data.name)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });

  let term;
  try {
    term = await db.paymentTerm.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });
    throw e;
  }
  await logActivity({
    entityType: "paymentTerm",
    entityId: term.id,
    action: "created",
    message: `Payment term "${term.name}" created (${term.dueDays} days)`,
    userId: admin.id,
  });
  revalidatePath("/settings/payment-terms");
  return ok(`${term.name} was added.`);
}

export async function updatePaymentTerm(id: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = paymentTermSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const before = await db.paymentTerm.findUnique({ where: { id } });
  if (!before) return fail("This payment term no longer exists.");
  if (await nameTaken(parsed.data.name, id)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });

  let term;
  try {
    term = await db.paymentTerm.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`${NAME_TAKEN}.`, { name: [NAME_TAKEN] });
    throw e;
  }
  const changed = await logChanges({
    entityType: "paymentTerm",
    entityId: id,
    subject: `Payment term "${term.name}"`,
    changes: describeChanges(before, term, { name: "name", dueDays: ["days", String] }),
    userId: admin.id,
  });
  revalidatePath("/settings/payment-terms");
  return ok(changed ? `${term.name} was updated.` : "Nothing was changed.");
}

/** A term that subscriptions use can't go: they would have no due date rule. */
export async function deletePaymentTerm(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const term = await db.paymentTerm.findUnique({
    where: { id },
    select: { name: true, _count: { select: { subscriptions: true } } },
  });
  if (!term) return ok();
  const inUse = (n: number) => fail(`${term.name} is used by ${n === 1 ? "1 subscription" : `${n} subscriptions`}, so it can't be deleted.`);
  if (term._count.subscriptions > 0) return inUse(term._count.subscriptions);

  try {
    await db.paymentTerm.delete({ where: { id } });
  } catch (e) {
    if (isNotFound(e)) return ok();
    // A subscription picked this term between the check above and the delete.
    if (isForeignKeyViolation(e)) return fail(`${term.name} is in use, so it can't be deleted.`);
    throw e;
  }
  await logActivity({
    entityType: "paymentTerm",
    entityId: id,
    action: "deleted",
    message: `Payment term "${term.name}" deleted`,
    userId: admin.id,
  });
  revalidatePath("/settings/payment-terms");
  return ok(`${term.name} was deleted.`);
}
