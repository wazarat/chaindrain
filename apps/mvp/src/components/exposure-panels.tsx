import Link from "next/link";
import type {
  DependencyTwinRow,
  IncidentRow,
  PeerIncidentGroup,
} from "@/lib/db/queries";
import { cn, formatDate, formatUsdCompact } from "@/lib/utils";
import { DemoChip } from "./demo-chip";

const ATTACK_LAYER_CLASS: Record<string, string> = {
  smart_contract:
    "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30",
  oracle:
    "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-1 ring-orange-500/30",
  bridge_validator:
    "bg-purple-500/15 text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/30",
  infra:
    "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30",
  custody:
    "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30",
  governance:
    "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30",
  social:
    "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 ring-1 ring-yellow-500/30",
  regulatory:
    "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-500/30",
  cross_chain:
    "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30",
  ai_agent:
    "bg-pink-500/15 text-pink-700 dark:text-pink-300 ring-1 ring-pink-500/30",
};

function layerClass(layer: string | null | undefined): string {
  if (!layer) return ATTACK_LAYER_CLASS.smart_contract;
  return ATTACK_LAYER_CLASS[layer] ?? ATTACK_LAYER_CLASS.smart_contract;
}

function formatRootCause(rc: string): string {
  return rc.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Panel 1 — Threat History
// ---------------------------------------------------------------------------

export function ThreatHistoryPanel({
  incidents,
}: {
  incidents: IncidentRow[];
}) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        No recorded incidents for this entity. Threat history will populate as
        the Incident Ledger ingests live aggregator data (Phase 2a).
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {incidents.map((inc) => (
        <article
          key={inc.incident_id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <time className="font-medium tabular-nums">
                {formatDate(inc.event_date)}
              </time>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  layerClass(inc.attack_layer),
                )}
              >
                {formatRootCause(inc.root_cause)}
              </span>
              {inc.attack_layer ? (
                <span className="text-xs text-zinc-500">
                  {inc.attack_layer.replace(/_/g, " ")}
                </span>
              ) : null}
              {inc.attacker_attribution ? (
                <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-zinc-500/20 dark:text-zinc-300">
                  {inc.attacker_attribution}
                </span>
              ) : null}
              <DemoChip confidence={inc.data_confidence} />
            </div>
            <span className="tabular-nums text-sm font-semibold text-red-600 dark:text-red-400">
              {formatUsdCompact(inc.loss_amount_usd)}
            </span>
          </header>

          {inc.narrative_summary ? (
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {inc.narrative_summary}
            </p>
          ) : null}

          {inc.aadapt_tactic_ids && inc.aadapt_tactic_ids.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider">
              {inc.aadapt_tactic_ids.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-teal-500/10 px-1.5 py-0.5 text-teal-700 ring-1 ring-teal-500/30 dark:text-teal-300"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <Link
              href={`/exposure/incidents/${inc.incident_id}`}
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              View incident →
            </Link>
            {inc.was_audited ? <span>Audited at time</span> : null}
            {inc.bounty_program_at_time ? <span>Bounty live</span> : null}
            {inc.flash_loan_used ? <span>Flash loan</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 2 — Peer Incidents (Method B)
// ---------------------------------------------------------------------------

export function PeerIncidentsPanel({
  groups,
  matchedRootCauses,
}: {
  groups: PeerIncidentGroup[];
  matchedRootCauses: string[];
}) {
  if (matchedRootCauses.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Entity does not currently match any historical root-cause predicates.
        This is good news — but rerun Phase 3b weekly as new incidents land.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((grp) => (
        <section
          key={grp.root_cause}
          className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <header className="flex items-baseline justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <h4 className="text-sm font-semibold">
                Vulnerable to: {formatRootCause(grp.root_cause)}
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500">
                {grp.matched_predicate_summary}
              </p>
            </div>
            <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-500/20 dark:text-zinc-300">
              {grp.incidents.length} historical peer event
              {grp.incidents.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {grp.incidents.slice(0, 5).map((inc) => (
              <li
                key={inc.incident_id}
                className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">
                    {inc.victim_names.slice(0, 2).join(", ")}
                    {inc.victim_names.length > 2
                      ? ` +${inc.victim_names.length - 2}`
                      : ""}
                  </span>
                  <time className="text-xs text-zinc-500 tabular-nums">
                    {formatDate(inc.event_date)}
                  </time>
                  <DemoChip confidence={inc.data_confidence} />
                </div>
                <span className="tabular-nums text-sm font-semibold text-red-600 dark:text-red-400">
                  {formatUsdCompact(inc.loss_amount_usd)}
                </span>
              </li>
            ))}
            {grp.incidents.length > 5 ? (
              <li className="px-4 py-2 text-xs text-zinc-500">
                + {grp.incidents.length - 5} more
              </li>
            ) : null}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 3 — Dependency Twins (Method A + C ensemble)
// ---------------------------------------------------------------------------

function ScoreBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className={cn("h-full rounded-full bg-teal-500", className)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatSharedAttributes(
  shared: Record<string, unknown>,
): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(shared)) {
    if (Array.isArray(v) && v.length > 0) {
      out.push({ key: k, value: v.join(", ") });
    } else if (typeof v === "string" && v) {
      out.push({ key: k, value: v });
    }
  }
  return out;
}

export function DependencyTwinsPanel({
  twins,
}: {
  twins: DependencyTwinRow[];
}) {
  if (twins.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        No precomputed twins for this entity. The similarity engine will
        backfill on the next weekly batch.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {twins.map((t) => {
        const shared = formatSharedAttributes(t.shared_attributes);
        return (
          <Link
            key={t.target_entity_id}
            href={`/exposure/${t.target_entity_id}`}
            className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-500/40 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
          >
            <header className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  #{t.rank}
                </div>
                <h4 className="text-sm font-semibold group-hover:text-teal-700 dark:group-hover:text-teal-300">
                  {t.target_name ?? t.target_entity_id}
                </h4>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {t.target_sector ?? "—"} ·{" "}
                  {t.target_risk_tier ?? "untiered"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  Ensemble
                </div>
                <div className="text-lg font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                  {Number(t.ensemble_score).toFixed(3)}
                </div>
              </div>
            </header>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-zinc-500">A · Jaccard</span>
                  <span className="tabular-nums">
                    {Number(t.method_a_jaccard).toFixed(2)}
                  </span>
                </div>
                <ScoreBar value={Number(t.method_a_jaccard)} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-zinc-500">B · Overlap</span>
                  <span className="tabular-nums">{t.method_b_overlap}</span>
                </div>
                <ScoreBar
                  value={Math.min(1, t.method_b_overlap / 5)}
                  className="bg-orange-500"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-zinc-500">C · Cosine</span>
                  <span className="tabular-nums">
                    {Number(t.method_c_cosine).toFixed(2)}
                  </span>
                </div>
                <ScoreBar
                  value={Number(t.method_c_cosine)}
                  className="bg-emerald-500"
                />
              </div>
            </div>

            {shared.length > 0 ? (
              <div className="border-t border-zinc-100 pt-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <div className="mb-1 font-medium uppercase tracking-wider text-zinc-500">
                  Matches on
                </div>
                <ul className="space-y-0.5">
                  {shared.slice(0, 4).map((s) => (
                    <li key={s.key}>
                      <code className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] dark:bg-zinc-800">
                        {s.key}
                      </code>{" "}
                      = {s.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
