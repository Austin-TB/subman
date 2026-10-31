import type { ZodError } from "zod";

// Shape every server action returns, so forms and buttons can show a toast or field errors.
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export const ok = <T = undefined>(message?: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
export const fail = (error: string, fieldErrors?: Record<string, string[] | undefined>): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});

/** Zod issues keyed by field path ("lines.0.quantity"), which is what react-hook-form's setError wants. */
export function fieldErrorsOf(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[issue.path.join(".")] ??= []).push(issue.message);
  return out;
}

/** The failed result for a Zod error. An issue that belongs to no field (an empty path) becomes the summary line. */
export function invalid(error: ZodError): ActionResult<never> {
  const { "": general, ...fieldErrors } = fieldErrorsOf(error);
  return fail(general?.[0] ?? "Check the highlighted fields.", fieldErrors);
}
