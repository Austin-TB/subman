import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivity, type EntityType } from "@/lib/activity";
import { formatDateTime } from "@/lib/dates";

/** What happened to a record, newest first, with who did it and when. */
export async function ActivityTimeline({
  entityType,
  entityId,
  title = "Activity",
}: {
  entityType: EntityType;
  entityId: string;
  title?: string;
}) {
  const entries = await getActivity(entityType, entityId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="grid gap-4 border-l pl-4">
            {entries.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-1.5 -left-[1.28rem] size-2 rounded-full bg-muted-foreground/50 ring-4 ring-card" />
                <p className="text-sm">{e.message}</p>
                <p className="text-xs text-muted-foreground">
                  {e.user?.name ?? "System"} · {formatDateTime(e.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
