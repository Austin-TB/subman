"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog } from "@/components/app/form-dialog";
import { MoneyField, SelectField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { submitForm } from "@/lib/form";
import { toInputValue } from "@/lib/money";
import {
  variantPriceSchema,
  variantSchema,
  type VariantData,
  type VariantInput,
  type VariantPriceData,
  type VariantPriceInput,
} from "@/lib/schemas/catalog";
import { addVariant, deleteVariant, updateVariantPrice } from "./actions";

export type AvailableOption = { id: string; label: string };

/** Adds a variant: an option such as "Brand: Odoo" with the extra price it adds. */
export function AddVariantDialog({ productId, options }: { productId: string; options: AvailableOption[] }) {
  const [open, setOpen] = useState(false);
  const blank: VariantInput = { attributeValueId: "", extraPrice: "0.00" };
  const form = useForm<VariantInput, unknown, VariantData>({ resolver: zodResolver(variantSchema), defaultValues: blank });

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const result = await submitForm(form, () => addVariant(productId, values));
    if (result?.ok) setOpen(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(blank);
      }}
      trigger={
        <Button size="sm">
          <PlusIcon />
          Add variant
        </Button>
      }
      title="Add a variant"
      description="An option the customer can choose. Its extra price is added to the product's price."
      submitLabel="Add variant"
      submitting={form.formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <SelectField
          control={form.control}
          name="attributeValueId"
          label="Option"
          placeholder={options.length ? "Choose an option" : "No options left to add"}
          options={options.map((o) => ({ value: o.id, label: o.label }))}
          description={
            options.length === 0 ? "Every option is already on this product. Add more under Catalog › Attributes." : undefined
          }
        />
        <MoneyField
          control={form.control}
          name="extraPrice"
          label="Extra price"
          description="Added to the unit price when this variant is chosen. 0 adds nothing."
        />
      </FieldGroup>
    </FormDialog>
  );
}

/** Changes what an existing variant adds. Subscription lines already created keep their price. */
export function EditVariantDialog({ variant }: { variant: { id: string; label: string; extraPrice: number } }) {
  const [open, setOpen] = useState(false);
  const valuesOf = (): VariantPriceInput => ({ extraPrice: toInputValue(variant.extraPrice) });
  const form = useForm<VariantPriceInput, unknown, VariantPriceData>({
    resolver: zodResolver(variantPriceSchema),
    defaultValues: valuesOf(),
  });

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const result = await submitForm(form, () => updateVariantPrice(variant.id, values));
    if (result?.ok) setOpen(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(valuesOf());
      }}
      trigger={
        <Button variant="outline" size="sm">
          Edit
        </Button>
      }
      title={`Edit ${variant.label}`}
      description="A new extra price applies to lines added from now on. Subscriptions that already have this variant keep their price."
      submitLabel="Save"
      submitting={form.formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <MoneyField control={form.control} name="extraPrice" label="Extra price" />
      </FieldGroup>
    </FormDialog>
  );
}

export function DeleteVariantButton({ variant }: { variant: { id: string; label: string } }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          Remove
        </Button>
      }
      title={`Remove ${variant.label}?`}
      description="It will no longer be offered on this product. A variant that quotation templates or subscriptions use can't be removed."
      confirmLabel="Remove"
      destructive
      action={() => deleteVariant(variant.id)}
    />
  );
}
