import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  customerId: string | null;
};

/** The logged-in, active user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    role?: string;
    active?: boolean;
    customerId?: string | null;
  };
  if (u.active === false) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: (u.role ?? "CUSTOMER") as Role,
    customerId: u.customerId ?? null,
  };
});

/**
 * Use at the top of every page and server action.
 * Logged out → /login. Wrong role → 403.
 */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) forbidden();
  return user;
}

export const requireBackOffice = () => requireRole("ADMIN", "STAFF");
export const requireAdmin = () => requireRole("ADMIN");

/** Portal pages: a logged-in customer with a linked Customer record. */
export async function requireCustomer(): Promise<CurrentUser & { customerId: string }> {
  const user = await requireRole("CUSTOMER");
  if (!user.customerId) forbidden();
  return user as CurrentUser & { customerId: string };
}
