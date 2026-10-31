import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { BLANK_CUSTOMER } from "@/lib/schemas/customers";
import { requireBackOffice } from "@/lib/session";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireBackOffice();
  return (
    <>
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title="New customer"
        description="Who the subscription is for and where its quotations and invoices go."
      />
      <Card className="max-w-3xl">
        <CardContent>
          <CustomerForm values={BLANK_CUSTOMER} />
        </CardContent>
      </Card>
    </>
  );
}
