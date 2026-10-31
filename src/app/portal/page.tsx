import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My account" };

// Placeholder until Phase 6 builds the portal overview.
export default async function PortalHome() {
  const user = await requireCustomer();
  return <PageHeader title={`Hello, ${user.name}`} description="Your subscriptions and invoices will appear here." />;
}
