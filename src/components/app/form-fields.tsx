"use client";

import { useId } from "react";
import Link from "next/link";
import { Controller, type Control, type ControllerFieldState, type FieldValues, type Path } from "react-hook-form";
import { MoneyInput } from "@/components/app/money-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Form controls wired to react-hook-form. A form's values are all strings (plus booleans and lists of ids);
// the Zod schema turns them into numbers and dates (see lib/schemas/fields.ts).

// A form's context and parsed-output types don't matter to a field, only the shape of its values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyControl<T extends FieldValues> = Control<T, any, any>;

type BaseProps<T extends FieldValues> = {
  control: AnyControl<T>;
  name: Path<T>;
  label: string;
  description?: React.ReactNode;
  className?: string;
  /** For the label, e.g. "sm:sr-only" when a column header already names the field. */
  labelClassName?: string;
};

export type Option = { value: string; label: React.ReactNode; disabled?: boolean };

/** Label, control, then the error (or, when there is none, the description). */
function Shell({
  id,
  label,
  labelClassName,
  description,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  labelClassName?: string;
  description?: React.ReactNode;
  error: ControllerFieldState["error"];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
      </FieldLabel>
      {children}
      {error ? <FieldError errors={[error]} /> : description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

type InputProps = Omit<
  React.ComponentProps<typeof Input>,
  "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "ref" | "id"
>;

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  labelClassName,
  ...input
}: BaseProps<T> & InputProps) {
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Shell
          id={id}
          label={label}
          labelClassName={labelClassName}
          description={description}
          error={fieldState.error}
          className={className}
        >
          <Input {...field} {...input} id={id} value={field.value ?? ""} aria-invalid={fieldState.invalid} />
        </Shell>
      )}
    />
  );
}

/** A native date picker. The form value is "YYYY-MM-DD" (or "" for none). */
export function DateField<T extends FieldValues>(props: BaseProps<T> & InputProps) {
  return <TextField {...props} type="date" />;
}

/** An amount like 1,200.50. The form value is the text typed; the schema reads it as minor units. */
export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  labelClassName,
  placeholder,
  disabled,
}: BaseProps<T> & { placeholder?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Shell
          id={id}
          label={label}
          labelClassName={labelClassName}
          description={description}
          error={fieldState.error}
          className={className}
        >
          <MoneyInput
            id={id}
            name={field.name}
            ref={field.ref}
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
          />
        </Shell>
      )}
    />
  );
}

/** Digits only (or digits and one decimal point), kept as text so an empty box stays empty. */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  labelClassName,
  decimal = false,
  suffix,
  ...input
}: BaseProps<T> & InputProps & { decimal?: boolean; suffix?: string }) {
  const id = useId();
  const clean = (v: string) => v.replace(decimal ? /[^\d.]/g : /\D/g, "");
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const shared = {
          ...field,
          ...input,
          id,
          value: field.value ?? "",
          inputMode: decimal ? ("decimal" as const) : ("numeric" as const),
          autoComplete: "off",
          className: "tabular-nums",
          "aria-invalid": fieldState.invalid,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.onChange(clean(e.target.value)),
        };
        return (
          <Shell
            id={id}
            label={label}
            labelClassName={labelClassName}
            description={description}
            error={fieldState.error}
            className={className}
          >
            {suffix ? (
              <InputGroup>
                <InputGroupInput {...shared} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{suffix}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            ) : (
              <Input {...shared} />
            )}
          </Shell>
        );
      }}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  labelClassName,
  ...input
}: BaseProps<T> & Omit<React.ComponentProps<typeof Textarea>, "name" | "value" | "onChange" | "onBlur" | "ref" | "id">) {
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Shell
          id={id}
          label={label}
          labelClassName={labelClassName}
          description={description}
          error={fieldState.error}
          className={className}
        >
          <Textarea {...field} {...input} id={id} value={field.value ?? ""} aria-invalid={fieldState.invalid} />
        </Shell>
      )}
    />
  );
}

// Radix Select can't have an item with an empty value, so "nothing chosen" is stood in for by this.
const NONE = "__none__";

/** Pick one. With `emptyLabel`, the first choice is "nothing" and the form value is "". */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  labelClassName,
  options,
  placeholder = "Select…",
  emptyLabel,
  disabled,
  onValueChange,
}: BaseProps<T> & {
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  /** Called with the new value after the form has taken it, e.g. to reset a dependent field. */
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Shell
          id={id}
          label={label}
          labelClassName={labelClassName}
          description={description}
          error={fieldState.error}
          className={className}
        >
          <Select
            value={field.value || (emptyLabel ? NONE : "")}
            onValueChange={(v) => {
              const value = v === NONE ? "" : v;
              field.onChange(value);
              onValueChange?.(value);
            }}
            disabled={disabled}
          >
            <SelectTrigger
              id={id}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              className="w-full"
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Shell>
      )}
    />
  );
}

/** An on/off switch with its label and help text beside it. */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  disabled,
}: BaseProps<T> & { disabled?: boolean }) {
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Field orientation="horizontal" className={className}>
          <FieldContent>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
          </FieldContent>
          <Switch
            id={id}
            ref={field.ref}
            checked={!!field.value}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            disabled={disabled}
          />
        </Field>
      )}
    />
  );
}

/** Pick several. The form value is the list of chosen option values. */
export function CheckboxGroupField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
  emptyText = "Nothing to choose from yet.",
}: BaseProps<T> & { options: Option[]; emptyText?: React.ReactNode }) {
  const groupId = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const selected: string[] = field.value ?? [];
        const toggle = (value: string, on: boolean) =>
          field.onChange(on ? [...selected, value] : selected.filter((v) => v !== value));
        return (
          <FieldSet className={className}>
            <FieldLegend variant="label">{label}</FieldLegend>
            {description && <FieldDescription>{description}</FieldDescription>}
            {options.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              <div
                className="grid max-h-60 gap-2.5 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2"
                aria-invalid={fieldState.invalid}
              >
                {options.map((o) => {
                  const id = `${groupId}-${o.value}`;
                  return (
                    <Field key={o.value} orientation="horizontal" className="items-center">
                      <Checkbox
                        id={id}
                        checked={selected.includes(o.value)}
                        onCheckedChange={(checked) => toggle(o.value, checked === true)}
                        disabled={o.disabled}
                      />
                      <FieldLabel htmlFor={id} className="font-normal">
                        {o.label}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </div>
            )}
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </FieldSet>
        );
      }}
    />
  );
}

/** Save / Cancel buttons at the bottom of a page form. */
export function FormFooter({
  submitting,
  submitLabel = "Save",
  cancelHref,
}: {
  submitting: boolean;
  submitLabel?: string;
  cancelHref?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" disabled={submitting}>
        {submitting && <Spinner />}
        {submitLabel}
      </Button>
      {cancelHref && (
        <Button type="button" variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      )}
    </div>
  );
}
