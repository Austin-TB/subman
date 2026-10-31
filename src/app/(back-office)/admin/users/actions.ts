"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { addStaffSchema } from "@/lib/schemas/auth";
import { requireAdmin } from "@/lib/session";

/** Emails a set-password link. It's the "Forgot password" flow, which also works for someone with no password yet. */
function sendSetPasswordLink(email: string) {
  return auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
}

const EMAIL_TAKEN = "A user with this email already exists";

export async function addStaff(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = addStaffSchema.safeParse(input);
  if (!parsed.success) return fail("Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const { name, email } = parsed.data;

  let user;
  try {
    user = await db.user.create({ data: { id: randomUUID(), name, email, role: "STAFF" } });
  } catch (e) {
    // The unique index on email is the real check; this also covers two admins adding the same address at once.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(`${EMAIL_TAKEN}.`, { email: [EMAIL_TAKEN] });
    }
    throw e;
  }

  await sendSetPasswordLink(email);
  await logActivity({
    entityType: "user",
    entityId: user.id,
    action: "created",
    message: `Staff account created for ${name}`,
    userId: admin.id,
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/outbox");
  return ok(`${name} was added. A set-password link was emailed to ${email} (see the Outbox).`);
}

/** Someone who hasn't used their link yet (or let it expire) gets a fresh one. */
export async function resendSetPasswordLink(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, accounts: { where: { providerId: "credential" }, select: { id: true }, take: 1 } },
  });
  if (!user) return fail("User not found.");
  if (user.accounts.length > 0) return fail(`${user.name} has already set a password.`);

  await sendSetPasswordLink(user.email);
  revalidatePath("/admin/outbox");
  return ok(`A new set-password link was emailed to ${user.email} (see the Outbox).`);
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Blocking yourself also guarantees there is always an admin who can log in.
  if (userId === admin.id) return fail("You can't deactivate your own account.");

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, active: true } });
  if (!user) return fail("User not found.");
  if (user.active === active) return ok();

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active } });
    // Deactivating signs them out everywhere straight away.
    if (!active) await tx.session.deleteMany({ where: { userId } });
  });
  await logActivity({
    entityType: "user",
    entityId: userId,
    action: active ? "reactivated" : "deactivated",
    message: `${user.name} was ${active ? "reactivated" : "deactivated"}`,
    userId: admin.id,
  });
  revalidatePath("/admin/users");
  return ok(active ? `${user.name} can log in again.` : `${user.name} was deactivated and signed out.`);
}
