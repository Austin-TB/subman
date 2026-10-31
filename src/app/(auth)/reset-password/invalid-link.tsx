import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown when a reset link is missing, already used or expired. */
export function InvalidResetLink() {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>This link isn&apos;t valid any more</AlertTitle>
        <AlertDescription>Reset links work once and expire after 1 hour. Ask for a new one.</AlertDescription>
      </Alert>
      <Button asChild>
        <Link href="/forgot-password">Send a new link</Link>
      </Button>
    </div>
  );
}
