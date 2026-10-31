import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { InvoiceDocument, loadInvoice } from "@/components/app/invoice-document";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { daysOverdue, invoiceDisplayStatus, isOverdue } from "@/lib/billing/status";
import { businessToday, formatDateTime, toISODate } from "@/lib/dates";
import { toInputValue } from "@/lib/money";
import { requireBackOffice } from "@/lib/session";
import { cancelInvoiceAction, confirmInvoiceAction, registerPaymentAction, remindInvoiceAction, sendInvoiceAction } from "../actions";
import { RegisterPaymentDialog } from "../invoice-controls";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  await requireBackOffice();
  const { id } = await params;
  const invoice = await loadInvoice(id);
  if (!invoice) notFound();
  const today = businessToday();
  const overdue = isOverdue(invoice, today);
  const s = invoice.status;

  return (
    <>
      <PageHeader
        back={{ href: "/invoices", label: "Invoices" }}
        title={
          <span className="flex items-center gap-2">
            {invoice.number ?? "Draft invoice"} <StatusBadge status={invoiceDisplayStatus(invoice, today)} />
          </span>
        }
        description={
          <>
            <Link href={`/subscriptions/${invoice.subscription.id}`} className="hover:underline">
              {invoice.subscription.number}
            </Link>
            {overdue && ` · ${daysOverdue(invoice, today)} days overdue`}
            {invoice.sentAt && ` · sent ${formatDateTime(invoice.sentAt)}`}
          </>
        }
        actions={
          <>
            {s === "DRAFT" && <ActionButton action={confirmInvoiceAction.bind(null, id)}>Confirm</ActionButton>}
            {s === "CONFIRMED" && (
              <RegisterPaymentDialog amountDue={toInputValue(invoice.amountDue)} today={toISODate(today)} pay={registerPaymentAction.bind(null, id)} />
            )}
            {(s === "CONFIRMED" || s === "PAID") && (
              <ActionButton variant="outline" action={sendInvoiceAction.bind(null, id)}>
                Send
              </ActionButton>
            )}
            {overdue && (
              <ActionButton variant="outline" action={remindInvoiceAction.bind(null, id)}>
                Send reminder
              </ActionButton>
            )}
            <Button variant="outline" asChild>
              <Link href={`/print/invoices/${id}`} target="_blank">
                <PrinterIcon />
                Print
              </Link>
            </Button>
            {(s === "DRAFT" || s === "CONFIRMED") && invoice.amountPaid === 0 && (
              <ConfirmDialog
                trigger={<Button variant="ghost">Cancel invoice</Button>}
                title="Cancel this invoice?"
                description="It stays on record as Cancelled, and any discount uses go back to their rules."
                confirmLabel="Cancel invoice"
                destructive
                action={cancelInvoiceAction.bind(null, id)}
              />
            )}
          </>
        }
      />
      <Card>
        <CardContent>
          <InvoiceDocument invoice={invoice} />
        </CardContent>
      </Card>
      <ActivityTimeline entityType="invoice" entityId={id} />
    </>
  );
}
