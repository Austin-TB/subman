import "server-only";
import { db } from "@/lib/db";
import { variantLabel } from "@/lib/catalog-data";

// Checks subscription lines against the catalog and works out what gets saved. Used when a draft is saved
// and when an add-on is switched on for a running subscription, so both apply the same rules.

export type LineWanted = { variantId: string | null; quantity: number; unitPrice: number; taxIds: string[] };

export type ResolvedLine = LineWanted & {
  productId: string;
  description: string;
  isPlanLine: boolean;
};

type Resolved = { ok: true; lines: ResolvedLine[] } | { ok: false; errors: Record<string, string[]> };

/**
 * The plan line always sells the plan's product and its quantity must reach the plan's minimum (the form only
 * shows the product, the server decides it). Every other line needs an existing, active product, a variant that
 * belongs to it and taxes that exist and are switched on. A product or tax the subscription already uses may
 * have been switched off since; `keep` lets those through so an old subscription stays editable.
 * Errors are keyed by field path ("planLine.quantity", "lines.2.taxIds").
 */
export async function resolveLines(args: {
  plan: { name: string; productId: string; minQuantity: number };
  planLine?: LineWanted;
  lines: (LineWanted & { productId: string })[];
  keep?: { productIds: string[]; taxIds: string[] };
}): Promise<Resolved> {
  const { plan, planLine, lines, keep } = args;
  const errors: Record<string, string[]> = {};
  const fail = (path: string, message: string) => (errors[path] ??= []).push(message);

  const productIds = [...new Set([plan.productId, ...lines.map((l) => l.productId)])];
  const taxIds = [...new Set([...(planLine?.taxIds ?? []), ...lines.flatMap((l) => l.taxIds)])];
  const [products, taxes] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        active: true,
        variants: { select: { id: true, attributeValue: { select: { name: true, attribute: { select: { name: true } } } } } },
      },
    }),
    db.tax.findMany({ where: { id: { in: taxIds } }, select: { id: true, name: true, active: true } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const taxById = new Map(taxes.map((t) => [t.id, t]));

  const check = (prefix: string, line: LineWanted, productId: string, isPlanLine: boolean): ResolvedLine | null => {
    const product = productById.get(productId);
    if (!product) {
      fail(`${prefix}.productId`, "That product no longer exists");
      return null;
    }
    if (!isPlanLine && !product.active && !keep?.productIds.includes(product.id)) {
      fail(`${prefix}.productId`, `${product.name} is inactive, so it can't be added`);
    }
    const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : undefined;
    if (line.variantId && !variant) fail(`${prefix}.variantId`, "That variant isn't offered on this product");
    for (const id of line.taxIds) {
      const tax = taxById.get(id);
      if (!tax) fail(`${prefix}.taxIds`, "A tax you chose no longer exists");
      else if (!tax.active && !keep?.taxIds.includes(id)) fail(`${prefix}.taxIds`, `${tax.name} is switched off`);
    }
    return {
      ...line,
      taxIds: [...new Set(line.taxIds)],
      productId: product.id,
      isPlanLine,
      description: variant ? `${product.name} (${variantLabel(variant.attributeValue)})` : product.name,
    };
  };

  const out: ResolvedLine[] = [];
  if (planLine) {
    if (planLine.quantity < plan.minQuantity) {
      fail("planLine.quantity", `${plan.name} needs a quantity of at least ${plan.minQuantity}`);
    }
    const resolved = check("planLine", planLine, plan.productId, true);
    if (resolved) out.push(resolved);
  }
  lines.forEach((line, i) => {
    const resolved = check(`lines.${i}`, line, line.productId, false);
    if (resolved) out.push(resolved);
  });

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, lines: out };
}
