import { redirect } from "next/navigation";
import { requireBackOffice } from "@/lib/session";

export default async function SettingsHome() {
  await requireBackOffice();
  redirect("/settings/taxes");
}
