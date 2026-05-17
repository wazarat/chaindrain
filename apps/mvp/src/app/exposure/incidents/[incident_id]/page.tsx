import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getIncidentByIdCached } from "@/lib/db/queries";
import { SiteHeader } from "@/components/site-header";
import { DemoBanner } from "@/components/demo-banner";
import { DemoChip } from "@/components/demo-chip";
import { formatDate, formatUsdCompact } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const incidentIdSchema = z.string().uuid();

interface PageProps {
  params: Promise<{ incident_id: string }>;
}

export default async function IncidentDetailPage({ params }: PageProps) {
  const { incident_id } = await params;
  const parsed = incidentIdSchema.safeParse(incident_id);
  if (!parsed.success) notFound();

  const inc = await getIncidentByIdCached(parsed.data);
  if (!inc) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <SiteHeader active="exposure" />
      <DemoBanner />

      <div className="flex flex-col gap-1">
        <Link
          href="/exposure/incidents"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← back to incident ledger
        </Link>
        <h1 className="flex flex-wrap items-baseline gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          <span>{inc.root_cause.replace(/_/g, " ")}</span>
          <DemoChip confidence={inc.data_confidence} />
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {formatDate(inc.event_date)} ·{" "}
          <span className="text-red-600 dark:text-red-400">
            {formatUsdCompact(inc.loss_amount_usd)}
          </span>
          {inc.attack_layer ? ` · ${inc.attack_layer.replace(/_/g, " ")}` : ""}
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Narrative
        </h2>
        <p className="text-sm leading-relaxed">
          {inc.narrative_summary ?? "—"}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Victims
          </h2>
          <ul className="space-y-1 text-sm">
            {inc.victim_entity_ids.map((id, idx) => (
              <li key={id}>
                <Link
                  href={`/exposure/${id}`}
                  className="text-teal-700 hover:underline dark:text-teal-300"
                >
                  {inc.victim_names[idx] ?? id}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Classification
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-zinc-500">Root cause</dt>
            <dd>{inc.root_cause}</dd>
            <dt className="text-zinc-500">Secondary causes</dt>
            <dd>{inc.secondary_root_causes?.join(", ") ?? "—"}</dd>
            <dt className="text-zinc-500">Attack layer</dt>
            <dd>{inc.attack_layer ?? "—"}</dd>
            <dt className="text-zinc-500">Strategy</dt>
            <dd>{inc.attack_strategy ?? "—"}</dd>
            <dt className="text-zinc-500">Actor role</dt>
            <dd>{inc.actor_role ?? "—"}</dd>
            <dt className="text-zinc-500">Attribution</dt>
            <dd>{inc.attacker_attribution ?? "—"}</dd>
            <dt className="text-zinc-500">Attacker address</dt>
            <dd className="break-all">{inc.attacker_address ?? "—"}</dd>
            <dt className="text-zinc-500">Flash loan</dt>
            <dd>{inc.flash_loan_used ? "yes" : "no"}</dd>
            <dt className="text-zinc-500">Audited at time</dt>
            <dd>{inc.was_audited ? "yes" : "no"}</dd>
            <dt className="text-zinc-500">Bounty at time</dt>
            <dd>{inc.bounty_program_at_time ? "yes" : "no"}</dd>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            AADAPT mappings
          </h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(inc.aadapt_tactic_ids ?? []).map((t) => (
              <span
                key={t}
                className="rounded-full bg-teal-500/10 px-2 py-0.5 text-teal-700 ring-1 ring-teal-500/30 dark:text-teal-300"
              >
                {t}
              </span>
            ))}
            {(inc.aadapt_technique_ids ?? []).map((t) => (
              <span
                key={t}
                className="rounded-full bg-purple-500/10 px-2 py-0.5 text-purple-700 ring-1 ring-purple-500/30 dark:text-purple-300"
              >
                {t}
              </span>
            ))}
            {(inc.aadapt_tactic_ids?.length ?? 0) +
              (inc.aadapt_technique_ids?.length ?? 0) ===
            0 ? (
              <span className="text-zinc-500">—</span>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Evidence
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-zinc-500">Disclosure date</dt>
            <dd>{formatDate(inc.disclosure_date)}</dd>
            <dt className="text-zinc-500">Funds recovered</dt>
            <dd>{formatUsdCompact(inc.funds_recovered_usd)}</dd>
            <dt className="text-zinc-500">Audit firms at time</dt>
            <dd>{inc.audit_firm_at_time?.join(", ") ?? "—"}</dd>
          </dl>
          {inc.post_mortem_urls && inc.post_mortem_urls.length > 0 ? (
            <div className="mt-3 text-xs">
              <div className="mb-1 font-medium text-zinc-500">
                Post-mortem URLs{" "}
                <span className="font-normal italic">(synthetic)</span>
              </div>
              <ul className="space-y-0.5">
                {inc.post_mortem_urls.map((u) => (
                  <li key={u} className="break-all">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {inc.tx_hashes && inc.tx_hashes.length > 0 ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-zinc-500">
                tx hashes ({inc.tx_hashes.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {inc.tx_hashes.map((h) => (
                  <li key={h} className="break-all">
                    {h}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}
