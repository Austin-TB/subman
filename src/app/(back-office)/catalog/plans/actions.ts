"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { describeChanges } from "@/lib/changes";
import { formatDate, formatPeriod } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { planSchema } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";

type Saved = ActionResult<{ id: string }>;

const onOff = (v: boolean) => (v ? "on" : "off");

function revalidatePlan(id?: string) {
  revalidatePath("/catalog/plans");
  if (id) revalidatePath(`/catalog/plans/${id}`);
  revalidatePath("/catalog/templates");
}

/** The product a new plan sells has to exist and be switched on. */
async function checkProduct(productId: string): Promise<ActionResult<never> | null> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { name: true, active: true } });
  if (!product) return fail("That product no longer exists.", { productId: ["That product no longer exists"] });
  if (!product.active) {
    const message = `${product.name} is inactive. Switch it on first, or pick another product`;
    return fail(`${message}.`, { productId: [message] });
  }
  return null;
}

export async function createPlan(input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const problem = await checkProduct(parsed.data.productId);
  if (problem) return problem;

  const plan = await db.plan.create({ data: parsed.data });
  await logActivity({
    entityType: "plan",
    entityId: plan.id,
    action: "created",
    message: `Plan "${plan.name}" created at ${formatMoney(plan.price)} / ${formatPeriod(plan.period, plan.interval)}`,
    userId: admin.id,
  });
  revalidatePlan();
  return ok(`${plan.name} was created.`, { id: plan.id });
}

/**
 * A price change applies to subscriptions created from now on: lines copy the plan price when they are made.
 * What a plan sells and how often it bills are fixed once it is in use, because subscriptions work out their
 * billing periods from the plan; to change those, make a new plan.
 */
export async function updatePlan(id: string, input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const before = await db.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true, templates: true } } },
  });
  if (!before) return fail("This plan no longer exists.");
  const { subscriptions, templates } = before._count;

  if (data.productId !== before.productId) {
    if (subscriptions + templates > 0) {
      const message = "The product can't change while subscriptions or templates use this plan";
      return fail(`${message}.`, { productId: [message] });
    }
    const problem = await checkProduct(data.productId);
    if (problem) return problem;
  }
  if ((data.period !== before.period || data.interval !== before.interval) && subscriptions > 0) {
    const message = "Billing can't change while subscriptions use this plan. Create a new plan instead";
    return fail(`${message}.`, { period: [message] });
  }

  const after = await db.plan.update({ where: { id }, data });

  const view = (p: typeof after) => ({
    name: p.name,
    productId: p.productId,
    price: p.price,
    billing: formatPeriod(p.period, p.interval),
    minQuantity: p.minQuantity,
    availableFrom: p.availableFrom,
    availableUntil: p.availableUntil,
    closable: p.closable,
    pausable: p.pausable,
    renewable: p.renewable,
    autoClose: p.autoClose,
    active: p.active ? "active" : "inactive",
  });
  const changed = await logChanges({
    entityType: "plan",
    entityId: id,
    subject: `Plan "${after.name}"`,
    changes: describeChanges(view(before), view(after), {
      name: "name",
      productId: "product",
      price: ["price", formatMoney],
      billing: ["billing every", String],
      minQuantity: ["minimum quantity", String],
      availableFrom: ["available from", formatDate],
      availableUntil: ["available until", formatDate],
      closable: ["closable", onOff],
      pausable: ["pausable", onOff],
      renewable: ["renewable", onOff],
      autoClose: ["auto-close", onOff],
      active: ["status", String],
    }),
    userId: admin.id,
  });
  revalidatePlan(id);
  return ok(changed ? `${after.name} was saved.` : "Nothing was changed.", { id });
}
