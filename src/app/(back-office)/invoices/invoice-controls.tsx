"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActionButton } from "@/components/app/action-button";
import { MoneyInput } from "@/components/app/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ActionResult } from "@/lib/action";
import { PAYMENT_METHODS } from "@/lib/billing/status";


type PaymentForm = { method: string; amount: string; paymentDate: string; note: string };

export function RegisterPaymentDialog({
  amountDue,
  today,
  pay,
}: {
  amountDue: string;
  today: string;
  pay: (input: PaymentForm) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<PaymentForm>({ method: "UPI", amount: amountDue, paymentDate: today, note: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const r = await pay(v);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Payment registered.");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV({ method: "UPI", amount: amountDue, paymentDate: today, note: "" });
        setErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button>Register payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register payment</DialogTitle>
          <DialogDescription>Part payments are fine. The invoice turns Paid when nothing is left due.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field data-invalid={!!errors.method}>
            <FieldLabel htmlFor="pm">Method</FieldLabel>
            <select id="pm" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })} className="h-8 rounded-lg border bg-transparent px-2.5 text-sm">
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="pa">Amount</FieldLabel>
              <MoneyInput id="pa" value={v.amount} onChange={(amount) => setV({ ...v, amount })} />
              {errors.amount && <FieldError>{errors.amount[0]}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.paymentDate}>
              <FieldLabel htmlFor="pd">Date</FieldLabel>
              <Input id="pd" type="date" value={v.paymentDate} onChange={(e) => setV({ ...v, paymentDate: e.target.value })} />
              {errors.paymentDate && <FieldError>{errors.paymentDate[0]}</FieldError>}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pn">Note</FieldLabel>
            <Input id="pn" value={v.note} placeholder="UTR / cheque number…" onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Spinner />}
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A date box and a button that runs an action with it: the billing run, bulk confirm. */
export function DateAction({ label, defaultDate, run }: { label: string; defaultDate: string; run: (iso: string) => Promise<ActionResult> }) {
  const [date, setDate] = useState(defaultDate);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      <ActionButton
        action={async () => {
          const r = await run(date);
          router.refresh();
          return r;
        }}
      >
        {label}
      </ActionButton>
    </div>
  );
}
