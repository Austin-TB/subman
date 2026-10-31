import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { param } from "@/lib/list-params";
import { InvalidResetLink } from "./invalid-link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

// No "already logged in" redirect here: an admin may open a staff member's set-password link from the Outbox.
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = param(sp, "token");
  // Better Auth sends people here with ?token=… for a valid link and ?error=INVALID_TOKEN otherwise.
  const valid = !!token && !param(sp, "error");

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        {valid && <CardDescription>Pick something you haven&apos;t used on another site</CardDescription>}
      </CardHeader>
      <CardContent>{valid ? <ResetPasswordForm token={token} /> : <InvalidResetLink />}</CardContent>
    </Card>
  );
}
