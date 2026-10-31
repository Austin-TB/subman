"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/app/password-input";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")).trim().toLowerCase(),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      // A wrong email and a wrong password get the same message, so the form doesn't reveal who has an account.
      setError(
        error.status === 429
          ? "Too many attempts. Please wait a few seconds and try again."
          : error.code === "ACCOUNT_DEACTIVATED"
            ? (error.message ?? "This account has been deactivated.")
            : "Wrong email or password.",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field data-invalid={!!error}>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" required aria-invalid={!!error} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Log in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New to Brightloop?{" "}
          <Link href="/sign-up" className="underline underline-offset-4 hover:text-foreground">
            Create an account
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
