"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { FormDialog } from "@/components/app/form-dialog";
import { MoneyField, NumberField, SelectField, SwitchField, TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { submitForm } from "@/lib/form";
import { toInputValue, toPercentInput } from "@/lib/money";
import { TAX_KINDS, taxSchema, type TaxData, type TaxInput } from "@/lib/schemas/catalog";
import { createTax, updateTax } from "./actions";

export type TaxRow = { id: string; name: string; kind: "PERCENT" | "FIXED"; rate: number; active: boolean };

const BLANK: TaxInput = { name: "", kind: "PERCENT", rate: "", active: true };

const valuesOf = (t: TaxRow): TaxInput => ({
  name: t.name,
  kind: t.kind,
  rate: t.kind === "PERCENT" ? toPercentInput(t.rate) : toInputValue(t.rate),
  active: t.active,
});

/** Add a tax, or edit one when `tax` is given. */
export function TaxDialog({ tax }: { tax?: TaxRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<TaxInput, unknown, TaxData>({
    resolver: zodResolver(taxSchema),
    defaultValues: tax ? valuesOf(tax) : BLANK,
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const result = await submitForm(form, () => (tax ? updateTax(tax.id, values) : createTax(values)));
    if (result?.ok) setOpen(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(tax ? valuesOf(tax) : BLANK); // start from what's saved, not from an abandoned edit
      }}
      trigger={
        tax ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            Add tax
          </Button>
        )
      }
      title={tax ? `Edit ${tax.name}` : "Add a tax"}
      description={
        tax
          ? "A new rate applies to invoices created from now on. Invoices already issued keep the rate they were issued with."
          : "Make it a default tax on a product to have it charged on that product's invoice lines."
      }
      submitLabel={tax ? "Save changes" : "Add tax"}
      submitting={form.formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Name" placeholder="GST 18%" autoComplete="off" />
        <SelectField control={form.control} name="kind" label="Type" options={[...TAX_KINDS]} />
        {kind === "PERCENT" ? (
          <NumberField control={form.control} name="rate" label="Rate" decimal suffix="%" placeholder="18" />
        ) : (
          <MoneyField
            control={form.control}
            name="rate"
            label="Amount per unit"
            description="Charged once for every unit on the line."
          />
        )}
        {tax && (
          <SwitchField
            control={form.control}
            name="active"
            label="Active"
            description="Inactive taxes can't be picked for new products. Records that already use one keep it."
          />
        )}
      </FieldGroup>
    </FormDialog>
  );
}
