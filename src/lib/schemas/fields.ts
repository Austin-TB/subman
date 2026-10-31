import { z } from "zod";
import { tryParseDate } from "@/lib/dates";
import { formatBps, parseMoney, parsePercent } from "@/lib/money";

// Form fields hold what the person typed, as strings. These helpers turn that text into what the
// database stores (minor units, basis points, whole numbers, dates), or say why they can't.
// The same schema runs in the form and again in the server action, so the rules can't drift apart.
// Use `z.input<typeof schema>` for the form's values and `z.output<typeof schema>` for the parsed result.

/** Prices live in a 32-bit column. */
export const MAX_MONEY = 1_000_000_000;
export const MAX_QUANTITY = 100_000;
export const MAX_PERCENT_BPS = 10_000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Reads trimmed text and returns the value, or the message to show. `what` is a noun phrase: "sales price". */
export type Read<T> = (raw: string) => { value: T } | { error: string };

export const readMoney =
  (what: string): Read<number> =>
  (raw) => {
    if (!raw) return { error: `Enter the ${what}` };
    const v = parseMoney(raw);
    if (v == null) return { error: `${cap(what)} must be a number, like 1200.50` };
    if (v < 0) return { error: `${cap(what)} can't be negative` };
    if (v > MAX_MONEY) return { error: `${cap(what)} is too large` };
    return { value: v };
  };

/** "18" or "12.5" → basis points. */
export const readPercent =
  (what: string, { min = 0, max = MAX_PERCENT_BPS }: { min?: number; max?: number } = {}): Read<number> =>
  (raw) => {
    if (!raw) return { error: `Enter the ${what}` };
    const v = parsePercent(raw);
    if (v == null) return { error: `${cap(what)} must be a percentage, like 18 or 12.5` };
    if (v < min) return { error: `${cap(what)} must be at least ${formatBps(min)}` };
    if (v > max) return { error: `${cap(what)} can be at most ${formatBps(max)}` };
    return { value: v };
  };

export const readInt =
  (what: string, min: number, max: number): Read<number> =>
  (raw) => {
    if (!raw) return { error: `Enter the ${what}` };
    if (!/^\d+$/.test(raw)) return { error: `${cap(what)} must be a whole number` };
    const v = Number(raw);
    if (v < min) return { error: `${cap(what)} must be at least ${min}` };
    if (v > max) return { error: `${cap(what)} can be at most ${max}` };
    return { value: v };
  };

export const readDate =
  (what: string): Read<Date> =>
  (raw) => {
    if (!raw) return { error: `Enter the ${what}` };
    const d = tryParseDate(raw);
    // A typo like 0202 parses fine but is never meant.
    if (!d || d.getUTCFullYear() < 1990 || d.getUTCFullYear() > 2100) return { error: `${cap(what)} isn't a valid date` };
    return { value: d };
  };

/** The value from a read that a check has already passed. Reaching the error branch means that check was skipped. */
export function unwrap<T>(result: { value: T } | { error: string }): T {
  if ("error" in result) throw new Error(result.error);
  return result.value;
}

/** Blank means "not set" (null); anything else must pass `read`. */
const optional =
  <T>(read: Read<T>): Read<T | null> =>
  (raw) =>
    raw ? read(raw) : { value: null };

/** A text input whose value is turned into something else by `read`. */
function parsed<T>(read: Read<T>) {
  return z.string({ error: "This field is required" }).transform((raw, ctx) => {
    const result = read(raw.trim());
    if ("error" in result) {
      ctx.issues.push({ code: "custom", message: result.error, input: raw });
      return z.NEVER;
    }
    return result.value;
  });
}

export const money = (what: string) => parsed(readMoney(what));
export const optionalMoney = (what: string) => parsed(optional(readMoney(what)));
export const int = (what: string, min = 0, max = MAX_QUANTITY) => parsed(readInt(what, min, max));
export const optionalInt = (what: string, min = 1, max = MAX_QUANTITY) => parsed(optional(readInt(what, min, max)));
export const date = (what: string) => parsed(readDate(what));
export const optionalDate = (what: string) => parsed(optional(readDate(what)));

export const text = (what: string, max = 100) =>
  z
    .string({ error: `Enter the ${what}` })
    .trim()
    .min(1, `Enter the ${what}`)
    .max(max, `Use at most ${max} characters`);

/** Free text that may be left blank (stored as null). */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((s) => s || null);

/** `what` includes its article: requiredId("a plan") → "Choose a plan". */
export const requiredId = (what: string) => z.string({ error: `Choose ${what}` }).min(1, `Choose ${what}`);
export const optionalId = z.string().transform((s) => s || null);
