"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import {
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
import { submitForm } from "@/lib/form";
import { planSchema, BILLING_PERIODS, type PlanData, type PlanInput } from "@/lib/schemas/catalog";
import { planSummary } from "@/lib/plans";
import { createPlan, updatePlan } from "./actions";

export type PlanProductOption = { id: string; name: string; isAddon: boolean; active: boolean };

// What "every N" counts, for the interval box.
const UNIT = { DAILY: "day(s)", WEEKLY: "week(s)", MONTHLY: "month(s)", YEARLY: "year(s)" } as const;

/** Create a plan, or edit one when `planId` is given. */
export function PlanForm({
  planId,
  values,
  products,
  lockProduct,
  lockBilling,
  readOnly,
}: {
  planId?: string;
  values: PlanInput;
  products: PlanProductOption[];
  /** Subscriptions or templates already use the plan, so it can't sell a different product. */
  lockProduct: boolean;
  /** Subscriptions already use the plan, so its billing cadence is fixed. */
  lockBilling: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const form = useForm<PlanInput, unknown, PlanData>({ resolver: zodResolver(planSchema), defaultValues: values });
  const period = useWatch({ control: form.control, name: "period" });
  const current = useWatch({ control: form.control });

  // The same one-line summary the plan list shows, so the admin sees what they're making.
  const preview = planSchema.safeParse(current);

  const onSubmit = form.handleSubmit(async () => {
    const input = form.getValues();
    const result = await submitForm(form, () => (planId ? updatePlan(planId, input) : createPlan(input)));
    if (!result?.ok) return;
    if (planId) {
      form.reset(input);
      router.refresh();
    } else {
      router.push(`/catalog/plans/${result.data!.id}`);
    }
  });

  const locked = "Locked: subscriptions already use this plan. Create a new plan to change this.";

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FormFieldset readOnly={readOnly}>
        <FieldGroup>
          <TextField control={form.control} name="name" label="Plan name" placeholder="Analytics Pro Monthly" autoComplete="off" />
          <SelectField
            control={form.control}
            name="productId"
            label="Product"
            placeholder="Choose the product this plan sells"
            options={products.map((p) => ({
              value: p.id,
              label: `${p.name}${p.isAddon ? " (add-on)" : ""}${p.active ? "" : " (inactive)"}`,
            }))}
            disabled={lockProduct}
            description={lockProduct ? locked : "A plan sells one product. Its price below is that product's price per unit."}
          />
          <MoneyField
            control={form.control}
            name="price"
            label="Price"
            description="Per unit, per billing period. A new price applies to subscriptions created from now on."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="period"
              label="Billing period"
              options={[...BILLING_PERIODS]}
              disabled={lockBilling}
            />
            <NumberField
              control={form.control}
              name="interval"
              label="Bill every"
              suffix={UNIT[period]}
              disabled={lockBilling}
              description={lockBilling ? locked : undefined}
            />
          </div>
          <NumberField
            control={form.control}
            name="minQuantity"
            label="Minimum quantity"
            description="The fewest units a subscription on this plan can have."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <DateField control={form.control} name="availableFrom" label="Available from" />
            <DateField
              control={form.control}
              name="availableUntil"
              label="Available until"
              description="Leave empty for no end date."
            />
          </div>
          <FieldGroup className="gap-4 rounded-lg border p-4">
            <SwitchField
              control={form.control}
              name="closable"
              label="Can be closed early"
              description="Staff and customers can close a subscription before it expires."
            />
            <SwitchField
              control={form.control}
              name="pausable"
              label="Can be paused"
              description="Billing stops while paused and restarts when the subscription resumes."
            />
            <SwitchField
              control={form.control}
              name="renewable"
              label="Can be renewed"
              description="Extends the expiry date by the original term."
            />
            <SwitchField
              control={form.control}
              name="autoClose"
              label="Closes on its own at expiry"
              description="The billing run closes the subscription once it expires. Otherwise billing just stops and it shows as expired."
            />
          </FieldGroup>
          {planId && (
            <SwitchField
              control={form.control}
              name="active"
              label="Active"
              description="Inactive plans can't be chosen for new subscriptions. Existing subscriptions are not affected."
            />
          )}
        </FieldGroup>
      </FormFieldset>

      {preview.success && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Preview:</span> {planSummary(preview.data)}
        </p>
      )}

      {!readOnly && (
        <FormFooter
          submitting={form.formState.isSubmitting}
          submitLabel={planId ? "Save changes" : "Create plan"}
          cancelHref="/catalog/plans"
        />
      )}
    </form>
  );
}
