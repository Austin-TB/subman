"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/app/password-input";
import { PasswordRequirements } from "@/components/app/password-requirements";
import { authClient } from "@/lib/auth-client";
import { signUpSchema, type SignUpValues } from "@/lib/schemas/auth";

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const password = useWatch({ control: form.control, name: "password" });

  async function onSubmit(values: SignUpValues) {
    setFormError(null);
    const { error } = await authClient.signUp.email(values);
    if (error) {
      if (error.code?.startsWith("USER_ALREADY_EXISTS")) {
        form.setError("email", { message: "An account with this email already exists. Log in instead." });
      } else if (error.code === "PASSWORD_POLICY") {
        form.setError("password", { message: error.message });
      } else if (error.status === 429) {
        setFormError("Too many attempts. Please wait a few seconds and try again.");
      } else {
        setFormError(error.message || "We couldn't create your account. Please try again.");
      }
      return;
    }
    // Signing up also logs the new customer in.
    router.replace("/portal");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input {...field} id="name" autoComplete="name" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input {...field} id="email" type="email" autoComplete="email" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <PasswordInput {...field} id="password" autoComplete="new-password" aria-invalid={fieldState.invalid} />
              <PasswordRequirements value={password} showErrors={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Log in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
