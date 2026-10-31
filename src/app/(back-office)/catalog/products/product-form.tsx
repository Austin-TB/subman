"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  CheckboxGroupField,
  FormFooter,
  MoneyField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/app/form-fields";
import { FormFieldset } from "@/components/app/read-only";
import { FieldGroup } from "@/components/ui/field";
import type { TaxOption } from "@/lib/catalog-data";
import { submitForm } from "@/lib/form";
import { PRODUCT_TYPES, productSchema, type ProductData, type ProductInput } from "@/lib/schemas/catalog";
import { createProduct, updateProduct } from "./actions";

export const BLANK_PRODUCT: ProductInput = {
  name: "",
  type: "SERVICE",
  isAddon: false,
  salesPrice: "",
  costPrice: "",
  notes: "",
  active: true,
  taxIds: [],
};

/** Create a product, or edit one when `productId` is given. `readOnly` is for staff, who can look but not change. */
export function ProductForm({
  productId,
  values,
  taxes,
  readOnly,
}: {
  productId?: string;
  values: ProductInput;
  taxes: TaxOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const form = useForm<ProductInput, unknown, ProductData>({ resolver: zodResolver(productSchema), defaultValues: values });

  const onSubmit = form.handleSubmit(async () => {
    const input = form.getValues();
    const result = await submitForm(form, () => (productId ? updateProduct(productId, input) : createProduct(input)));
    if (!result?.ok) return;
    if (productId) {
      form.reset(input); // what was saved is the new starting point
      router.refresh();
    } else {
      router.push(`/catalog/products/${result.data!.id}`);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FormFieldset readOnly={readOnly}>
        <FieldGroup>
          <TextField control={form.control} name="name" label="Name" placeholder="Brightloop Analytics" autoComplete="off" />
          <SelectField control={form.control} name="type" label="Type" options={[...PRODUCT_TYPES]} />
          <div className="grid gap-5 sm:grid-cols-2">
            <MoneyField
              control={form.control}
              name="salesPrice"
              label="Sales price"
              description="Per unit, per billing period."
            />
            <MoneyField control={form.control} name="costPrice" label="Cost price" description="What it costs Brightloop." />
          </div>
          <SwitchField
            control={form.control}
            name="isAddon"
            label="Add-on"
            description="Sold on top of a plan, and switched on or off on a subscription."
          />
          <CheckboxGroupField
            control={form.control}
            name="taxIds"
            label="Default taxes"
            description="Copied onto new subscription lines for this product. Each line can still be changed."
            options={taxes.map((t) => ({
              value: t.id,
              disabled: !t.active && !values.taxIds.includes(t.id),
              label: (
                <>
                  {t.name.includes(t.rate) ? t.name : `${t.name} · ${t.rate}`}
                  {!t.active && <span className="text-muted-foreground"> (inactive)</span>}
                </>
              ),
            }))}
            emptyText="No taxes yet. Add them under Configuration › Taxes."
          />
          <TextareaField control={form.control} name="notes" label="Notes" placeholder="Anything the team should know" />
          {productId && (
            <SwitchField
              control={form.control}
              name="active"
              label="Active"
              description="Inactive products can't be added to new plans, templates or subscriptions. Existing ones are not affected."
            />
          )}
        </FieldGroup>
      </FormFieldset>
      {!readOnly && (
        <FormFooter
          submitting={form.formState.isSubmitting}
          submitLabel={productId ? "Save changes" : "Create product"}
          cancelHref="/catalog/products"
        />
      )}
    </form>
  );
}
