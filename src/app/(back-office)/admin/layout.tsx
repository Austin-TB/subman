import { requireAdmin } from "@/lib/session";

// Everything under /admin is admin-only. Each page and action also checks, since a layout isn't
// re-run when you move between pages that share it.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return children;
}
