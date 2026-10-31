"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

// Phase 0: a working email + password login. Phase 1 adds sign-up and password reset links.
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
      setError(error.status === 429 ? "Too many attempts. Try again in a minute." : "Wrong email or password.");
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
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Log in
        </Button>
      </FieldGroup>
    </form>
  );
}
