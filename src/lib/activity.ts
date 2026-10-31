import "server-only";
import { db, type Tx } from "@/lib/db";

export type EntityType = "subscription" | "invoice" | "customer" | "payment" | "plan" | "user";

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

export function getActivity(entityType: EntityType, entityId: string) {
  return db.activityLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
    take: 100,
  });
}
