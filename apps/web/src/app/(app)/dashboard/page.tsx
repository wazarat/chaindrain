import Link from "next/link";
import { Activity, ArrowRight, Bell, Grid3x3, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { Severity } from "@chaindrain/shared-types";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: watched }, { data: latest }, { count: companyCount }] = await Promise.all([
    supabase
      .from("watchlists")
      .select("company_id, companies(slug, name)")
      .eq("user_id", user.id)
      .limit(8),
    supabase
      .from("events")
      .select("id, title, severity, evidence_class, detected_at, primary_company_id")
      .order("detected_at", { ascending: false })
      .limit(8),
    supabase.from("companies").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live feed of watchlist alerts, latest market-wide events, and sector signals.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Companies tracked</CardDescription>
            <CardTitle className="font-mono text-3xl">{companyCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On your watchlist</CardDescription>
            <CardTitle className="font-mono text-3xl">{watched?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Events (24h)</CardDescription>
            <CardTitle className="font-mono text-3xl">{latest?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Latest events</CardTitle>
            <Link href="/protocols" className="text-xs text-accent hover:underline">
              All <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {(latest ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No events yet. The agent will populate this once a daily run completes.
              </p>
            ) : (
              (latest ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 p-4">
                  <Badge variant={(e.severity as Severity) ?? "info"}>{e.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.evidence_class}</p>
                  </div>
                  <time className="font-mono text-xs text-muted-foreground">
                    {new Date(e.detected_at as string).toLocaleString()}
                  </time>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Your watchlist</CardTitle>
            <CardDescription>Star a protocol to be notified within 30s of any event.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(watched ?? []).length === 0 ? (
              <Link
                href="/protocols"
                className="flex items-center justify-between rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-accent hover:text-accent"
              >
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Browse protocols and star a few
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              (watched ?? []).map((w) => {
                const company = (w as unknown as { companies: { slug: string; name: string } }).companies;
                if (!company) return null;
                return (
                  <Link
                    key={w.company_id as string}
                    href={`/protocols/${company.slug}`}
                    className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-muted"
                  >
                    <span>{company.name}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { href: "/threat-matrix", icon: Grid3x3, title: "Threat matrix", body: "Cross-sector heatmap" },
          { href: "/protocols", icon: Shield, title: "Protocols", body: "Browse all 500+" },
          { href: "/inbox", icon: Bell, title: "Inbox", body: "Realtime alerts" },
        ].map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group">
            <Card className="transition-colors group-hover:border-accent">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-accent" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <CardTitle className="mt-2 text-base">{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
        <Activity className="mr-2 inline h-3 w-3" />
        Live updates stream over Supabase Realtime; no need to refresh.
      </div>
    </div>
  );
}
