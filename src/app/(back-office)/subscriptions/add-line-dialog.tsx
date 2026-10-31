"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { FormDialog } from "@/components/app/form-dialog";
import { MoneyField, NumberField, SelectField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { ProductOption, TaxOption } from "@/lib/catalog-data";
import { submitForm } from "@/lib/form";
import { formatMoney, toInputValue } from "@/lib/money";
import { addLineSchema, type AddLineData, type AddLineInput } from "@/lib/schemas/subscriptions";
import type { ActionResult } from "@/lib/action";

const BLANK: AddLineInput = { productId: "", variantId: "", quantity: "1", unitPrice: "", taxIds: [] };

/** Switch an add-on on for a running subscription. Billed from the next invoice. */
export function AddLineDialog({
  products,
  taxes,
  add,
}: {
  products: ProductOption[];
  taxes: TaxOption[];
  add: (input: AddLineInput) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const form = useForm<AddLineInput, unknown, AddLineData>({ resolver: zodResolver(addLineSchema), defaultValues: BLANK });
  const productId = useWatch({ control: form.control, name: "productId" });
  const product = products.find((p) => p.id === productId);

  const setProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    form.setValue("variantId", "");
    form.setValue("unitPrice", toInputValue(p?.salesPrice ?? 0));
    form.setValue("taxIds", (p?.taxIds ?? []).filter((t) => taxes.find((x) => x.id === t)?.active));
  };
  const setVariant = (id: string) => {
    const extra = product?.variants.find((v) => v.id === id)?.extraPrice ?? 0;
    form.setValue("unitPrice", toInputValue((product?.salesPrice ?? 0) + extra));
  };

  const onSubmit = form.handleSubmit(async () => {
    const r = await submitForm(form, () => add(form.getValues()));
    if (!r?.ok) return;
    form.reset(BLANK);
    setOpen(false);
    router.refresh();
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          <PlusIcon />
          Add line
        </Button>
      }
      title="Add a line"
      description="Switch an add-on on. It is billed from the next invoice; nothing is prorated."
      submitLabel="Add line"
      submitting={form.formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <SelectField
          control={form.control}
          name="productId"
          label="Product"
          placeholder="Choose a product"
          options={products.map((p) => ({ value: p.id, label: `${p.name}${p.isAddon ? " (add-on)" : ""} · ${formatMoney(p.salesPrice)}` }))}
          onValueChange={setProduct}
        />
        <SelectField
          control={form.control}
          name="variantId"
          label="Variant"
          emptyLabel="No variant"
          options={(product?.variants ?? []).map((v) => ({ value: v.id, label: `${v.label} (+${formatMoney(v.extraPrice)})` }))}
          disabled={!product || product.variants.length === 0}
          onValueChange={setVariant}
        />
        <div className="grid grid-cols-2 gap-4">
          <NumberField control={form.control} name="quantity" label="Quantity" />
          <MoneyField control={form.control} name="unitPrice" label="Unit price" />
        </div>
        <p className="text-xs text-muted-foreground">Taxes are copied from the product&apos;s defaults.</p>
      </FieldGroup>
    </FormDialog>
  );
}
