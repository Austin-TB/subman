"use server";

import { revalidatePath } from "next/cache";
import { fail, invalid, ok, type ActionResult } from "@/lib/action";
import { logActivity, logChanges } from "@/lib/activity";
import { describeChanges } from "@/lib/changes";
import { db } from "@/lib/db";
import { templateSchema, type TemplateData } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";

type Saved = ActionResult<{ id: string }>;

const FIX = "Check the highlighted fields.";

type Resolved = {
  plan: { id: string; name: string };
  /** The plan line first, then the other lines, each with its product filled in. */
  lines: { productId: string; variantId: string | null; quantity: number; unitPrice: number | null }[];
};

/**
 * Checks a template against the catalog. The plan line always sells the plan's product (the form only
 * shows it, the server decides it), its quantity must reach the plan's minimum, and every variant must
 * belong to the product on its line. Returns the lines to save, or the errors by field path.
 */
async function resolve(
  data: TemplateData,
  keepPlanId?: string,
): Promise<{ ok: true; value: Resolved } | { ok: false; errors: Record<string, string[]> }> {
  const plan = await db.plan.findUnique({
    where: { id: data.planId },
    select: { id: true, name: true, productId: true, minQuantity: true, active: true },
  });
  if (!plan) return { ok: false, errors: { planId: ["That plan no longer exists"] } };

  const errors: Record<string, string[]> = {};
  // A template keeps working on a plan that has been switched off since; only a new choice is checked.
  if (!plan.active && plan.id !== keepPlanId) errors.planId = [`${plan.name} is inactive, so it can't be chosen`];

  const wanted = [...new Set([plan.productId, ...data.lines.map((l) => l.productId)])];
  const products = await db.product.findMany({
    where: { id: { in: wanted } },
    select: { id: true, variants: { select: { id: true } } },
  });
  const variantsOf = new Map(products.map((p) => [p.id, new Set(p.variants.map((v) => v.id))]));

  const planLine = { ...data.planLine, productId: plan.productId };
  if (planLine.quantity < plan.minQuantity) {
    errors["planLine.quantity"] = [`${plan.name} needs at least ${plan.minQuantity}`];
  }
  if (planLine.variantId && !variantsOf.get(plan.productId)?.has(planLine.variantId)) {
    errors["planLine.variantId"] = ["That variant isn't offered on this product"];
  }
  data.lines.forEach((line, i) => {
    const variants = variantsOf.get(line.productId);
    if (!variants) errors[`lines.${i}.productId`] = ["That product no longer exists"];
    else if (line.variantId && !variants.has(line.variantId)) {
      errors[`lines.${i}.variantId`] = ["That variant isn't offered on this product"];
    }
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { plan, lines: [planLine, ...data.lines] } };
}

const linesKey = (lines: { productId: string; variantId: string | null; quantity: number; unitPrice: number | null }[]) =>
  lines.map((l) => `${l.productId}|${l.variantId ?? ""}|${l.quantity}|${l.unitPrice ?? ""}`).join(";");

const revalidateTemplates = (id?: string) => {
  revalidatePath("/catalog/templates");
  if (id) revalidatePath(`/catalog/templates/${id}`);
};

export async function createTemplate(input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const resolved = await resolve(parsed.data);
  if (!resolved.ok) return fail(FIX, resolved.errors);
  const { plan, lines } = resolved.value;

  const template = await db.quotationTemplate.create({
    data: {
      name: parsed.data.name,
      planId: plan.id,
      validityDays: parsed.data.validityDays,
      lines: { create: lines.map((l, sequence) => ({ ...l, sequence, isPlanLine: sequence === 0 })) },
    },
  });
  await logActivity({
    entityType: "template",
    entityId: template.id,
    action: "created",
    message: `Template "${template.name}" created for plan ${plan.name} with ${lines.length} line${lines.length === 1 ? "" : "s"}`,
    userId: admin.id,
  });
  revalidateTemplates();
  return ok(`${template.name} was created.`, { id: template.id });
}

/** Lines are replaced as a set: nothing else points at a template line, so there is nothing to keep in step. */
export async function updateTemplate(id: string, input: unknown): Promise<Saved> {
  const admin = await requireAdmin();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const before = await db.quotationTemplate.findUnique({
    where: { id },
    include: { plan: { select: { name: true } }, lines: { orderBy: { sequence: "asc" } } },
  });
  if (!before) return fail("This template no longer exists.");

  const resolved = await resolve(parsed.data, before.planId);
  if (!resolved.ok) return fail(FIX, resolved.errors);
  const { plan, lines } = resolved.value;

  await db.$transaction(async (tx) => {
    await tx.quotationTemplate.update({
      where: { id },
      data: { name: parsed.data.name, planId: plan.id, validityDays: parsed.data.validityDays },
    });
    await tx.quotationTemplateLine.deleteMany({ where: { templateId: id } });
    await tx.quotationTemplateLine.createMany({
      data: lines.map((l, sequence) => ({ ...l, templateId: id, sequence, isPlanLine: sequence === 0 })),
    });
  });

  const changed = await logChanges({
    entityType: "template",
    entityId: id,
    subject: `Template "${parsed.data.name}"`,
    changes: describeChanges(
      { name: before.name, plan: before.plan.name, validity: before.validityDays, lines: linesKey(before.lines) },
      { name: parsed.data.name, plan: plan.name, validity: parsed.data.validityDays, lines: linesKey(lines) },
      { name: "name", plan: ["plan", String], validity: ["valid for (days)", String], lines: "lines" },
    ),
    userId: admin.id,
  });
  revalidateTemplates(id);
  return ok(changed ? `${parsed.data.name} was saved.` : "Nothing was changed.", { id });
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const template = await db.quotationTemplate.findUnique({ where: { id }, select: { name: true } });
  if (!template) return ok();

  // Subscriptions made from a template keep their own copy of the lines, so deleting it affects none of them.
  await db.quotationTemplate.deleteMany({ where: { id } });
  await logActivity({
    entityType: "template",
    entityId: id,
    action: "deleted",
    message: `Template "${template.name}" deleted`,
    userId: admin.id,
  });
  revalidateTemplates();
  return ok(`${template.name} was deleted.`);
}
