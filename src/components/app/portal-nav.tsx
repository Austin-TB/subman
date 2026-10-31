"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials, useSignOut } from "@/components/app/user-menu";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/portal", label: "Overview", exact: true },
  { href: "/portal/subscriptions", label: "Subscriptions" },
  { href: "/portal/invoices", label: "Invoices" },
];

export function PortalNav({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const signOut = useSignOut();

  return (
    <>
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground",
                active && "bg-muted font-medium text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="size-8">
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/portal/profile">
              <UserIcon />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut}>
            <LogOutIcon />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
