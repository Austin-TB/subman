"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";
import { REASON, type OfferedAction, type SubAction } from "@/lib/subscriptions/transitions";

/**
 * The lifecycle buttons for a subscription: only the actions that apply now. One that is blocked is shown
 * disabled with its reason, so people see what to fix (an expired quotation, a plan below its minimum).
 */
export function LifecycleActions({
  offered,
  run,
}: {
  offered: OfferedAction[];
  run: (action: SubAction, reason?: string) => Promise<ActionResult>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {offered.map((a) =>
        REASON[a.action] && !a.blocked ? (
          <ReasonDialog key={a.action} label={a.label} required={REASON[a.action] === "required"} onConfirm={(r) => run(a.action, r)} />
        ) : (
          <ActionButton
            key={a.action}
            variant={a.action === "CONFIRM" || a.action === "SEND_QUOTATION" ? "default" : "outline"}
            disabled={!!a.blocked}
            title={a.blocked ?? undefined}
            action={() => run(a.action)}
          >
            {a.label}
          </ActionButton>
        ),
      )}
    </div>
  );
}

function ReasonDialog({ label, required, onConfirm }: { label: string; required: boolean; onConfirm: (reason: string) => Promise<ActionResult> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (required && !reason.trim()) return void toast.error("Enter a reason.");
      const r = await onConfirm(reason);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Done.");
      setOpen(false);
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} this subscription?</DialogTitle>
        </DialogHeader>
        <Textarea placeholder={required ? "Reason (required)" : "Reason (optional)"} value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Back
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending && <Spinner />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin only: bill this subscription up to a chosen date. */
export function BillUpTo({ defaultDate, run }: { defaultDate: string; run: (iso: string) => Promise<ActionResult> }) {
  const [date, setDate] = useState(defaultDate);
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      <ActionButton
        variant="outline"
        action={async () => {
          const r = await run(date);
          router.refresh();
          return r;
        }}
      >
        Bill up to date
      </ActionButton>
    </div>
  );
}
