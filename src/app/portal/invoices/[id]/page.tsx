import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { InvoiceDocument, loadInvoice } from "@/components/app/invoice-document";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { invoiceDisplayStatus } from "@/lib/billing/status";
import { businessToday } from "@/lib/dates";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Invoice" };

export default async function PortalInvoice({ params }: PageProps<"/portal/invoices/[id]">) {
  const user = await requireCustomer();
  const { id } = await params;
  const invoice = await loadInvoice(id);
  // Drafts aren't shown to customers, and someone else's invoice is simply not found.
  if (!invoice || invoice.customerId !== user.customerId || invoice.status === "DRAFT") notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/portal/invoices", label: "My invoices" }}
        title={
          <span className="flex items-center gap-2">
            {invoice.number} <StatusBadge status={invoiceDisplayStatus(invoice, businessToday())} />
          </span>
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/print/invoices/${id}`} target="_blank">
              <PrinterIcon />
              Print / PDF
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent>
          <InvoiceDocument invoice={invoice} />
        </CardContent>
      </Card>
    </>
  );
}
