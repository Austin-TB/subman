import Link from "next/link";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { AddVariantDialog, DeleteVariantButton, EditVariantDialog, type AvailableOption } from "./variant-controls";

export type VariantRow = { id: string; label: string; extraPrice: number };

/** The product's variants with the price each one makes. Admins can add, change and remove them. */
export function VariantsCard({
  productId,
  salesPrice,
  variants,
  available,
  canEdit,
}: {
  productId: string;
  salesPrice: number;
  variants: VariantRow[];
  available: AvailableOption[];
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Variants</CardTitle>
        <CardDescription>
          Options the customer can choose, like Brand: Odoo. Each adds its extra price to the unit price.
        </CardDescription>
        {canEdit && (
          <CardAction>
            <AddVariantDialog productId={productId} options={available} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No variants. This product is sold as it is.
            {canEdit && available.length === 0 && (
              <>
                {" "}
                Create options first under{" "}
                <Link href="/catalog/attributes" className="underline underline-offset-4 hover:text-foreground">
                  Attributes
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Option</TableHead>
                  <TableHead className="text-right">Extra price</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  {canEdit && <TableHead className="text-right">{<span className="sr-only">Actions</span>}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.label}</TableCell>
                    <TableCell className="text-right tabular-nums">+{formatMoney(v.extraPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(salesPrice + v.extraPrice)}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <EditVariantDialog variant={v} />
                          <DeleteVariantButton variant={v} />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
