import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { businessToday, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import type { DiscountInput } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";
import { DiscountForm } from "../discount-form";

export const metadata: Metadata = { title: "New discount rule" };

export default async function NewDiscountPage() {
  await requireAdmin();
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isAddon: true, active: true },
  });

  const values: DiscountInput = {
    name: "",
    kind: "PERCENT",
    value: "",
    scope: "SUBSCRIPTION",
    productIds: [],
    minPurchase: "",
    minQuantity: "",
    startDate: toISODate(businessToday()),
    endDate: "",
    usageLimit: "",
    active: true,
  };

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/discounts", label: "Discount rules" }}
        title="New discount rule"
        description="Once saved, it applies to the next invoice that qualifies, with nothing else to do."
      />
      <Card className="max-w-2xl">
        <CardContent>
          <DiscountForm values={values} products={products} readOnly={false} />
        </CardContent>
      </Card>
    </>
  );
}
