import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { PageHeader } from "@/components/app/page-header";
import { ReadOnlyNotice } from "@/components/app/read-only";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { businessToday, toISODate } from "@/lib/dates";
import { db } from "@/lib/db";
import { toInputValue } from "@/lib/money";
import { planAvailability } from "@/lib/plans";
import { can } from "@/lib/roles";
import type { PlanInput } from "@/lib/schemas/catalog";
import { requireBackOffice } from "@/lib/session";
import { PlanForm } from "../plan-form";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({ params }: PageProps<"/catalog/plans/[id]">) {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);
  const { id } = await params;

  const plan = await db.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true, templates: true } } },
  });
  if (!plan) notFound();

  // Active products, plus the one this plan already sells even if it has since been switched off.
  const products = await db.product.findMany({
    where: { OR: [{ active: true }, { id: plan.productId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isAddon: true, active: true },
  });

  const values: PlanInput = {
    name: plan.name,
    productId: plan.productId,
    price: toInputValue(plan.price),
    period: plan.period,
    interval: String(plan.interval),
    minQuantity: String(plan.minQuantity),
    availableFrom: toISODate(plan.availableFrom),
    availableUntil: plan.availableUntil ? toISODate(plan.availableUntil) : "",
    autoClose: plan.autoClose,
    closable: plan.closable,
    pausable: plan.pausable,
    renewable: plan.renewable,
    active: plan.active,
  };
  const { subscriptions, templates } = plan._count;
  const usage = [
    `${subscriptions} subscription${subscriptions === 1 ? "" : "s"}`,
    `${templates} quotation template${templates === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <>
      <PageHeader
        back={{ href: "/catalog/plans", label: "Plans" }}
        title={plan.name}
        description={`Used by ${usage}`}
        actions={<StatusBadge status={planAvailability(plan, businessToday())} />}
      />
      {!canEdit && <ReadOnlyNotice>Only an admin can change plans.</ReadOnlyNotice>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <PlanForm
              planId={plan.id}
              values={values}
              products={products}
              lockProduct={subscriptions + templates > 0}
              lockBilling={subscriptions > 0}
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>
        <ActivityTimeline entityType="plan" entityId={plan.id} />
      </div>
    </>
  );
}
