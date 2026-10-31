import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireBackOffice } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder until Phase 7 builds the finance dashboard.
export default async function DashboardPage() {
  const user = await requireBackOffice();
  return <PageHeader title="Dashboard" description={`Welcome, ${user.name}.`} />;
}
