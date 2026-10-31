"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { addStaffSchema, type AddStaffValues } from "@/lib/schemas/auth";
import { addStaff } from "./actions";

export function AddStaffDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm<AddStaffValues>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: { name: "", email: "" },
  });

  async function onSubmit(values: AddStaffValues) {
    let result;
    try {
      result = await addStaff(values);
    } catch {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    if (!result.ok) {
      const fieldErrors = Object.entries(result.fieldErrors ?? {});
      for (const [name, messages] of fieldErrors) {
        if (messages?.[0]) form.setError(name as keyof AddStaffValues, { message: messages[0] });
      }
      if (fieldErrors.length === 0) toast.error(result.error);
      return;
    }
    toast.success(result.message);
    form.reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a staff member</DialogTitle>
            <DialogDescription>
              They get an email with a link to set their own password. You never see or choose it.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="staff-name">Full name</FieldLabel>
                  <Input {...field} id="staff-name" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="staff-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="staff-email"
                    type="email"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>The link works once and expires in 1 hour.</FieldDescription>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Add and send link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
