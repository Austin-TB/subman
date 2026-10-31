// Turns "before" and "after" versions of a record into a short list of what changed, for the activity log.

/** A field's label, or its label with a formatter so values show up: ["price", formatMoney]. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Field = string | [label: string, format: (value: any) => string];

function normalize(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  return v ?? null;
}

/** ["price ₹1,200.00 → ₹1,500.00", "name"], in the order of `fields`. Fields that are unchanged are left out. */
export function describeChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: { [K in keyof T]?: Field },
): string[] {
  const changes: string[] = [];
  for (const key of Object.keys(fields) as (keyof T)[]) {
    if (normalize(before[key]) === normalize(after[key])) continue;
    const field = fields[key]!;
    if (typeof field === "string") changes.push(field);
    else {
      const [label, format] = field;
      changes.push(`${label} ${format(before[key])} → ${format(after[key])}`);
    }
  }
  return changes;
}
