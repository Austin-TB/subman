import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { taxOptions } from "@/lib/catalog-data";
import { requireAdmin } from "@/lib/session";
import { BLANK_PRODUCT, ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const taxes = await taxOptions();

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/products", label: "Products" }}
        title="New product"
        description="Name it and set its prices and default taxes. You add variants once it's saved."
      />
      <Card className="max-w-2xl">
        <CardContent>
          <ProductForm values={BLANK_PRODUCT} taxes={taxes} readOnly={false} />
        </CardContent>
      </Card>
    </>
  );
}
