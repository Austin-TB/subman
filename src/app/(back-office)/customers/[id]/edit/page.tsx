import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import type { CustomerInput } from "@/lib/schemas/customers";
import { requireBackOffice } from "@/lib/session";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  await requireBackOffice();
  const { id } = await params;
  const c = await db.customer.findUnique({ where: { id } });
  if (!c) notFound();

  const values: CustomerInput = {
    name: c.name,
    company: c.company ?? "",
    email: c.email,
    phone: c.phone ?? "",
    addressLine1: c.addressLine1 ?? "",
    addressLine2: c.addressLine2 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    postalCode: c.postalCode ?? "",
    country: c.country ?? "",
    taxId: c.taxId ?? "",
  };

  return (
    <>
      <PageHeader back={{ href: `/customers/${c.id}`, label: c.name }} title="Edit customer" />
      <Card className="max-w-3xl">
        <CardContent>
          <CustomerForm customerId={c.id} values={values} />
        </CardContent>
      </Card>
    </>
  );
}
