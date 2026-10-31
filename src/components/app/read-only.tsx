import { LockIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Keep disabled controls at full strength. Radix puts an invisible (aria-hidden) input beside each
// checkbox and switch, which must stay invisible; input groups dim their whole box when an input inside is disabled.
const READ_ONLY_LOOK =
  "[&_:disabled:not([aria-hidden=true])]:opacity-100! [&_[data-slot=input-group]]:opacity-100!";

/**
 * Wraps a form's fields. With `readOnly`, every control inside is disabled (a disabled fieldset does that)
 * but stays at full strength, so staff can read the values instead of squinting at greyed-out boxes.
 */
export function FormFieldset({
  readOnly,
  className,
  children,
}: {
  readOnly: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      disabled={readOnly}
      className={cn("m-0 min-w-0 border-0 p-0", readOnly && READ_ONLY_LOOK, className)}
    >
      {children}
    </fieldset>
  );
}

export function ReadOnlyNotice({ children }: { children?: React.ReactNode }) {
  return (
    <Alert>
      <LockIcon />
      <AlertTitle>View only</AlertTitle>
      <AlertDescription>{children ?? "Only an admin can change this. Ask an admin if something needs updating."}</AlertDescription>
    </Alert>
  );
}
