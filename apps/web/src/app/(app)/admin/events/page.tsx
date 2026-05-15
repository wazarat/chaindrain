import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { TriageActions } from "./triage-actions";

export const dynamic = "force-dynamic";

const PENDING_STATUSES = ["unverified", "corroborated"] as const;

const STATUS_LABEL: Record<string, string> = {
  unverified: "Unverified",
  corroborated: "Corroborated",
  confirmed: "Confirmed",
  retracted: "Retracted",
};

const STATUS_VARIANT: Record<string, "outline" | "default" | "critical"> = {
  unverified: "outline",
  corroborated: "default",
  confirmed: "default",
  retracted: "critical",
};

type EventRow = {
  id: string;
  title: string;
  summary: string;
  evidence_class: string;
  severity: string;
  status: string;
  detected_at: string;
  occurred_at: string | null;
  primary_company_id: string | null;
};

type CompanyRow = { id: string; slug: string; name: string };

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
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
        Admin role required.
      </div>
    );
  }

  const filter = searchParams?.status ?? "pending";
  let q = supabase
    .from("events")
    .select(
      "id, title, summary, evidence_class, severity, status, detected_at, occurred_at, primary_company_id",
    )
    .order("detected_at", { ascending: false })
    .limit(100);

  if (filter === "pending") {
    q = q.in("status", PENDING_STATUSES as unknown as string[]);
  } else if (
    filter === "unverified" ||
    filter === "corroborated" ||
    filter === "confirmed" ||
    filter === "retracted"
  ) {
    q = q.eq("status", filter);
  }

  const { data: events, error } = await q;
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-6 text-sm">
        Failed to load events: {error.message}
      </div>
    );
  }

  const companyIds = Array.from(
    new Set((events ?? []).map((e) => e.primary_company_id).filter(Boolean) as string[]),
  );
  let companiesById: Record<string, CompanyRow> = {};
  if (companyIds.length) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id, slug, name")
      .in("id", companyIds);
    companiesById = Object.fromEntries((companies ?? []).map((c) => [c.id, c as CompanyRow]));
  }

  const tabs: { key: string; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "unverified", label: "Unverified" },
    { key: "corroborated", label: "Corroborated" },
    { key: "confirmed", label: "Confirmed" },
    { key: "retracted", label: "Retracted" },
  ];

  const list = (events ?? []) as EventRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Event Triage</h1>
          <p className="text-sm text-muted-foreground">
            Confirm or retract incoming evidence. Updates go through the FastAPI
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              PATCH /events/:id/status
            </code>
            so the deployed admin contract is exercised end-to-end.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = (searchParams?.status ?? "pending") === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "pending" ? "/admin/events" : `/admin/events?status=${t.key}`}
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {list.length} event{list.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>Sorted by detected_at descending. Limit 100.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {list.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">No events match this filter.</p>
          )}
          {list.map((e) => {
            const company = e.primary_company_id ? companiesById[e.primary_company_id] : undefined;
            return (
              <div key={e.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={e.severity as "info" | "low" | "medium" | "high" | "critical"}>
                      {e.severity}
                    </Badge>
                    <Badge variant="outline">{e.evidence_class}</Badge>
                    <Badge variant={STATUS_VARIANT[e.status] ?? "outline"}>
                      {STATUS_LABEL[e.status] ?? e.status}
                    </Badge>
                    {company && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {company.slug}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{e.summary}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    detected {new Date(e.detected_at).toLocaleString()}
                    {e.occurred_at
                      ? ` · occurred ${new Date(e.occurred_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <TriageActions eventId={e.id} currentStatus={e.status} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
