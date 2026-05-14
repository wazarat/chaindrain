import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WatchButton } from "@/components/watch-button";
import { createClient } from "@/lib/supabase/server";
import type { Severity } from "@chaindrain/shared-types";

export const dynamic = "force-dynamic";

export default async function ProtocolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, slug, name, website, chains, tags, meta, subsectors(id, slug, name, sectors(slug, name))",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!company) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const watchedRow = user
    ? await supabase
        .from("watchlists")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("company_id", company.id)
        .maybeSingle()
    : null;
  const isWatched = !!watchedRow?.data;

  const [{ data: events }, { data: relatedSector }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, summary, severity, evidence_class, status, detected_at")
      .or(`primary_company_id.eq.${company.id}`)
      .order("detected_at", { ascending: false })
      .limit(50),
    supabase
      .from("events")
      .select("id, title, severity, evidence_class, detected_at, primary_company_id, companies!events_primary_company_id_fkey(slug, name, subsector_id)")
      .order("detected_at", { ascending: false })
      .limit(40),
  ]);

  const subsectorId = (company as any).subsectors?.id;
  const sectorEvents = (relatedSector ?? [])
    .filter((e: any) => e.primary_company_id !== company.id)
    .filter((e: any) => e.companies?.subsector_id === subsectorId)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <Link href="/protocols" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All protocols
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {(company as any).subsectors?.sectors?.name} · {(company as any).subsectors?.name}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{company.name}</h1>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              {company.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {(company.chains ?? []).map((c: string) => (
              <Badge key={c} variant="outline" className="font-mono">{c}</Badge>
            ))}
            {(company.tags ?? []).map((t: string) => (
              <Badge key={t} variant="secondary">{t}</Badge>
            ))}
          </div>
        </div>
        {user && <WatchButton companyId={company.id as string} initiallyWatched={isWatched} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Recent events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(events ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No events recorded yet.</p>
            )}
            {(events ?? []).map((e: any) => (
              <div key={e.id} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={e.severity as Severity}>{e.severity}</Badge>
                  <Badge variant="outline">{e.evidence_class}</Badge>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {new Date(e.detected_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 font-medium text-sm">{e.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{e.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Related sector activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sectorEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">No nearby sector events.</p>
            )}
            {sectorEvents.map((e: any) => (
              <div key={e.id} className="rounded-md border border-border p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={e.severity as Severity}>{e.severity}</Badge>
                  <span className="font-medium">{e.companies?.name}</span>
                </div>
                <p className="mt-2 line-clamp-2">{e.title}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
