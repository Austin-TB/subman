import "server-only";
import { Prisma } from "@/generated/prisma/client";

const hasCode = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

/** A unique index rejected the row. This is the real duplicate check; a lookup before the insert can race. */
export const isUniqueViolation = (e: unknown) => hasCode(e, "P2002");

/** A foreign key refused the change: the row is still referenced, or points at something that is gone. */
export const isForeignKeyViolation = (e: unknown) => hasCode(e, "P2003");

/** The row to update or delete no longer exists. */
export const isNotFound = (e: unknown) => hasCode(e, "P2025");
