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
