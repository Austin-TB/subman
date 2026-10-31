import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { param } from "@/lib/list-params";
import { getCurrentUser } from "@/lib/session";
import { homeFor } from "@/lib/roles";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const justReset = param(await searchParams, "reset") === "1";

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Log in with your email and password</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {justReset && (
          <Alert>
            <CircleCheckIcon />
            <AlertDescription>Password updated. Log in with your new password.</AlertDescription>
          </Alert>
        )}
        <LoginForm />
      </CardContent>
    </Card>
  );
}
