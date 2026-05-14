import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select(
      "id, kind, read_at, created_at, event_id, sector_signal_id, events(id, title, severity, evidence_class, primary_company_id, companies!events_primary_company_id_fkey(slug, name)), sector_signals(id, severity, rationale, subsectors(slug, name))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Watchlist alerts and sector signals. Updates stream in real-time.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <InboxClient initial={(notifications ?? []) as any[]} userId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
