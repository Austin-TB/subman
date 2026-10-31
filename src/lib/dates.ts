// Business dates are date-only. In JS they are Date objects at UTC midnight,
// which is exactly what Prisma reads and writes for @db.Date columns.
// "Today" is taken in the business timezone (APP_TZ).

export type Period = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const APP_TZ = process.env.APP_TZ ?? "Asia/Kolkata";
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? "en-IN";

const DAY_MS = 86_400_000;

/** "2026-10-31" → Date at 2026-10-31T00:00:00Z. Throws on invalid input. */
export function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (toISODate(d) !== iso) throw new Error(`Invalid date: ${iso}`);
  return d;
}

/** Like parseDate but returns null instead of throwing. */
export function tryParseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

/** Date → "2026-10-31" (reads the UTC parts). */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the business timezone, as a UTC-midnight Date. */
export function businessToday(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseDate(iso);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * Adds months, clamping to the end of shorter months.
 * The day always comes from `anchor`, so Jan 31 + 1 → Feb 28 and Jan 31 + 2 → Mar 31.
 */
export function addMonthsClamped(anchor: Date, months: number): Date {
  const total = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month0 = total - year * 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, month0));
  return new Date(Date.UTC(year, month0, day));
}

/** Start of billing period k (0-based) for a subscription that started on `start`. */
export function periodStart(start: Date, period: Period, interval: number, k: number): Date {
  const n = k * interval;
  switch (period) {
    case "DAILY":
      return addDays(start, n);
    case "WEEKLY":
      return addDays(start, n * 7);
    case "MONTHLY":
      return addMonthsClamped(start, n);
    case "YEARLY":
      return addMonthsClamped(start, n * 12);
  }
}

/** One period after `from`, used for simple "next date" math (e.g. default expiry). */
export function addPeriod(from: Date, period: Period, interval = 1): Date {
  return periodStart(from, period, interval, 1);
}

/** Number of periods per year, for MRR/ARR. */
export function periodsPerYear(period: Period, interval: number): number {
  switch (period) {
    case "DAILY":
      return 365 / interval;
    case "WEEKLY":
      return 52 / interval;
    case "MONTHLY":
      return 12 / interval;
    case "YEARLY":
      return 1 / interval;
  }
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Business date (UTC midnight) → "31 Oct 2026" */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** Timestamp → "31 Oct 2026, 2:30 pm" in the business timezone */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTimeFmt.format(typeof d === "string" ? new Date(d) : d);
}

const PERIOD_LABEL: Record<Period, [string, string]> = {
  DAILY: ["day", "days"],
  WEEKLY: ["week", "weeks"],
  MONTHLY: ["month", "months"],
  YEARLY: ["year", "years"],
};

/** ("MONTHLY", 1) → "month", ("MONTHLY", 3) → "3 months" */
export function formatPeriod(period: Period, interval = 1): string {
  const [one, many] = PERIOD_LABEL[period];
  return interval === 1 ? one : `${interval} ${many}`;
}
