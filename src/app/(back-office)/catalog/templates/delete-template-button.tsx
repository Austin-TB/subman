"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteTemplate } from "./actions";

export function DeleteTemplateButton({ template }: { template: { id: string; name: string } }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Delete</Button>}
      title={`Delete ${template.name}?`}
      description="Subscriptions already made from it keep their own lines and are not affected. This can't be undone."
      confirmLabel="Delete"
      destructive
      action={async () => {
        const result = await deleteTemplate(template.id);
        if (result.ok) router.replace("/catalog/templates");
        return result;
      }}
    />
  );
}
