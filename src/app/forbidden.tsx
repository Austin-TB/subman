import Link from "next/link";
import { ShieldXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function Forbidden() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldXIcon />
          </EmptyMedia>
          <EmptyTitle>You don&apos;t have access to this page</EmptyTitle>
          <EmptyDescription>Ask an administrator if you think you should.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
