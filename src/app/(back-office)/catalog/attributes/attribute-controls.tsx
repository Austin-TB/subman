"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormDialog } from "@/components/app/form-dialog";
import { TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { submitForm } from "@/lib/form";
import { attributeSchema, type AttributeInput } from "@/lib/schemas/catalog";
import { addAttributeValues, createAttribute, deleteAttribute, deleteAttributeValue, renameAttribute } from "./actions";

/** Add an attribute, or rename one when `attribute` is given. */
export function AttributeDialog({ attribute }: { attribute?: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const form = useForm<AttributeInput, unknown, AttributeInput>({
    resolver: zodResolver(attributeSchema),
    defaultValues: { name: attribute?.name ?? "" },
  });

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const result = await submitForm(form, () => (attribute ? renameAttribute(attribute.id, values) : createAttribute(values)));
    if (result?.ok) setOpen(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset({ name: attribute?.name ?? "" });
      }}
      trigger={
        attribute ? (
          <Button variant="outline" size="sm">
            Rename
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            Add attribute
          </Button>
        )
      }
      title={attribute ? `Rename ${attribute.name}` : "Add an attribute"}
      description={
        attribute
          ? "Products that use it show the new name straight away."
          : "Something a product comes in a choice of, like Brand or Edition. You add its values next."
      }
      submitLabel={attribute ? "Save" : "Add attribute"}
      submitting={form.formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Name" placeholder="Brand" autoComplete="off" />
      </FieldGroup>
    </FormDialog>
  );
}

export function DeleteAttributeButton({ attribute }: { attribute: { id: string; name: string; used: boolean } }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" disabled={attribute.used} title={attribute.used ? "Used by product variants" : undefined}>
          Delete
        </Button>
      }
      title={`Delete ${attribute.name}?`}
      description="Its values are deleted with it. This can't be undone."
      confirmLabel="Delete"
      destructive
      action={() => deleteAttribute(attribute.id)}
    />
  );
}

/** A value of an attribute. An admin can remove it while no product variant uses it. */
export function ValueChip({ value, canEdit }: { value: { id: string; name: string; used: number }; canEdit: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-sm"
      title={value.used ? `Used by ${value.used} product variant${value.used === 1 ? "" : "s"}` : undefined}
    >
      {value.name}
      {value.used > 0 && <span className="text-xs text-muted-foreground tabular-nums">{value.used}</span>}
      {canEdit && (
        <ConfirmDialog
          trigger={
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label={`Remove ${value.name}`}
              disabled={value.used > 0}
            >
              <XIcon className="size-3.5" />
            </button>
          }
          title={`Remove ${value.name}?`}
          description="It will no longer be offered when adding a variant to a product."
          confirmLabel="Remove"
          destructive
          action={() => deleteAttributeValue(value.id)}
        />
      )}
    </span>
  );
}

/** One box for several values, separated by commas: "Odoo, SAP, Zoho". */
export function AddValuesForm({ attributeId, attributeName }: { attributeId: string; attributeName: string }) {
  const [names, setNames] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await addAttributeValues(attributeId, { names });
        if (!result.ok) {
          setError(result.fieldErrors?.names?.[0] ?? result.error);
          return;
        }
        setError(null);
        setNames("");
        if (result.message) toast.success(result.message);
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-1.5">
      <div className="flex gap-2">
        <Input
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder="Add values, e.g. Odoo, SAP, Zoho"
          aria-label={`Add values to ${attributeName}`}
          aria-invalid={!!error}
          autoComplete="off"
        />
        <Button type="submit" variant="outline" disabled={pending || !names.trim()}>
          {pending ? <Spinner /> : <PlusIcon />}
          Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
