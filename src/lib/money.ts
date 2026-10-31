// Money is always an integer number of minor units (paise/cents).
// Percentages are basis points: 18% = 1800.

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "INR";
export const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? "en-IN";

const currencyFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 120050 → "₹1,200.50" */
export function formatMoney(minor: number | bigint | null | undefined): string {
  return currencyFmt.format(Number(minor ?? 0) / 100);
}

/** 120050 → "1,200.50" (no currency symbol) */
export function formatAmount(minor: number | bigint | null | undefined): string {
  return plainFmt.format(Number(minor ?? 0) / 100);
}

/** 120050 → "1200.50", for form inputs */
export function toInputValue(minor: number | null | undefined): string {
  if (minor == null) return "";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * "1,200.5" → 120050. Returns null for anything that isn't a valid amount
 * with at most two decimals. Works on strings, so no float rounding.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[,\s]/g, "").trim();
  const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const value = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) return null;
  return m[1] ? -value : value;
}

/** Rounds a/b half-up (away from zero) using integers only. */
export function divRoundHalfUp(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero");
  const sign = Math.sign(a) * Math.sign(b);
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  return sign * Math.floor((2 * absA + absB) / (2 * absB));
}

/** Applies a basis-point rate to an amount, rounded half-up. 10000 × 1800 bps → 1800 */
export function applyBps(amount: number, bps: number): number {
  return divRoundHalfUp(amount * bps, 10_000);
}

/** 1800 → "18%", 1250 → "12.5%" */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString(LOCALE, { maximumFractionDigits: 2 })}%`;
}

/** 1800 → "18", 1250 → "12.5", for form inputs */
export function toPercentInput(bps: number | null | undefined): string {
  if (bps == null) return "";
  const frac = String(bps % 100).padStart(2, "0").replace(/0$/, "");
  return frac === "0" ? String(Math.floor(bps / 100)) : `${Math.floor(bps / 100)}.${frac}`;
}

/** "18" or "12.5" → basis points. Returns null if invalid. */
export function parsePercent(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(String(input).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
