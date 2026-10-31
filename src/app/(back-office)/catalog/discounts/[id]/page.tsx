import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { PageHeader } from "@/components/app/page-header";
import { ReadOnlyNotice } from "@/components/app/read-only";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { businessToday, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import { discountState } from "@/lib/discounts";
import { toInputValue, toPercentInput } from "@/lib/money";
import { can } from "@/lib/roles";
import type { DiscountInput } from "@/lib/schemas/catalog";
import { requireBackOffice } from "@/lib/session";
import { DiscountForm } from "../discount-form";

export const metadata: Metadata = { title: "Discount rule" };

const STATE_LABEL = { ACTIVE: "Active", SCHEDULED: "Scheduled", EXPIRED: "Expired", USED_UP: "Used up", INACTIVE: "Inactive" } as const;

export default async function DiscountPage({ params }: PageProps<"/catalog/discounts/[id]">) {
  const user = await requireBackOffice();
  const canEdit = can.editDiscounts(user.role);
  const { id } = await params;

  const discount = await db.discount.findUnique({ where: { id }, include: { products: { select: { id: true } } } });
  if (!discount) notFound();

  const chosen = discount.products.map((p) => p.id);
  const products = await db.product.findMany({
    where: { OR: [{ active: true }, { id: { in: chosen } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isAddon: true, active: true },
  });

  const values: DiscountInput = {
    name: discount.name,
    kind: discount.kind,
    value: discount.kind === "PERCENT" ? toPercentInput(discount.value) : toInputValue(discount.value),
    scope: discount.scope,
    productIds: chosen,
    minPurchase: toInputValue(discount.minPurchase),
    minQuantity: discount.minQuantity == null ? "" : String(discount.minQuantity),
    startDate: toISODate(discount.startDate),
    endDate: discount.endDate ? toISODate(discount.endDate) : "",
    usageLimit: discount.usageLimit == null ? "" : String(discount.usageLimit),
    active: discount.active,
  };
  const state = discountState(discount, businessToday());

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/discounts", label: "Discount rules" }}
        title={discount.name}
        description={`Used ${discount.usedCount} of ${discount.usageLimit ?? "unlimited"} times`}
        actions={<StatusBadge status={state} label={STATE_LABEL[state]} />}
      />
      {!canEdit && <ReadOnlyNotice>Only an admin can create or change discount rules.</ReadOnlyNotice>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <DiscountForm
              discountId={discount.id}
              values={values}
              products={products}
              usedCount={discount.usedCount}
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>
        <ActivityTimeline entityType="discount" entityId={discount.id} />
      </div>
    </>
  );
}
