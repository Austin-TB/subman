import { CheckIcon, CircleIcon, XIcon } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/schemas/auth";
import { cn } from "@/lib/utils";

/**
 * Live checklist of the password rules. Unmet rules turn red once `showErrors` is set,
 * which forms do after a failed submit.
 */
export function PasswordRequirements({ value, showErrors = false }: { value: string; showErrors?: boolean }) {
  return (
    <ul className="grid gap-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        const Icon = met ? CheckIcon : showErrors ? XIcon : CircleIcon;
        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5 text-muted-foreground",
              met && "text-emerald-700 dark:text-emerald-400",
              !met && showErrors && "text-destructive",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
