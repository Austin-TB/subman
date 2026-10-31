import { redirect } from "next/navigation";
import { requireBackOffice } from "@/lib/session";

export default async function CatalogHome() {
  await requireBackOffice();
  redirect("/catalog/products");
}
