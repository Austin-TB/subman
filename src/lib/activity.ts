import "server-only";
import { db, type Tx } from "@/lib/db";

export type EntityType =
  | "subscription"
  | "invoice"
  | "customer"
  | "payment"
  | "user"
  // Catalog and configuration (Phase 2)
  | "product"
  | "plan"
  | "template"
  | "discount"
  | "tax"
  | "paymentTerm"
  | "attribute";

export type ActivityInput = {
  entityType: EntityType;
  entityId: string;
  action: string;
  message: string;
  userId?: string | null;
};

/** Records an entry on a record's timeline. Pass `tx` to log inside a transaction. */
export function logActivity(input: ActivityInput, tx: Tx = db) {
  return tx.activityLog.create({
    data: { ...input, userId: input.userId ?? null },
  });
}

/**
 * Logs "<subject> updated: a, b" from a list made by describeChanges().
 * Returns false, and logs nothing, when nothing changed.
 */
export async function logChanges(
  input: { entityType: EntityType; entityId: string; subject: string; changes: string[]; userId: string },
  tx: Tx = db,
): Promise<boolean> {
  if (input.changes.length === 0) return false;
  await logActivity(
    {
      entityType: input.entityType,
      entityId: input.entityId,
      action: "updated",
      message: `${input.subject} updated: ${input.changes.join(", ")}`,
      userId: input.userId,
    },
    tx,
  );
  return true;
}

export function getActivity(entityType: EntityType, entityId: string) {
  return db.activityLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
    take: 100,
  });
}
