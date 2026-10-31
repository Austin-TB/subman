import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Email" };

export default async function EmailPage({ params }: PageProps<"/admin/outbox/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const email = await db.emailLog.findUnique({ where: { id } });
  if (!email) notFound();

  return (
    <>
      <PageHeader title={email.subject} back={{ href: "/admin/outbox", label: "Outbox" }} />
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">To</dt>
        <dd>{email.to}</dd>
        <dt className="text-muted-foreground">Sent</dt>
        <dd>{formatDateTime(email.createdAt)}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StatusBadge status={email.status} />
        </dd>
      </dl>
      {email.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>SMTP failed</AlertTitle>
          <AlertDescription>{email.error}</AlertDescription>
        </Alert>
      )}
      {/*
        The body is rendered in a sandbox with scripts off. Links open in a new tab, which is how you follow
        a reset link from here.
      */}
      <iframe
        title="Email preview"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={`<!doctype html><base target="_blank">${email.html}`}
        className="h-[560px] w-full rounded-lg border bg-white"
      />
    </>
  );
}
