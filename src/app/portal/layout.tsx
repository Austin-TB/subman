import Link from "next/link";
import { RepeatIcon } from "lucide-react";
import { PortalNav } from "@/components/app/portal-nav";
import { requireCustomer } from "@/lib/session";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/portal" className="flex items-center gap-2 font-medium">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <RepeatIcon className="size-4" />
            </div>
            <span className="hidden sm:inline">Brightloop</span>
          </Link>
          <PortalNav user={user} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
    </div>
  );
}
