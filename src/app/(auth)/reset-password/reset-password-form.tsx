"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/app/password-input";
import { PasswordRequirements } from "@/components/app/password-requirements";
import { authClient } from "@/lib/auth-client";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas/auth";
import { InvalidResetLink } from "./invalid-link";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const password = useWatch({ control: form.control, name: "password" });

  async function onSubmit({ password }: ResetPasswordValues) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      if (error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED") {
        setLinkInvalid(true);
      } else if (error.code === "PASSWORD_POLICY") {
        form.setError("password", { message: error.message });
      } else if (error.status === 429) {
        setFormError("Too many attempts. Please wait a minute and try again.");
      } else {
        setFormError(error.message || "We couldn't update your password. Please try again.");
      }
      return;
    }
    // The link may have been opened in a browser that's logged in as someone else
    // (an admin opening a new staff member's link), so start from a clean login screen.
    await authClient.signOut();
    router.replace("/login?reset=1");
    router.refresh();
  }

  if (linkInvalid) return <InvalidResetLink />;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <PasswordInput {...field} id="password" autoComplete="new-password" aria-invalid={fieldState.invalid} />
              <PasswordRequirements value={password} showErrors={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="confirmPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
              <PasswordInput
                {...field}
                id="confirmPassword"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          Update password
        </Button>
      </FieldGroup>
    </form>
  );
}
