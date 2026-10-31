import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { PageHeader } from "@/components/app/page-header";
import { ReadOnlyNotice } from "@/components/app/read-only";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { taxOptions, variantLabel } from "@/lib/catalog-data";
import { db } from "@/lib/db";
import { toInputValue } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";
import type { ProductInput } from "@/lib/schemas/catalog";
import { ProductForm } from "../product-form";
import { VariantsCard } from "../variants-card";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/catalog/products/[id]">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const { id } = await params;

  const [product, available] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        taxes: { select: { id: true } },
        variants: {
          select: { id: true, extraPrice: true, attributeValue: { select: { name: true, attribute: { select: { name: true } } } } },
          orderBy: [{ attributeValue: { attribute: { name: "asc" } } }, { attributeValue: { name: "asc" } }],
        },
      },
    }),
    // Options this product doesn't have yet, for the "Add variant" dialog.
    db.attributeValue.findMany({
      where: { variants: { none: { productId: id } } },
      orderBy: [{ attribute: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, attribute: { select: { name: true } } },
    }),
  ]);
  if (!product) notFound();
  const taxes = await taxOptions(product.taxes.map((t) => t.id));

  const values: ProductInput = {
    name: product.name,
    type: product.type,
    isAddon: product.isAddon,
    salesPrice: toInputValue(product.salesPrice),
    costPrice: toInputValue(product.costPrice),
    notes: product.notes ?? "",
    active: product.active,
    taxIds: product.taxes.map((t) => t.id),
  };

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/products", label: "Products" }}
        title={product.name}
        description={`${product.type === "SERVICE" ? "Service" : "Goods"}${product.isAddon ? " · Add-on" : ""}`}
        actions={<StatusBadge status={product.active ? "ACTIVE" : "INACTIVE"} />}
      />
      {!canEdit && <ReadOnlyNotice>Only an admin can change products and their variants.</ReadOnlyNotice>}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm productId={product.id} values={values} taxes={taxes} readOnly={!canEdit} />
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <VariantsCard
            productId={product.id}
            salesPrice={product.salesPrice}
            variants={product.variants.map((v) => ({ id: v.id, label: variantLabel(v.attributeValue), extraPrice: v.extraPrice }))}
            available={available.map((v) => ({ id: v.id, label: variantLabel(v) }))}
            canEdit={canEdit}
          />
          <ActivityTimeline entityType="product" entityId={product.id} />
        </div>
      </div>
    </>
  );
}
