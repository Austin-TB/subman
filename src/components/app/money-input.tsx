"use client";

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { CURRENCY, LOCALE } from "@/lib/money";

const symbol =
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? CURRENCY;

/**
 * A text input for amounts. The value is the string the user typed ("1200.50");
 * convert with parseMoney() in the Zod schema, never with parseFloat.
 */
export function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupInput>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>{symbol}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        className="tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        {...props}
      />
    </InputGroup>
  );
}
