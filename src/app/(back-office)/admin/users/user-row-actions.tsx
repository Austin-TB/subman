"use client";

import { ActionButton } from "@/components/app/action-button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { resendSetPasswordLink, setUserActive } from "./actions";

export function UserRowActions({
  user,
}: {
  user: { id: string; name: string; active: boolean; pending: boolean; isSelf: boolean };
}) {
  if (user.isSelf) return <span className="text-xs text-muted-foreground">You</span>;

  return (
    <div className="flex justify-end gap-2">
      {user.pending && user.active && (
        <ActionButton variant="outline" size="sm" action={() => resendSetPasswordLink(user.id)}>
          Resend link
        </ActionButton>
      )}
      {user.active ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              Deactivate
            </Button>
          }
          title={`Deactivate ${user.name}?`}
          description="They will be signed out now and can't log in until you reactivate them."
          confirmLabel="Deactivate"
          destructive
          action={() => setUserActive(user.id, false)}
        />
      ) : (
        <ActionButton variant="outline" size="sm" action={() => setUserActive(user.id, true)}>
          Reactivate
        </ActionButton>
      )}
    </div>
  );
}
