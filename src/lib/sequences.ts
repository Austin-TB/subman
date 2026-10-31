import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Next gap-free number for a prefix and year, e.g. ("INV", 2026) → "INV/2026/00001".
 * Must be called inside the transaction that uses the number: the row lock taken by
 * the upsert serialises concurrent callers, and a rollback gives the number back.
 */
export async function nextNumber(tx: Tx, prefix: string, year: number, pad = 5): Promise<string> {
  const key = `${prefix}/${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("key", "next") VALUES (${key}, 2)
    ON CONFLICT ("key") DO UPDATE SET "next" = "Sequence"."next" + 1
    RETURNING "next" - 1 AS value`;
  return `${key}/${String(rows[0].value).padStart(pad, "0")}`;
}
