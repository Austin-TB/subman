import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/**
 * Runs a server action for a react-hook-form form (client side only).
 * Errors the server found are put on the matching fields, and the summary is toasted as well,
 * because on a long form the field at fault can be off screen. A success message is toasted.
 * Returns the result, or null if the call itself failed.
 */
export async function submitForm<T extends FieldValues, R = undefined>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<T, any, any>,
  action: () => Promise<ActionResult<R>>,
): Promise<ActionResult<R> | null> {
  let result: ActionResult<R>;
  try {
    result = await action();
  } catch (e) {
    // redirect() inside an action throws a special error that Next handles; rethrow it.
    if (e && typeof e === "object" && "digest" in e) throw e;
    toast.error("Something went wrong. Please try again.");
    return null;
  }

  if (!result.ok) {
    for (const [name, messages] of Object.entries(result.fieldErrors ?? {})) {
      if (messages?.[0]) form.setError(name as Path<T>, { message: messages[0] });
    }
    toast.error(result.error);
    return result;
  }

  if (result.message) toast.success(result.message);
  return result;
}
