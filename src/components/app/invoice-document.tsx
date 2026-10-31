import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { addressLines } from "@/lib/schemas/customers";

type Snapshot = { name?: string; company?: string | null; email?: string; taxId?: string | null } & Parameters<typeof addressLines>[0];
type TaxSnap = { name: string; amount: number }[];

export async function loadInvoice(id: string) {
  return db.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sequence: "asc" } },
      payments: { orderBy: { paymentDate: "asc" } },
      subscription: { select: { id: true, number: true, plan: { select: { name: true } } } },
    },
  });
}

export type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;

/** The invoice itself: who it's for, the period, the lines with discounts and taxes, totals and payments. */
export function InvoiceDocument({ invoice }: { invoice: LoadedInvoice }) {
  const c = invoice.customerSnapshot as Snapshot;
  const company = process.env.COMPANY_NAME ?? "Brightloop";
  return (
    <div className="grid gap-6 text-sm">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{company}</div>
          <div className="text-muted-foreground">Tax invoice</div>
        </div>
        <div className="grid gap-0.5 text-right">
          <div className="text-lg font-semibold">{invoice.number ?? "Draft invoice"}</div>
          <div>Invoice date: {formatDate(invoice.invoiceDate)}</div>
          <div>Due date: {formatDate(invoice.dueDate)}</div>
          <div className="text-muted-foreground">
            Period {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
          </div>
        </div>
      </div>
      <div className="grid gap-0.5">
        <div className="text-xs text-muted-foreground uppercase">Bill to</div>
        <div className="font-medium">{c.name}</div>
        {c.company && <div>{c.company}</div>}
        {addressLines(c).map((l) => (
          <div key={l}>{l}</div>
        ))}
        {c.email && <div>{c.email}</div>}
        {c.taxId && <div>Tax ID: {c.taxId}</div>}
        <div className="text-muted-foreground">
          Subscription {invoice.subscription.number} · {invoice.subscription.plan.name}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Discount</TableHead>
            <TableHead className="text-right">Subtotal</TableHead>
            <TableHead>Taxes</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.description}</TableCell>
              <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {l.discountAmount ? (
                  <>
                    −{formatMoney(l.discountAmount)}
                    <div className="text-xs text-muted-foreground">{l.discountName}</div>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(l.subtotal)}</TableCell>
              <TableCell className="text-xs">
                {(l.taxSnapshot as TaxSnap).map((t) => `${t.name}: ${formatMoney(t.amount)}`).join(", ") || "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(l.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <Row label="Untaxed" value={invoice.untaxed} />
          {invoice.discountTotal > 0 && <Row label="Discounts (included above)" value={-invoice.discountTotal} />}
          <Row label="Tax" value={invoice.taxTotal} />
          <Row label="Total" value={invoice.total} bold />
          <Row label="Paid" value={invoice.amountPaid} />
          <Row label="Amount due" value={invoice.amountDue} bold />
        </TableFooter>
      </Table>
      {invoice.payments.length > 0 && (
        <div className="grid gap-1">
          <div className="text-xs text-muted-foreground uppercase">Payments</div>
          {invoice.payments.map((p) => (
            <div key={p.id} className="flex justify-between gap-4">
              <span>
                {formatDate(p.paymentDate)} · {p.method.replace("_", " ").toLowerCase()}
                {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
              </span>
              <span className="tabular-nums">{formatMoney(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <TableRow className={bold ? "font-semibold" : undefined}>
      <TableCell colSpan={6} className="text-right">
        {label}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(value)}</TableCell>
    </TableRow>
  );
}
