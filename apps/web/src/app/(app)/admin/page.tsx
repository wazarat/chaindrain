import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { TriggerAgentButton } from "./trigger-agent-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return (
      <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
        You need an admin role. Run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
          select admin_grant(&apos;{user.email}&apos;);
        </code>{" "}
        in Supabase SQL editor.
      </div>
    );
  }

  const [{ data: runs }, { data: events }, { count: companyCount }] = await Promise.all([
    supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(10),
    supabase
      .from("events")
      .select("id, title, severity, evidence_class, status, detected_at")
      .order("detected_at", { ascending: false })
      .limit(15),
    supabase.from("companies").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Operational console: agent runs, events, companies, and source list.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Agent runs</CardTitle>
            <CardDescription>Last 10 invocations of the Comet worker.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <TriggerAgentButton />
            {(runs ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                <div>
                  <p className="font-mono">{new Date(r.started_at).toLocaleString()}</p>
                  <p className="text-muted-foreground">{r.found_count} events · {r.cost_cents}¢</p>
                </div>
                <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "critical" : "outline"}>
                  {r.status}
                </Badge>
              </div>
            ))}
            {(runs ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No runs yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Companies</CardTitle>
            <CardDescription>{companyCount ?? 0} total in database.</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>Bulk import via:</p>
            <pre className="mt-2 rounded-md bg-muted p-2 font-mono">
              uv run python scripts/import_from_google_sheets.py --cache-only
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sources</CardTitle>
            <CardDescription>Edit at apps/agent/app/sources.json.</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Source list is committed to the repo so changes are auditable.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Latest events</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {(events ?? []).map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 p-3 text-sm">
              <Badge variant={e.severity}>{e.severity}</Badge>
              <span className="flex-1 truncate">{e.title}</span>
              <Badge variant="outline">{e.status}</Badge>
              <time className="font-mono text-xs text-muted-foreground">
                {new Date(e.detected_at).toLocaleString()}
              </time>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
