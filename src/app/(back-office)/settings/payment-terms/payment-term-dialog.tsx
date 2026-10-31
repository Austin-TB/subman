"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog } from "@/components/app/form-dialog";
import { NumberField, TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { submitForm } from "@/lib/form";
import {
  paymentTermSchema,
  type PaymentTermData,
  type PaymentTermInput,
} from "@/lib/schemas/catalog";
import { createPaymentTerm, deletePaymentTerm, updatePaymentTerm } from "./actions";

export type PaymentTermRow = { id: string; name: string; dueDays: number };

const BLANK: PaymentTermInput = { name: "", dueDays: "30" };

const valuesOf = (t: PaymentTermRow): PaymentTermInput => ({ name: t.name, dueDays: String(t.dueDays) });

/** Add a payment term, or edit one when `term` is given. */
export function PaymentTermDialog({ term }: { term?: PaymentTermRow }) {
  const [open, setOpen] = useState(false);
  const form = useForm<PaymentTermInput, unknown, PaymentTermData>({
    resolver: zodResolver(paymentTermSchema),
    defaultValues: term ? valuesOf(term) : BLANK,
  });

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const result = await submitForm(form, () => (term ? updatePaymentTerm(term.id, values) : createPaymentTerm(values)));
    if (result?.ok) setOpen(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(term ? valuesOf(term) : BLANK);
      }}
      trigger={
        term ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            Add payment term
          </Button>
        )
      }
      title={term ? `Edit ${term.name}` : "Add a payment term"}
      description="How long a customer has to pay after the invoice date. Changing the days applies to invoices created from now on."
      submitLabel={term ? "Save changes" : "Add payment term"}
      submitting={form.formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Name" placeholder="Net 30" autoComplete="off" />
        <NumberField
          control={form.control}
          name="dueDays"
          label="Days to pay"
          suffix="days"
          description="0 means due the day the invoice is issued."
        />
      </FieldGroup>
    </FormDialog>
  );
}

export function PaymentTermRowActions({ term }: { term: PaymentTermRow & { inUse: boolean } }) {
  return (
    <div className="flex justify-end gap-2">
      <PaymentTermDialog term={term} />
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm" disabled={term.inUse} title={term.inUse ? "Used by subscriptions" : undefined}>
            Delete
          </Button>
        }
        title={`Delete ${term.name}?`}
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        action={() => deletePaymentTerm(term.id)}
      />
    </div>
  );
}
