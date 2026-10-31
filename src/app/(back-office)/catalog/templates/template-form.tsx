"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { FormFooter, MoneyField, NumberField, SelectField, TextField } from "@/components/app/form-fields";
import { FormFieldset } from "@/components/app/read-only";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { defaultUnitPrice, recurringAmount } from "@/lib/billing/pricing";
import type { ProductOption } from "@/lib/catalog-data";
import { submitForm } from "@/lib/form";
import { formatMoney, parseMoney, toInputValue } from "@/lib/money";
import {
  MAX_TEMPLATE_LINES,
  templateSchema,
  type TemplateData,
  type TemplateInput,
} from "@/lib/schemas/catalog";
import { createTemplate, updateTemplate } from "./actions";

export type TemplatePlan = {
  id: string;
  name: string;
  productId: string;
  price: number;
  minQuantity: number;
  /** "₹1,200.00 / month · min 5 · Pausable", ready to show. */
  summary: string;
};

type Form = Control<TemplateInput, unknown, TemplateData>;

export const BLANK_TEMPLATE: TemplateInput = {
  name: "",
  planId: "",
  validityDays: "30",
  planLine: { variantId: "", quantity: "1", unitPrice: "" },
  lines: [],
};

// One line: product, variant, quantity, unit price, and room for the remove button.
const ROW = "grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_6rem_minmax(0,1.3fr)_2rem] sm:items-start";
const HIDE_LABEL = "sm:sr-only"; // the column headings name the fields on wide screens

const variantOptions = (product?: ProductOption) =>
  (product?.variants ?? []).map((v) => ({ value: v.id, label: `${v.label} (+${formatMoney(v.extraPrice)})` }));

/** Create a template, or edit one when `templateId` is given. */
export function TemplateForm({
  templateId,
  values,
  plans,
  products,
  readOnly,
}: {
  templateId?: string;
  values: TemplateInput;
  plans: TemplatePlan[];
  products: ProductOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const form = useForm<TemplateInput, unknown, TemplateData>({
    resolver: zodResolver(templateSchema),
    defaultValues: values,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const current = useWatch({ control: form.control });
  const plan = planById.get(current.planId ?? "");
  const planProduct = plan && productById.get(plan.productId);

  // The price a line starts from when its price box is left empty.
  const priceFor = (productId: string, variantId: string | undefined, isPlanLine: boolean) => {
    const product = productById.get(productId);
    return defaultUnitPrice({
      isPlanLine,
      planPrice: plan?.price ?? 0,
      productPrice: product?.salesPrice ?? 0,
      variantExtra: product?.variants.find((v) => v.id === variantId)?.extraPrice,
    });
  };
  const quantityOf = (raw: string | undefined) => (/^\d+$/.test(raw?.trim() ?? "") ? Number(raw) : 0);
  const unitOf = (raw: string | undefined, fallback: number) => (raw?.trim() ? (parseMoney(raw) ?? fallback) : fallback);

  const planLine = current.planLine;
  const estimate = recurringAmount([
    ...(plan && planLine
      ? [
          {
            quantity: quantityOf(planLine.quantity),
            unitPrice: unitOf(planLine.unitPrice, priceFor(plan.productId, planLine.variantId, true)),
          },
        ]
      : []),
    ...(current.lines ?? []).map((l) => ({
      quantity: quantityOf(l?.quantity),
      unitPrice: unitOf(l?.unitPrice, l?.productId ? priceFor(l.productId, l.variantId, false) : 0),
    })),
  ]);

  // A new plan means a new product: the old variant no longer applies, and the quantity must reach the minimum.
  function onPlanChange(planId: string) {
    const next = planById.get(planId);
    if (!next) return;
    form.setValue("planLine.variantId", "");
    const quantity = quantityOf(form.getValues("planLine.quantity"));
    if (quantity < next.minQuantity) form.setValue("planLine.quantity", String(next.minQuantity));
  }

  const onSubmit = form.handleSubmit(async () => {
    const input = form.getValues();
    const result = await submitForm(form, () => (templateId ? updateTemplate(templateId, input) : createTemplate(input)));
    if (!result?.ok) return;
    if (templateId) {
      form.reset(input);
      router.refresh();
    } else {
      router.push(`/catalog/templates/${result.data!.id}`);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FormFieldset readOnly={readOnly}>
        <FieldGroup>
          <TextField control={form.control} name="name" label="Template name" placeholder="Enterprise Yearly" autoComplete="off" />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="planId"
              label="Plan"
              placeholder="Choose a plan"
              options={plans.map((p) => ({ value: p.id, label: p.name }))}
              onValueChange={onPlanChange}
              description={plan?.summary}
            />
            <NumberField
              control={form.control}
              name="validityDays"
              label="Quotation valid for"
              suffix="days"
              description="How long a quotation made from this template can still be confirmed."
            />
          </div>

          <FieldSet>
            <FieldLegend variant="label">Lines</FieldLegend>
            <div className="grid gap-3">
              <div className={`${ROW} hidden text-xs font-medium text-muted-foreground sm:grid`} aria-hidden>
                <span>Product</span>
                <span>Variant</span>
                <span>Quantity</span>
                <span>Unit price</span>
                <span />
              </div>

              <div className={ROW}>
                <div className="grid gap-2">
                  <span className="text-sm font-medium sm:sr-only">Product</span>
                  <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
                    <LockIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{planProduct?.name ?? (plan ? "Product of the plan" : "Choose a plan first")}</span>
                    <Badge variant="secondary" className="ml-auto">
                      Plan
                    </Badge>
                  </div>
                </div>
                <SelectField
                  control={form.control}
                  name="planLine.variantId"
                  label="Variant"
                  labelClassName={HIDE_LABEL}
                  emptyLabel="No variant"
                  options={variantOptions(planProduct)}
                />
                <NumberField
                  control={form.control}
                  name="planLine.quantity"
                  label="Quantity"
                  labelClassName={HIDE_LABEL}
                  description={plan && plan.minQuantity > 1 ? `Min ${plan.minQuantity}` : undefined}
                />
                <MoneyField
                  control={form.control}
                  name="planLine.unitPrice"
                  label="Unit price"
                  labelClassName={HIDE_LABEL}
                  placeholder={plan ? toInputValue(priceFor(plan.productId, planLine?.variantId, true)) : "0.00"}
                />
                <span />
              </div>

              {fields.map((field, index) => (
                <ExtraLine
                  key={field.id}
                  index={index}
                  control={form.control}
                  setVariant={(value) => form.setValue(`lines.${index}.variantId`, value)}
                  products={products}
                  priceFor={priceFor}
                  onRemove={() => remove(index)}
                  readOnly={readOnly}
                />
              ))}
            </div>
            {!readOnly && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fields.length >= MAX_TEMPLATE_LINES}
                  onClick={() => append({ productId: "", variantId: "", quantity: "1", unitPrice: "" })}
                >
                  <PlusIcon />
                  Add line
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              The plan&apos;s own line is always first. Leave a unit price empty to use the current price, so the template
              follows later price changes.
            </p>
          </FieldSet>
        </FieldGroup>
      </FormFieldset>

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Estimated per billing period:</span>{" "}
        <span className="tabular-nums">{formatMoney(estimate)}</span> before tax and discounts.
      </p>

      {!readOnly && (
        <FormFooter
          submitting={form.formState.isSubmitting}
          submitLabel={templateId ? "Save changes" : "Create template"}
          cancelHref="/catalog/templates"
        />
      )}
    </form>
  );
}

/** A line for a product other than the plan's: its own product, variant, quantity and price. */
function ExtraLine({
  index,
  control,
  setVariant,
  products,
  priceFor,
  onRemove,
  readOnly,
}: {
  index: number;
  control: Form;
  setVariant: (value: string) => void;
  products: ProductOption[];
  priceFor: (productId: string, variantId: string | undefined, isPlanLine: boolean) => number;
  onRemove: () => void;
  readOnly: boolean;
}) {
  const productId = useWatch({ control, name: `lines.${index}.productId` });
  const variantId = useWatch({ control, name: `lines.${index}.variantId` });
  const product = products.find((p) => p.id === productId);

  return (
    <div className={ROW}>
      <SelectField
        control={control}
        name={`lines.${index}.productId`}
        label="Product"
        labelClassName={HIDE_LABEL}
        placeholder="Choose a product"
        options={products.map((p) => ({ value: p.id, label: `${p.name}${p.isAddon ? " (add-on)" : ""}${p.active ? "" : " (inactive)"}` }))}
        onValueChange={() => setVariant("")}
      />
      <SelectField
        control={control}
        name={`lines.${index}.variantId`}
        label="Variant"
        labelClassName={HIDE_LABEL}
        emptyLabel="No variant"
        options={variantOptions(product)}
        disabled={!product || product.variants.length === 0}
      />
      <NumberField control={control} name={`lines.${index}.quantity`} label="Quantity" labelClassName={HIDE_LABEL} />
      <MoneyField
        control={control}
        name={`lines.${index}.unitPrice`}
        label="Unit price"
        labelClassName={HIDE_LABEL}
        placeholder={productId ? toInputValue(priceFor(productId, variantId, false)) : "0.00"}
      />
      {readOnly ? (
        <span />
      ) : (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove line ${index + 2}`}>
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}
