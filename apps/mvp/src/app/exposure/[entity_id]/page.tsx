import { notFound } from "next/navigation";
import { z } from "zod";
import {
  getDependencyTwinsCached,
  getExposureEntityCached,
  getPeerIncidentsCached,
  getThreatHistoryCached,
} from "@/lib/db/queries";
import {
  matchingRootCauses,
  type PredicateEntity,
} from "@/lib/exposure/predicates";
import { SiteHeader } from "@/components/site-header";
import { DemoBanner } from "@/components/demo-banner";
import { ExposureProfile } from "@/components/exposure-profile";
import {
  DependencyTwinsPanel,
  PeerIncidentsPanel,
  ThreatHistoryPanel,
} from "@/components/exposure-panels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const entityIdSchema = z.string().uuid();

interface PageProps {
  params: Promise<{ entity_id: string }>;
}

export default async function ExposureEntityPage({ params }: PageProps) {
  const { entity_id } = await params;
  const parsed = entityIdSchema.safeParse(entity_id);
  if (!parsed.success) notFound();

  const entity = await getExposureEntityCached(parsed.data);
  if (!entity) notFound();

  const predicateEntity: PredicateEntity = {
    entity_id: entity.entity_id,
    name: entity.name,
    sector: entity.sector,
    tvl_usd: entity.tvl_usd ? Number(entity.tvl_usd) : null,
    oracle_providers: entity.oracle_providers ?? null,
    bridge_dependencies: entity.bridge_dependencies ?? null,
    stablecoin_dependencies: entity.stablecoin_dependencies ?? null,
    chain_deployments: entity.chain_deployments ?? null,
    upgrade_authority_type: entity.upgrade_authority_type ?? null,
    multisig_threshold: entity.multisig_threshold ?? null,
    audits_tier: entity.audits_tier ?? null,
    dvn_configuration: entity.dvn_configuration ?? null,
    frontend_host: entity.frontend_host ?? null,
    npm_lockfile_sha: entity.npm_lockfile_sha ?? null,
    kms_provider: entity.kms_provider ?? null,
    is_anonymous_team: entity.is_anonymous_team ?? null,
    team_jurisdiction: entity.team_jurisdiction ?? null,
    has_security_disclosure_policy:
      entity.has_security_disclosure_policy ?? null,
    governance_type: entity.governance_type ?? null,
  };

  const rootCauses = matchingRootCauses(predicateEntity);

  const [threatHistory, peerGroups, twins] = await Promise.all([
    getThreatHistoryCached(entity.entity_id),
    getPeerIncidentsCached(entity.entity_id, rootCauses),
    getDependencyTwinsCached(entity.entity_id, { limit: 10 }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <SiteHeader active="exposure" />
      <DemoBanner />

      <ExposureProfile entity={entity} />

      <section id="threat-history" className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Threat History
          </h2>
          <span className="text-xs text-zinc-500">
            {threatHistory.length} recorded incident
            {threatHistory.length === 1 ? "" : "s"}
          </span>
        </header>
        <ThreatHistoryPanel incidents={threatHistory} />
      </section>

      <section id="peer-incidents" className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Peer Incidents <span className="text-sm font-normal text-zinc-500">· Method B</span>
          </h2>
          <span className="text-xs text-zinc-500">
            {rootCauses.length} root-cause predicate match
            {rootCauses.length === 1 ? "" : "es"}
          </span>
        </header>
        <PeerIncidentsPanel
          groups={peerGroups}
          matchedRootCauses={rootCauses}
        />
      </section>

      <section id="dependency-twins" className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Dependency Twins{" "}
            <span className="text-sm font-normal text-zinc-500">
              · Method A + B + C ensemble
            </span>
          </h2>
          <span className="text-xs text-zinc-500">
            Top {twins.length} of 25 precomputed
          </span>
        </header>
        <DependencyTwinsPanel twins={twins} />
      </section>

      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        How these scores are computed:{" "}
        <a
          href="/methodology#exposure-graph"
          className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          /methodology#exposure-graph
        </a>
      </footer>
    </div>
  );
}
