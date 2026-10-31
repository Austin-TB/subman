"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { DateField, FormFooter, MoneyField, NumberField, SelectField } from "@/components/app/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { defaultUnitPrice } from "@/lib/billing/pricing";
import { calcTotals } from "@/lib/billing/totals";
import type { ProductOption, TaxOption } from "@/lib/catalog-data";
import { addMonthsClamped, tryParseDate, toISODate } from "@/lib/dates";
import { submitForm } from "@/lib/form";
import { formatMoney, parseMoney, toInputValue } from "@/lib/money";
import { isPlanAvailableOn } from "@/lib/plans";
import { MAX_SUBSCRIPTION_LINES, subscriptionSchema, type SubscriptionData, type SubscriptionInput } from "@/lib/schemas/subscriptions";
import { saveSubscription } from "./actions";

export type FormPlan = {
  id: string;
  name: string;
  productId: string;
  price: number;
  minQuantity: number;
  availableFrom: string;
  availableUntil: string | null;
  summary: string;
};

type FormControl = Control<SubscriptionInput, unknown, SubscriptionData>;

const ROW = "grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_5rem_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_2rem] lg:items-start";
const HIDE = "lg:sr-only";

const qty = (raw?: string) => (/^\d+$/.test(raw?.trim() ?? "") ? Number(raw) : 0);
const price = (raw?: string) => parseMoney(raw ?? "") ?? 0;

export function SubscriptionForm({
  subscriptionId,
  values,
  customers,
  plans,
  paymentTerms,
  products,
  taxes,
}: {
  subscriptionId?: string;
  values: SubscriptionInput;
  customers: { id: string; label: string }[];
  plans: FormPlan[];
  paymentTerms: { id: string; name: string }[];
  products: ProductOption[];
  taxes: TaxOption[];
}) {
  const router = useRouter();
  const form = useForm<SubscriptionInput, unknown, SubscriptionData>({ resolver: zodResolver(subscriptionSchema), defaultValues: values });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const current = useWatch({ control: form.control });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const taxById = useMemo(() => new Map(taxes.map((t) => [t.id, t])), [taxes]);
  const start = tryParseDate(current.startDate);
  const offered = plans.filter((p) => p.id === current.planId || !start || isPlanAvailableOn({ active: true, availableFrom: new Date(p.availableFrom), availableUntil: p.availableUntil ? new Date(p.availableUntil) : null }, start));
  const plan = plans.find((p) => p.id === current.planId);
  const planProduct = plan && productById.get(plan.productId);
  const activeTaxes = (ids: string[]) => ids.filter((id) => taxById.get(id)?.active);

  const totals = calcTotals(
    [current.planLine, ...(current.lines ?? [])].filter(Boolean).map((l) => ({
      quantity: qty(l?.quantity),
      unitPrice: price(l?.unitPrice),
      taxes: (l?.taxIds ?? []).flatMap((id) => {
        const t = taxById.get(id ?? "");
        return t ? [{ name: t.name, kind: t.kind, rate: t.value }] : [];
      }),
    })),
  );

  function onPlanChange(planId: string) {
    const next = plans.find((p) => p.id === planId);
    if (!next) return;
    const product = productById.get(next.productId);
    form.setValue("planLine.variantId", "");
    form.setValue("planLine.unitPrice", toInputValue(next.price));
    form.setValue("planLine.taxIds", activeTaxes(product?.taxIds ?? []));
    if (qty(form.getValues("planLine.quantity")) < next.minQuantity) form.setValue("planLine.quantity", String(next.minQuantity));
  }

  function onStartChange(iso: string) {
    const prev = tryParseDate(form.getValues("startDate"));
    const next = tryParseDate(iso);
    const expiry = form.getValues("expiryDate");
    // Keep the expiry one year on while it still has its default.
    if (next && (!expiry || (prev && expiry === toISODate(addMonthsClamped(prev, 12))))) {
      form.setValue("expiryDate", toISODate(addMonthsClamped(next, 12)));
    }
  }

  /** Product or variant changed: reprice from the catalog, and default the taxes for a new product. */
  function reprice(path: "planLine" | `lines.${number}`, productId: string, variantId: string, isPlanLine: boolean, newProduct: boolean) {
    const product = productById.get(productId);
    const extra = product?.variants.find((v) => v.id === variantId)?.extraPrice;
    form.setValue(`${path}.unitPrice`, toInputValue(defaultUnitPrice({ isPlanLine, planPrice: plan?.price ?? 0, productPrice: product?.salesPrice ?? 0, variantExtra: extra })));
    if (newProduct) {
      form.setValue(`${path}.variantId`, "");
      form.setValue(`${path}.taxIds`, activeTaxes(product?.taxIds ?? []));
    }
  }

  const onSubmit = form.handleSubmit(async () => {
    const input = form.getValues();
    const result = await submitForm(form, () => saveSubscription(subscriptionId ?? null, input));
    if (!result?.ok) return;
    if (subscriptionId) {
      form.reset(input);
      router.refresh();
    } else router.push(`/subscriptions/${result.data!.id}`);
  });

  const variantOptions = (p?: ProductOption) => (p?.variants ?? []).map((v) => ({ value: v.id, label: `${v.label} (+${formatMoney(v.extraPrice)})` }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Controller
                control={form.control}
                name="customerId"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="customer">Customer</FieldLabel>
                    <select
                      id="customer"
                      {...field}
                      className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm aria-invalid:border-destructive"
                      aria-invalid={fieldState.invalid}
                    >
                      <option value="">Choose a customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {fieldState.error && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <SelectField
                control={form.control}
                name="planId"
                label="Plan"
                placeholder="Choose a plan"
                options={offered.map((p) => ({ value: p.id, label: p.name }))}
                onValueChange={onPlanChange}
                description={plan?.summary ?? "Only plans available on the start date are offered."}
              />
              <SelectField
                control={form.control}
                name="paymentTermId"
                label="Payment terms"
                placeholder="Choose payment terms"
                options={paymentTerms.map((t) => ({ value: t.id, label: t.name }))}
              />
              <div onChange={(e) => (e.target as HTMLInputElement).name === "startDate" && onStartChange((e.target as HTMLInputElement).value)}>
                <DateField control={form.control} name="startDate" label="Start date" />
              </div>
              <DateField control={form.control} name="expiryDate" label="Expiry date" description="Leave empty for no expiry." />
              <NumberField control={form.control} name="validityDays" label="Quotation valid for" suffix="days" />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className={`${ROW} hidden text-xs font-medium text-muted-foreground lg:grid`} aria-hidden>
            <span>Product</span>
            <span>Variant</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Taxes</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          <div className={`${ROW} rounded-lg border p-3 lg:border-0 lg:p-0`}>
            <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
              <LockIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{planProduct?.name ?? "Choose a plan first"}</span>
              <Badge variant="secondary" className="ml-auto">
                Plan
              </Badge>
            </div>
            <SelectField
              control={form.control}
              name="planLine.variantId"
              label="Variant"
              labelClassName={HIDE}
              emptyLabel="No variant"
              options={variantOptions(planProduct)}
              onValueChange={(v) => plan && reprice("planLine", plan.productId, v, true, false)}
            />
            <NumberField
              control={form.control}
              name="planLine.quantity"
              label="Quantity"
              labelClassName={HIDE}
              description={plan && plan.minQuantity > 1 ? `Min ${plan.minQuantity}` : undefined}
            />
            <MoneyField control={form.control} name="planLine.unitPrice" label="Unit price" labelClassName={HIDE} />
            <TaxesField control={form.control} name="planLine.taxIds" taxes={taxes} />
            <Amount value={totals.lines[0]?.amount ?? 0} />
            <span />
          </div>

          {fields.map((f, index) => (
            <ExtraLine
              key={f.id}
              index={index}
              control={form.control}
              products={products}
              taxes={taxes}
              amount={totals.lines[index + 1]?.amount ?? 0}
              variantOptions={variantOptions}
              onProduct={(id) => reprice(`lines.${index}`, id, "", false, true)}
              onVariant={(id, v) => reprice(`lines.${index}`, id, v, false, false)}
              onRemove={() => remove(index)}
            />
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fields.length >= MAX_SUBSCRIPTION_LINES}
              onClick={() => append({ productId: "", variantId: "", quantity: "1", unitPrice: "", taxIds: [] })}
            >
              <PlusIcon />
              Add line
            </Button>
          </div>

          <Totals totals={totals} />
        </CardContent>
      </Card>

      <FormFooter
        submitting={form.formState.isSubmitting}
        submitLabel={subscriptionId ? "Save draft" : "Create draft"}
        cancelHref={subscriptionId ? undefined : "/subscriptions"}
      />
    </form>
  );
}

function ExtraLine({
  index,
  control,
  products,
  taxes,
  amount,
  variantOptions,
  onProduct,
  onVariant,
  onRemove,
}: {
  index: number;
  control: FormControl;
  products: ProductOption[];
  taxes: TaxOption[];
  amount: number;
  variantOptions: (p?: ProductOption) => { value: string; label: string }[];
  onProduct: (productId: string) => void;
  onVariant: (productId: string, variantId: string) => void;
  onRemove: () => void;
}) {
  const productId = useWatch({ control, name: `lines.${index}.productId` });
  const product = products.find((p) => p.id === productId);
  return (
    <div className={`${ROW} rounded-lg border p-3 lg:border-0 lg:p-0`}>
      <SelectField
        control={control}
        name={`lines.${index}.productId`}
        label="Product"
        labelClassName={HIDE}
        placeholder="Choose a product"
        options={products.map((p) => ({ value: p.id, label: `${p.name}${p.isAddon ? " (add-on)" : ""}` }))}
        onValueChange={onProduct}
      />
      <SelectField
        control={control}
        name={`lines.${index}.variantId`}
        label="Variant"
        labelClassName={HIDE}
        emptyLabel="No variant"
        options={variantOptions(product)}
        disabled={!product || product.variants.length === 0}
        onValueChange={(v) => productId && onVariant(productId, v)}
      />
      <NumberField control={control} name={`lines.${index}.quantity`} label="Quantity" labelClassName={HIDE} />
      <MoneyField control={control} name={`lines.${index}.unitPrice`} label="Unit price" labelClassName={HIDE} />
      <TaxesField control={control} name={`lines.${index}.taxIds`} taxes={taxes} />
      <Amount value={amount} />
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove line ${index + 2}`}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

function Amount({ value }: { value: number }) {
  return (
    <div className="flex h-8 items-center justify-between text-sm tabular-nums lg:justify-end">
      <span className="text-muted-foreground lg:hidden">Amount</span>
      {formatMoney(value)}
    </div>
  );
}

/** Pick the taxes on a line. The form value is the list of tax ids. */
export function TaxesField({ control, name, taxes }: { control: FormControl; name: "planLine.taxIds" | `lines.${number}.taxIds`; taxes: TaxOption[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = field.value ?? [];
        const label = taxes.filter((t) => selected.includes(t.id)).map((t) => t.name).join(", ") || "No tax";
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel className={HIDE}>Taxes</FieldLabel>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-start truncate font-normal">
                  <span className="truncate">{label}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="grid w-56 gap-2">
                {taxes.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(t.id)}
                      onCheckedChange={(on) => field.onChange(on ? [...selected, t.id] : selected.filter((id) => id !== t.id))}
                    />
                    {t.name}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}

export function Totals({ totals }: { totals: ReturnType<typeof calcTotals> }) {
  return (
    <div className="ml-auto grid w-full max-w-xs gap-1 rounded-lg bg-muted/50 p-3 text-sm tabular-nums">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Untaxed</span>
        {formatMoney(totals.untaxed)}
      </div>
      {totals.taxBreakdown.map((t) => (
        <div key={t.name} className="flex justify-between">
          <span className="text-muted-foreground">{t.name}</span>
          {formatMoney(t.amount)}
        </div>
      ))}
      <div className="flex justify-between border-t pt-1 font-medium">
        <span>Total per period</span>
        {formatMoney(totals.total)}
      </div>
    </div>
  );
}
