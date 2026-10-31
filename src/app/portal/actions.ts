"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action";
import { requireCustomer } from "@/lib/session";
import { transitionSubscription } from "@/lib/subscriptions/service";
import type { SubAction } from "@/lib/subscriptions/transitions";

const CUSTOMER_ACTIONS: SubAction[] = ["PAUSE", "RESUME", "RENEW", "CLOSE"];

/** A customer acting on their own subscription. The service checks ownership and the plan's rules again. */
export async function portalSubscriptionAction(id: string, action: SubAction, reason?: string): Promise<ActionResult> {
  const user = await requireCustomer();
  if (!CUSTOMER_ACTIONS.includes(action)) return fail("You can't do that here.");
  const r = await transitionSubscription({ id, action, actor: { kind: "customer", userId: user.id, customerId: user.customerId }, reason });
  revalidatePath("/portal");
  revalidatePath(`/portal/subscriptions/${id}`);
  return r.ok ? ok(r.message) : r;
}
