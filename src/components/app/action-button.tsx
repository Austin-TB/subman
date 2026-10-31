"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionResult } from "@/lib/action";

/** Runs a server action when clicked and shows its result as a toast. For actions that need no confirmation. */
export function ActionButton({
  action,
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  action: () => Promise<ActionResult<unknown> | void>;
}) {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result && !result.ok) toast.error(result.error);
        else if (result?.message) toast.success(result.message);
      } catch (e) {
        // redirect() inside an action throws a special error that Next handles; rethrow it.
        if (e && typeof e === "object" && "digest" in e) throw e;
        toast.error("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <Button {...props} disabled={pending || disabled} onClick={run}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}
