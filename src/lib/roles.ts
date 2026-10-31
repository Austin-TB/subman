// Who can do what (PLAN.md §2). Safe to import from client components.

export type Role = "ADMIN" | "STAFF" | "CUSTOMER";

export const BACK_OFFICE_ROLES: Role[] = ["ADMIN", "STAFF"];

export const can = {
  manageUsers: (r: Role) => r === "ADMIN",
  viewOutbox: (r: Role) => r === "ADMIN",
  editCatalog: (r: Role) => r === "ADMIN",
  viewCatalog: (r: Role) => r === "ADMIN" || r === "STAFF",
  editDiscounts: (r: Role) => r === "ADMIN",
  viewDiscounts: (r: Role) => r === "ADMIN" || r === "STAFF",
  manageSubscriptions: (r: Role) => r === "ADMIN" || r === "STAFF",
  manageBilling: (r: Role) => r === "ADMIN" || r === "STAFF",
  billUpToDate: (r: Role) => r === "ADMIN",
  viewDashboard: (r: Role) => r === "ADMIN" || r === "STAFF",
};

export function homeFor(role: Role) {
  return role === "CUSTOMER" ? "/portal" : "/dashboard";
}
