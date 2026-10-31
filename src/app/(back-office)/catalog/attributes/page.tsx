import type { Metadata } from "next";
import { TagsIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { can } from "@/lib/roles";
import { requireBackOffice } from "@/lib/session";
import { AddValuesForm, AttributeDialog, DeleteAttributeButton, ValueChip } from "./attribute-controls";

export const metadata: Metadata = { title: "Attributes" };

export default async function AttributesPage() {
  const user = await requireBackOffice();
  const canEdit = can.editCatalog(user.role);

  const attributes = await db.attribute.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      values: { orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { variants: true } } } },
    },
  });

  return (
    <>
      <PageHeader
        title="Attributes"
        description={
          canEdit
            ? "The choices a product comes in, like Brand: Odoo or SAP. Add them to a product as variants, each with its own extra price."
            : "The choices a product comes in, like Brand: Odoo or SAP. View only: an admin changes these."
        }
        actions={canEdit && <AttributeDialog />}
      />

      {attributes.length === 0 ? (
        <Empty className="rounded-xl border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TagsIcon />
            </EmptyMedia>
            <EmptyTitle>No attributes yet</EmptyTitle>
            <EmptyDescription>
              {canEdit ? "Add one, like Brand, then give it values (Odoo, SAP, Zoho)." : "An admin can add attributes."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {attributes.map((a) => {
            const used = a.values.reduce((n, v) => n + v._count.variants, 0);
            return (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle>{a.name}</CardTitle>
                  <CardDescription>
                    {a.values.length === 1 ? "1 value" : `${a.values.length} values`}
                    {used > 0 && ` · used by ${used} product variant${used === 1 ? "" : "s"}`}
                  </CardDescription>
                  {canEdit && (
                    <CardAction className="flex gap-2">
                      <AttributeDialog attribute={{ id: a.id, name: a.name }} />
                      <DeleteAttributeButton attribute={{ id: a.id, name: a.name, used: used > 0 }} />
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent className="grid gap-3">
                  {a.values.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No values yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {a.values.map((v) => (
                        <ValueChip key={v.id} value={{ id: v.id, name: v.name, used: v._count.variants }} canEdit={canEdit} />
                      ))}
                    </div>
                  )}
                  {canEdit && <AddValuesForm attributeId={a.id} attributeName={a.name} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
