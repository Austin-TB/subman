import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { homeFor } from "@/lib/roles";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : "/login");
}
