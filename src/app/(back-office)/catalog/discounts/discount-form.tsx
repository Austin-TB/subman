"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import {
  CheckboxGroupField,
  DateField,
  FormFooter,
  MoneyField,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/app/form-fields";
import { FormFieldset } from "@/components/app/read-only";
import { FieldGroup } from "@/components/ui/field";
import { discountConditions, discountValueLabel } from "@/lib/discounts";
import { submitForm } from "@/lib/form";
import {
  DISCOUNT_KINDS,
  DISCOUNT_SCOPES,
  discountSchema,
  type DiscountData,
  type DiscountInput,
} from "@/lib/schemas/catalog";
import { createDiscount, updateDiscount } from "./actions";

export type DiscountProductOption = { id: string; name: string; isAddon: boolean; active: boolean };

/** Create a discount rule, or edit one when `discountId` is given. Only an admin gets the editable version. */
export function DiscountForm({
  discountId,
  values,
  products,
  usedCount,
  readOnly,
}: {
  discountId?: string;
  values: DiscountInput;
  products: DiscountProductOption[];
  /** Uses so far (editing only). Read-only: the billing run counts them. */
  usedCount?: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const form = useForm<DiscountInput, unknown, DiscountData>({ resolver: zodResolver(discountSchema), defaultValues: values });
  const kind = useWatch({ control: form.control, name: "kind" });
  const scope = useWatch({ control: form.control, name: "scope" });
  const current = useWatch({ control: form.control });
  const preview = discountSchema.safeParse(current);

  const onSubmit = form.handleSubmit(async () => {
    const input = form.getValues();
    const result = await submitForm(form, () => (discountId ? updateDiscount(discountId, input) : createDiscount(input)));
    if (!result?.ok) return;
    if (discountId) {
      form.reset(input);
      router.refresh();
    } else {
      router.push(`/catalog/discounts/${result.data!.id}`);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FormFieldset readOnly={readOnly}>
        <FieldGroup>
          <TextField control={form.control} name="name" label="Rule name" placeholder="10% off 20+ seats" autoComplete="off" />

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField control={form.control} name="kind" label="Type" options={[...DISCOUNT_KINDS]} />
            {kind === "PERCENT" ? (
              <NumberField control={form.control} name="value" label="Discount" decimal suffix="%" placeholder="10" />
            ) : (
              <MoneyField control={form.control} name="value" label="Discount amount" />
            )}
          </div>

          <SelectField
            control={form.control}
            name="scope"
            label="Applies to"
            options={[...DISCOUNT_SCOPES]}
            description={
              scope === "PRODUCTS"
                ? "Each invoice line for one of the chosen products that meets the minimums gets the discount."
                : "The whole invoice, when its total quantity and amount meet the minimums. The discount is shared across the lines in proportion to their amounts."
            }
          />
          {scope === "PRODUCTS" && (
            <CheckboxGroupField
              control={form.control}
              name="productIds"
              label="Products"
              options={products.map((p) => ({
                value: p.id,
                disabled: !p.active && !values.productIds.includes(p.id),
                label: `${p.name}${p.isAddon ? " (add-on)" : ""}${p.active ? "" : " (inactive)"}`,
              }))}
              emptyText="No products yet. Add products first."
            />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              control={form.control}
              name="minQuantity"
              label="Minimum quantity"
              description="Leave empty for no minimum."
            />
            <MoneyField
              control={form.control}
              name="minPurchase"
              label="Minimum purchase"
              description="Before tax. Leave empty for no minimum."
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <DateField control={form.control} name="startDate" label="Starts on" />
            <DateField
              control={form.control}
              name="endDate"
              label="Ends on"
              description="Leave empty for no end date."
            />
          </div>
          <NumberField
            control={form.control}
            name="usageLimit"
            label="Usage limit"
            description={
              usedCount != null
                ? `Invoices it can land on in total. Used ${usedCount} time${usedCount === 1 ? "" : "s"} so far.`
                : "Invoices it can land on in total. Leave empty for no limit."
            }
          />
          {discountId && (
            <SwitchField
              control={form.control}
              name="active"
              label="Active"
              description="Switch off to stop the rule applying without deleting it."
            />
          )}
        </FieldGroup>
      </FormFieldset>

      {preview.success && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Preview:</span> {discountValueLabel(preview.data)} ·{" "}
          {preview.data.scope === "PRODUCTS" ? "selected products" : "whole subscription"} ·{" "}
          {discountConditions(preview.data)}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Rules apply by themselves when an invoice is created, so nobody has to remember them. A line gets at most one product
        rule and an invoice at most one subscription rule, whichever saves more. Each invoice a rule lands on counts as one use.
      </p>

      {!readOnly && (
        <FormFooter
          submitting={form.formState.isSubmitting}
          submitLabel={discountId ? "Save changes" : "Create rule"}
          cancelHref="/catalog/discounts"
        />
      )}
    </form>
  );
}
