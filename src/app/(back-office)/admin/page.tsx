import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

export default async function AdminHome() {
  await requireAdmin();
  redirect("/admin/users");
}
