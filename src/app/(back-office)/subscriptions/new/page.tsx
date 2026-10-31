import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { defaultUnitPrice } from "@/lib/billing/pricing";
import { addMonthsClamped, businessToday, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import { param } from "@/lib/list-params";
import { toInputValue } from "@/lib/money";
import { isPlanAvailableOn } from "@/lib/plans";
import type { SubscriptionInput } from "@/lib/schemas/subscriptions";
import { requireBackOffice } from "@/lib/session";
import { subscriptionFormData } from "@/lib/subscriptions/form-data";
import { SubscriptionForm } from "../subscription-form";

export const metadata: Metadata = { title: "New subscription" };

export default async function NewSubscriptionPage({ searchParams }: PageProps<"/subscriptions/new">) {
  await requireBackOffice();
  const sp = await searchParams;
  const customerId = param(sp, "customer") ?? "";
  const templateId = param(sp, "template");
  const today = businessToday();

  const [data, templates, template] = await Promise.all([
    subscriptionFormData(),
    db.quotationTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    templateId
      ? db.quotationTemplate.findUnique({
          where: { id: templateId },
          include: {
            plan: { include: { product: { include: { taxes: { where: { active: true }, select: { id: true } } } } } },
            lines: {
              orderBy: { sequence: "asc" },
              include: { product: { include: { taxes: { where: { active: true }, select: { id: true } } } }, variant: true },
            },
          },
        })
      : null,
  ]);

  let values: SubscriptionInput = {
    customerId,
    planId: "",
    startDate: toISODate(today),
    expiryDate: toISODate(addMonthsClamped(today, 12)),
    validityDays: "30",
    paymentTermId: data.paymentTerms[0]?.id ?? "",
    planLine: { variantId: "", quantity: "1", unitPrice: "", taxIds: [] },
    lines: [],
  };

  const usable = template && isPlanAvailableOn(template.plan, today);
  if (template && usable) {
    const toLine = (l: (typeof template.lines)[number]) => ({
      variantId: l.variantId ?? "",
      quantity: String(l.isPlanLine ? Math.max(l.quantity, template.plan.minQuantity) : l.quantity),
      unitPrice: toInputValue(
        l.unitPrice ??
          defaultUnitPrice({
            isPlanLine: l.isPlanLine,
            planPrice: template.plan.price,
            productPrice: l.product.salesPrice,
            variantExtra: l.variant?.extraPrice,
          }),
      ),
      taxIds: l.product.taxes.map((t) => t.id),
    });
    const [planLine, ...others] = template.lines;
    values = {
      ...values,
      planId: template.planId,
      validityDays: String(template.validityDays),
      planLine: planLine
        ? toLine(planLine)
        : {
            variantId: "",
            quantity: String(template.plan.minQuantity),
            unitPrice: toInputValue(template.plan.price),
            taxIds: template.plan.product.taxes.map((t) => t.id),
          },
      lines: others.map((l) => ({ productId: l.productId, ...toLine(l) })),
    };
  }

  const link = (t?: string) => `/subscriptions/new?${new URLSearchParams({ ...(customerId && { customer: customerId }), ...(t && { template: t }) })}`;

  return (
    <>
      <PageHeader back={{ href: "/subscriptions", label: "Subscriptions" }} title="New subscription" description="Start blank or from a quotation template." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Start from:</span>
        <Button size="sm" variant={!template ? "default" : "outline"} asChild>
          <Link href={link()}>Blank</Link>
        </Button>
        {templates.map((t) => (
          <Button key={t.id} size="sm" variant={t.id === templateId ? "default" : "outline"} asChild>
            <Link href={link(t.id)}>{t.name}</Link>
          </Button>
        ))}
      </div>
      {template && !usable && (
        <Alert variant="destructive">
          <AlertDescription>{template.plan.name} isn&apos;t available today, so this template can&apos;t be used.</AlertDescription>
        </Alert>
      )}
      <SubscriptionForm key={templateId ?? "blank"} values={values} {...data} />
    </>
  );
}
