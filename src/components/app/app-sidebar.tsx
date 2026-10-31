"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercentIcon,
  BoxIcon,
  CalendarSyncIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LayersIcon,
  MailIcon,
  ReceiptIcon,
  RepeatIcon,
  ScrollTextIcon,
  SettingsIcon,
  TagsIcon,
  UsersIcon,
  UserCogIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/app/user-menu";
import type { Role } from "@/lib/roles";

type NavItem = { title: string; href: string; icon: LucideIcon; roles?: Role[] };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
  },
  {
    label: "Sales",
    items: [
      { title: "Subscriptions", href: "/subscriptions", icon: RepeatIcon },
      { title: "Customers", href: "/customers", icon: UsersIcon },
    ],
  },
  {
    label: "Billing",
    items: [
      { title: "Invoices", href: "/invoices", icon: ReceiptIcon },
      { title: "Payments", href: "/payments", icon: WalletIcon },
      { title: "Billing runs", href: "/billing", icon: CalendarSyncIcon },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Products", href: "/catalog/products", icon: BoxIcon },
      { title: "Plans", href: "/catalog/plans", icon: LayersIcon },
      { title: "Quotation templates", href: "/catalog/templates", icon: ScrollTextIcon },
      { title: "Attributes", href: "/catalog/attributes", icon: TagsIcon },
      { title: "Discount rules", href: "/catalog/discounts", icon: BadgePercentIcon },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Taxes", href: "/settings/taxes", icon: FileTextIcon },
      { title: "Payment terms", href: "/settings/payment-terms", icon: SettingsIcon },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Users", href: "/admin/users", icon: UserCogIcon, roles: ["ADMIN"] },
      { title: "Outbox", href: "/admin/outbox", icon: MailIcon, roles: ["ADMIN"] },
    ],
  },
];

export function AppSidebar({ user }: { user: { name: string; email: string; role: Role } }) {
  const pathname = usePathname();
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(user.role)),
  })).filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <RepeatIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Brightloop</span>
                  <span className="truncate text-xs text-muted-foreground">Subscriptions</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
