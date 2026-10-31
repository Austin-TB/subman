import "server-only";
import { db } from "@/lib/db";
import { formatTaxRate } from "@/lib/taxes";

// Loaders for the pickers on catalog forms. Each offers what is active, plus anything the record being
// edited already points at, so switching something off never makes an existing record unreadable.

export type TaxOption = { id: string; name: string; rate: string; active: boolean };

export async function taxOptions(keepIds: string[] = []): Promise<TaxOption[]> {
  const taxes = await db.tax.findMany({
    where: { OR: [{ active: true }, { id: { in: keepIds } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, rate: true, active: true },
  });
  return taxes.map((t) => ({ id: t.id, name: t.name, rate: formatTaxRate(t), active: t.active }));
}

export type VariantOption = { id: string; label: string; extraPrice: number };

export type ProductOption = {
  id: string;
  name: string;
  isAddon: boolean;
  salesPrice: number;
  active: boolean;
  variants: VariantOption[];
};

export async function productOptions(keepIds: string[] = []): Promise<ProductOption[]> {
  const products = await db.product.findMany({
    where: { OR: [{ active: true }, { id: { in: keepIds } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isAddon: true,
      salesPrice: true,
      active: true,
      variants: {
        select: { id: true, extraPrice: true, attributeValue: { select: { name: true, attribute: { select: { name: true } } } } },
        orderBy: [{ attributeValue: { attribute: { name: "asc" } } }, { attributeValue: { name: "asc" } }],
      },
    },
  });
  return products.map(({ variants, ...p }) => ({
    ...p,
    variants: variants.map((v) => ({ id: v.id, extraPrice: v.extraPrice, label: variantLabel(v.attributeValue) })),
  }));
}

/** "Brand: Odoo" */
export const variantLabel = (value: { name: string; attribute: { name: string } }) =>
  `${value.attribute.name}: ${value.name}`;
