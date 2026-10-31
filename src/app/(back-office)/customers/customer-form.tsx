"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { FormFooter, TextField } from "@/components/app/form-fields";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { submitForm } from "@/lib/form";
import { customerSchema, type CustomerData, type CustomerInput } from "@/lib/schemas/customers";
import { createCustomer, updateCustomer } from "./actions";

/** Add a customer, or edit one when `customerId` is given. */
export function CustomerForm({ customerId, values }: { customerId?: string; values: CustomerInput }) {
  const router = useRouter();
  const form = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerSchema),
    defaultValues: values,
  });

  const onSubmit = form.handleSubmit(async () => {
    const input = form.getValues();
    const result = await submitForm(form, () => (customerId ? updateCustomer(customerId, input) : createCustomer(input)));
    if (!result?.ok) return;
    router.push(`/customers/${result.data!.id}`);
  });

  const c = form.control;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Contact</FieldLegend>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField control={c} name="name" label="Contact name" placeholder="Priya Nair" autoComplete="off" />
            <TextField control={c} name="company" label="Company" placeholder="Acme Retail Pvt Ltd" autoComplete="off" />
            <TextField
              control={c}
              name="email"
              type="email"
              label="Email"
              placeholder="priya@acme.example"
              autoComplete="off"
              description="Quotations and invoices are sent here."
            />
            <TextField control={c} name="phone" type="tel" label="Phone" placeholder="+91 98765 43210" autoComplete="off" />
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Billing address</FieldLegend>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField control={c} name="addressLine1" label="Address line 1" autoComplete="off" className="sm:col-span-2" />
            <TextField control={c} name="addressLine2" label="Address line 2" autoComplete="off" className="sm:col-span-2" />
            <TextField control={c} name="city" label="City" autoComplete="off" />
            <TextField control={c} name="state" label="State" autoComplete="off" />
            <TextField control={c} name="postalCode" label="Postal code" autoComplete="off" />
            <TextField control={c} name="country" label="Country" autoComplete="off" />
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Tax</FieldLegend>
          <TextField
            control={c}
            name="taxId"
            label="Tax ID"
            placeholder="29ABCDE1234F1Z5"
            autoComplete="off"
            description="Printed on the customer's invoices, for example a GSTIN."
            className="sm:max-w-sm"
          />
        </FieldSet>
      </FieldGroup>

      <FormFooter
        submitting={form.formState.isSubmitting}
        submitLabel={customerId ? "Save changes" : "Add customer"}
        cancelHref={customerId ? `/customers/${customerId}` : "/customers"}
      />
    </form>
  );
}
