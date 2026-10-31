import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { businessToday, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import type { PlanInput } from "@/lib/schemas/catalog";
import { requireAdmin } from "@/lib/session";
import { PlanForm } from "../plan-form";

export const metadata: Metadata = { title: "New plan" };

export default async function NewPlanPage() {
  await requireAdmin();
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isAddon: true, active: true },
  });

  const values: PlanInput = {
    name: "",
    productId: "",
    price: "",
    period: "MONTHLY",
    interval: "1",
    minQuantity: "1",
    availableFrom: toISODate(businessToday()),
    availableUntil: "",
    autoClose: false,
    closable: true,
    pausable: false,
    renewable: false,
    active: true,
  };

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/plans", label: "Plans" }}
        title="New plan"
        description="Pick the product, set what it costs and how often it bills, and choose what customers can do with it."
      />
      <Card className="max-w-2xl">
        <CardContent>
          <PlanForm values={values} products={products} lockProduct={false} lockBilling={false} readOnly={false} />
        </CardContent>
      </Card>
    </>
  );
}
