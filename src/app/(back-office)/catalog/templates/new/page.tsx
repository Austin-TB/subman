import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { productOptions } from "@/lib/catalog-data";
import { db } from "@/lib/db";
import { planSummary } from "@/lib/plans";
import { requireAdmin } from "@/lib/session";
import { BLANK_TEMPLATE, TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requireAdmin();
  const [plans, products] = await Promise.all([
    db.plan.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    productOptions(),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/templates", label: "Quotation templates" }}
        title="New quotation template"
        description="Choose the plan and add any add-ons. The plan's own line is added for you."
      />
      <Card className="max-w-4xl">
        <CardContent>
          <TemplateForm
            values={BLANK_TEMPLATE}
            plans={plans.map((p) => ({
              id: p.id,
              name: p.name,
              productId: p.productId,
              price: p.price,
              minQuantity: p.minQuantity,
              summary: planSummary(p),
            }))}
            products={products}
            readOnly={false}
          />
        </CardContent>
      </Card>
    </>
  );
}
