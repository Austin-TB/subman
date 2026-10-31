"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { describeChanges } from "@/lib/changes";
import { db } from "@/lib/db";
import { addressLines, customerSchema } from "@/lib/schemas/customers";
import { requireBackOffice } from "@/lib/session";

type Saved = ActionResult<{ id: string }>;

type CustomerRow = NonNullable<Awaited<ReturnType<typeof db.customer.findUnique>>>;
const view = (c: CustomerRow) => ({ ...c, address: addressLines(c).join(", ") });

export async function createCustomer(input: unknown): Promise<Saved> {
  const user = await requireBackOffice();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const customer = await db.customer.create({ data: parsed.data });
  await logActivity({
    entityType: "customer",
    entityId: customer.id,
    action: "created",
    message: `Customer "${customer.name}" added`,
    userId: user.id,
  });
  revalidatePath("/customers");
  return ok(`${customer.name} was added.`, { id: customer.id });
}

export async function updateCustomer(id: string, input: unknown): Promise<Saved> {
  const user = await requireBackOffice();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const before = await db.customer.findUnique({ where: { id } });
  if (!before) return fail("This customer no longer exists.");

  const after = await db.customer.update({ where: { id }, data: parsed.data });
  const changed = await logChanges({
    entityType: "customer",
    entityId: id,
    subject: `Customer "${after.name}"`,
    changes: describeChanges(view(before), view(after), {
      name: "name",
      company: "company",
      email: "email",
      phone: "phone",
      address: "address",
      taxId: "tax ID",
    }),
    userId: user.id,
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return ok(changed ? `${after.name} was saved.` : "Nothing was changed.", { id });
}
