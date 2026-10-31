import "server-only";
import { productOptions, taxOptions } from "@/lib/catalog-data";
import { db } from "@/lib/db";
import { planSummary } from "@/lib/plans";

/** Everything the subscription form's pickers need. `keep` holds ids the record already uses, even if switched off since. */
export async function subscriptionFormData(keep: { planId?: string; productIds?: string[]; taxIds?: string[] } = {}) {
  const [customers, plans, paymentTerms, taxes] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, company: true }, take: 5000 }),
    db.plan.findMany({ where: { OR: [{ active: true }, { id: keep.planId ?? "" }] }, orderBy: { name: "asc" } }),
    db.paymentTerm.findMany({ orderBy: { dueDays: "asc" }, select: { id: true, name: true } }),
    taxOptions(keep.taxIds),
  ]);
  const products = await productOptions([...(keep.productIds ?? []), ...plans.map((p) => p.productId)]);
  return {
    customers: customers.map((c) => ({ id: c.id, label: c.company ? `${c.name} · ${c.company}` : c.name })),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      productId: p.productId,
      price: p.price,
      minQuantity: p.minQuantity,
      availableFrom: p.availableFrom.toISOString(),
      availableUntil: p.availableUntil?.toISOString() ?? null,
      summary: planSummary(p),
    })),
    paymentTerms,
    products,
    taxes,
  };
}
