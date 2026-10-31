import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceDocument, loadInvoice } from "@/components/app/invoice-document";
import { getCurrentUser } from "@/lib/session";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Invoice" };

/** A print-styled invoice. Staff can print any invoice; a customer only their own (anyone else's is a 404). */
export default async function PrintInvoicePage({ params }: PageProps<"/print/invoices/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const invoice = await loadInvoice(id);
  if (!invoice || (invoice.status === "DRAFT" && user.role === "CUSTOMER")) notFound();
  if (user.role === "CUSTOMER" && invoice.customerId !== user.customerId) notFound();

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
