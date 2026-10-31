import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My subscriptions" };

export default async function PortalSubscriptions() {
  const user = await requireCustomer();
  const subs = await db.subscription.findMany({
    where: { customerId: user.customerId, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title="My subscriptions" />
      <Card>
        <CardContent className="grid gap-2">
          {subs.length === 0 && <p className="text-sm text-muted-foreground">You have no subscriptions yet.</p>}
          {subs.map((s) => (
            <Link key={s.id} href={`/portal/subscriptions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40">
              <div>
                <div className="font-medium">{s.plan.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.number} · since {formatDate(s.startDate)}
                  {s.expiryDate && ` · until ${formatDate(s.expiryDate)}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{formatMoney(s.recurringAmount)}</span>
                <StatusBadge status={s.status} />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
