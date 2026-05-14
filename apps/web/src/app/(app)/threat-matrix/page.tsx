import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceClass, ThreatCell } from "@chaindrain/shared-types";

export const dynamic = "force-dynamic";

const EVIDENCE_CLASSES: EvidenceClass[] = [
  "protocol_exploit",
  "operational_compromise",
  "market_event",
  "regulatory",
  "governance",
  "disclosure",
  "other",
];

const SHORT: Record<EvidenceClass, string> = {
  protocol_exploit: "Exploit",
  operational_compromise: "Op Compromise",
  market_event: "Market",
  regulatory: "Regulatory",
  governance: "Governance",
  disclosure: "Disclosure",
  other: "Other",
};

function cellColor(score: number) {
  if (score >= 0.8) return "bg-sev-critical/30 text-sev-critical";
  if (score >= 0.6) return "bg-sev-high/25 text-sev-high";
  if (score >= 0.35) return "bg-sev-medium/25 text-sev-medium";
  if (score >= 0.15) return "bg-sev-low/20 text-sev-low";
  if (score > 0) return "bg-muted text-muted-foreground";
  return "bg-card text-muted-foreground/40";
}

export default async function ThreatMatrixPage() {
  const supabase = createClient();
  const [{ data: cells }, { data: subsectors }] = await Promise.all([
    supabase.from("mv_threat_matrix").select("*"),
    supabase.from("subsectors").select("id, slug, name, sectors(name, slug)").order("name"),
  ]);

  const cellMap = new Map<string, ThreatCell>();
  (cells ?? []).forEach((c: any) => {
    cellMap.set(`${c.subsector_id}::${c.evidence_class}`, c);
  });

  const grouped: Record<string, { name: string; subs: any[] }> = {};
  (subsectors ?? []).forEach((s: any) => {
    const sectorName = s.sectors?.name ?? "Other";
    grouped[sectorName] ||= { name: sectorName, subs: [] };
    grouped[sectorName].subs.push(s);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Threat matrix</h1>
        <p className="text-sm text-muted-foreground">
          Recency-weighted score per (subsector × evidence class) over the last 30 days.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Live scores</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-card/40">
                <th className="sticky left-0 bg-card/40 p-3 text-left font-medium">Subsector</th>
                {EVIDENCE_CLASSES.map((ec) => (
                  <th key={ec} className="p-3 text-left font-medium">{SHORT[ec]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.values(grouped).map((g) => (
                <>
                  <tr key={g.name} className="bg-muted/40">
                    <td colSpan={EVIDENCE_CLASSES.length + 1} className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      {g.name}
                    </td>
                  </tr>
                  {g.subs.map((s: any) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="sticky left-0 bg-background p-3 font-medium">{s.name}</td>
                      {EVIDENCE_CLASSES.map((ec) => {
                        const cell = cellMap.get(`${s.id}::${ec}`);
                        const score = cell?.score ?? 0;
                        return (
                          <td key={ec} className="p-2">
                            <div
                              className={`flex items-center justify-between rounded-md px-2 py-1 font-mono text-[10px] ${cellColor(
                                Number(score),
                              )}`}
                              title={`events: ${cell?.event_count ?? 0}, companies: ${cell?.unique_companies ?? 0}`}
                            >
                              <span>{cell?.event_count ?? 0}</span>
                              <span>{Number(score).toFixed(2)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
