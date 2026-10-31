import { z } from "zod";
import { optionalText, text } from "@/lib/schemas/fields";

// Customer details (PLAN.md Phase 3). A customer's email is where quotations and invoices go; it is not
// unique, because one company can have several contacts and the portal login (a User) has its own email.

export const customerSchema = z.object({
  name: text("customer name"),
  company: optionalText(100),
  email: z
    .string({ error: "Enter the email address" })
    .trim()
    .min(1, "Enter the email address")
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  phone: optionalText(30),
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  city: optionalText(60),
  state: optionalText(60),
  postalCode: optionalText(20),
  country: optionalText(60),
  taxId: optionalText(40),
});

export type CustomerInput = z.input<typeof customerSchema>;
export type CustomerData = z.output<typeof customerSchema>;

export const BLANK_CUSTOMER: CustomerInput = {
  name: "",
  company: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  taxId: "",
};

/** The address as lines for display, leaving out whatever is blank: ["12 MG Road", "Bengaluru, Karnataka 560001", "India"]. */
export function addressLines(c: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string[] {
  const cityLine = [[c.city, c.state].filter(Boolean).join(", "), c.postalCode].filter(Boolean).join(" ");
  return [c.addressLine1, c.addressLine2, cityLine, c.country].filter((l): l is string => !!l);
}
