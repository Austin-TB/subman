import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { PageHeader } from "@/components/app/page-header";
import { ReadOnlyNotice } from "@/components/app/read-only";
import { Card, CardContent } from "@/components/ui/card";
import { productOptions } from "@/lib/catalog-data";
import { db } from "@/lib/db";
import { toInputValue } from "@/lib/money";
import { planSummary } from "@/lib/plans";
import { can } from "@/lib/roles";
import type { TemplateInput } from "@/lib/schemas/catalog";
import { requireBackOffice } from "@/lib/session";
import { DeleteTemplateButton } from "../delete-template-button";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "Quotation template" };

export default async function TemplatePage({ params }: PageProps<"/catalog/templates/[id]">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const { id } = await params;

  const template = await db.quotationTemplate.findUnique({
    where: { id },
    include: { lines: { orderBy: { sequence: "asc" } } },
  });
  if (!template) notFound();

  // Active plans and products, plus the ones this template already uses even if switched off since.
  const [plans, products] = await Promise.all([
    db.plan.findMany({ where: { OR: [{ active: true }, { id: template.planId }] }, orderBy: { name: "asc" } }),
    productOptions(template.lines.map((l) => l.productId)),
  ]);

  const [planLine, ...others] = template.lines;
  const values: TemplateInput = {
    name: template.name,
    planId: template.planId,
    validityDays: String(template.validityDays),
    planLine: {
      variantId: planLine?.variantId ?? "",
      quantity: String(planLine?.quantity ?? 1),
      unitPrice: toInputValue(planLine?.unitPrice),
    },
    lines: others.map((l) => ({
      productId: l.productId,
      variantId: l.variantId ?? "",
      quantity: String(l.quantity),
      unitPrice: toInputValue(l.unitPrice),
    })),
  };

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/templates", label: "Quotation templates" }}
        title={template.name}
        description={`Quotations made from it stay valid for ${template.validityDays} days.`}
        actions={canEdit && <DeleteTemplateButton template={{ id: template.id, name: template.name }} />}
      />
      {!canEdit && <ReadOnlyNotice>Only an admin can change quotation templates.</ReadOnlyNotice>}
      <Card className="max-w-4xl">
        <CardContent>
          <TemplateForm
            templateId={template.id}
            values={values}
            plans={plans.map((p) => ({
              id: p.id,
              name: p.name,
              productId: p.productId,
              price: p.price,
              minQuantity: p.minQuantity,
              summary: planSummary(p),
            }))}
            products={products}
            readOnly={!canEdit}
          />
        </CardContent>
      </Card>
      <div className="max-w-4xl">
        <ActivityTimeline entityType="template" entityId={template.id} />
      </div>
    </>
  );
}
