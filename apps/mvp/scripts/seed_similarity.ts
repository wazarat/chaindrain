/**
 * Layer 3 demo seeder — Similarity Engine (Methods A + B + C → ensemble).
 *
 * Per ~/Downloads/chaindrain_exposure_graph_scope.md §5:
 *   Method A: weighted Jaccard across 10 attribute sets (oracle_providers,
 *             audit_firms, bridge_dependencies, stablecoin_dependencies,
 *             lst_lrt_dependencies, chain_deployments, kms_provider (singleton),
 *             frontend_host (singleton), dvn_configuration.required_dvns, and
 *             subsector_tags). Weights sum to 1.00.
 *   Method B: vulnerability-class neighborhood. For each source entity and each
 *             root_cause whose predicate matches source, count incidents whose
 *             root_cause = rc AND target ∈ victims. Normalize by min(1, B/5).
 *   Method C: deterministic 64-dim SHA-256 "fake embedding" cosine, clamped to
 *             [0, 1] via (x+1)/2. Phase 3c upgrade path → real OpenAI embeddings
 *             (DECISIONS §28).
 *   Ensemble = 0.3·A + 0.4·B_norm + 0.3·C. Persist top-25 targets per source.
 *
 * Performance: 772×772 = 595K pairs computed in JS in ~1s, then one bulk
 * INSERT of ~19,300 rows in batches of 1,000. Total: ~5s end-to-end.
 *
 * Usage: pnpm --filter @chaindrain/mvp run seed:exposure-similarity
 */

import postgres from "postgres";
import { ROOT_CAUSES, type RootCause } from "./lib/demo_fixtures";
import {
  ROOT_CAUSE_PREDICATES,
  type PredicateEntity,
} from "../src/lib/exposure/predicates";
import {
  cosineClamped,
  ensembleScore,
  fakeEmbed,
  methodA,
  TOP_K,
  type AttributeBag,
} from "../src/lib/exposure/similarity";

interface UniverseRow {
  entity_id: string;
  name: string;
  sector: string | null;
  tvl_usd: string | null;
  oracle_providers: string[] | null;
  bridge_dependencies: string[] | null;
  stablecoin_dependencies: string[] | null;
  lst_lrt_dependencies: string[] | null;
  chain_deployments: string[] | null;
  subsector_tags: string[] | null;
  audit_firms: string[] | null;
  dvn_configuration: string | null;
  frontend_host: string | null;
  npm_lockfile_sha: string | null;
  kms_provider: string | null;
  upgrade_authority_type: string | null;
  multisig_threshold: number | null;
  audits_tier: number | null;
  is_anonymous_team: boolean | null;
  team_jurisdiction: string | null;
  has_security_disclosure_policy: boolean | null;
  governance_type: string | null;
}

interface IncidentRow {
  root_cause: string;
  victim_entity_ids: string[];
}

function getDbUrl(): string {
  const url =
    process.env.DATABASE_URL_SESSION || process.env.DATABASE_URL || "";
  if (!url) {
    throw new Error(
      "DATABASE_URL_SESSION (or DATABASE_URL) is not set in the environment.",
    );
  }
  return url;
}

function tvlNum(v: string | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toSet(arr: string[] | null): Set<string> {
  return new Set(Array.isArray(arr) ? arr.filter((v) => v != null && v !== "") : []);
}

function toPredicateEntity(e: UniverseRow): PredicateEntity {
  return {
    entity_id: e.entity_id,
    name: e.name,
    sector: e.sector,
    tvl_usd: tvlNum(e.tvl_usd),
    oracle_providers: e.oracle_providers,
    oracle_fallback_present: (e.oracle_providers?.length ?? 0) >= 2,
    bridge_dependencies: e.bridge_dependencies,
    stablecoin_dependencies: e.stablecoin_dependencies,
    chain_deployments: e.chain_deployments,
    upgrade_authority_type: e.upgrade_authority_type,
    multisig_threshold: e.multisig_threshold,
    audits_tier: e.audits_tier,
    dvn_configuration: e.dvn_configuration,
    frontend_host: e.frontend_host,
    npm_lockfile_sha: e.npm_lockfile_sha,
    kms_provider: e.kms_provider,
    is_anonymous_team: e.is_anonymous_team,
    team_jurisdiction: e.team_jurisdiction,
    has_security_disclosure_policy: e.has_security_disclosure_policy,
    governance_type: e.governance_type,
  };
}

function parseDvnRequired(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as { required_dvns?: string[] };
    return new Set(parsed.required_dvns ?? []);
  } catch {
    return new Set();
  }
}

function buildAttributeBag(e: UniverseRow): AttributeBag {
  return {
    audit_firms: toSet(e.audit_firms),
    oracle_providers: toSet(e.oracle_providers),
    bridge_dependencies: toSet(e.bridge_dependencies),
    stablecoin_dependencies: toSet(e.stablecoin_dependencies),
    lst_lrt_dependencies: toSet(e.lst_lrt_dependencies),
    chain_deployments: toSet(e.chain_deployments),
    subsector_tags: toSet(e.subsector_tags),
    kms_provider: e.kms_provider,
    frontend_host: e.frontend_host,
    dvn_required: parseDvnRequired(e.dvn_configuration),
  };
}

function summarizeSharedAttributes(
  s: AttributeBag,
  t: AttributeBag,
  methodBCauses: string[],
): Record<string, unknown> {
  const intersect = (a: Set<string>, b: Set<string>): string[] => {
    const out: string[] = [];
    const small = a.size < b.size ? a : b;
    const large = a.size < b.size ? b : a;
    for (const v of small) if (large.has(v)) out.push(v);
    return out;
  };
  const result: Record<string, unknown> = {
    audit_firms: intersect(s.audit_firms, t.audit_firms),
    oracle_providers: intersect(s.oracle_providers, t.oracle_providers),
    bridge_dependencies: intersect(s.bridge_dependencies, t.bridge_dependencies),
    stablecoin_dependencies: intersect(
      s.stablecoin_dependencies,
      t.stablecoin_dependencies,
    ),
    lst_lrt_dependencies: intersect(s.lst_lrt_dependencies, t.lst_lrt_dependencies),
    chain_deployments: intersect(s.chain_deployments, t.chain_deployments),
    subsector_tags: intersect(s.subsector_tags, t.subsector_tags),
    dvn_required: intersect(s.dvn_required, t.dvn_required),
  };
  if (s.kms_provider && s.kms_provider === t.kms_provider) {
    result["kms_provider"] = s.kms_provider;
  }
  if (s.frontend_host && s.frontend_host === t.frontend_host) {
    result["frontend_host"] = s.frontend_host;
  }
  if (methodBCauses.length > 0) {
    result["method_b_root_causes"] = methodBCauses;
  }
  return result;
}

interface SimilarityRow {
  source_entity_id: string;
  target_entity_id: string;
  method_a_jaccard: number;
  method_b_overlap: number;
  method_c_cosine: number;
  ensemble_score: number;
  shared_attributes: Record<string, unknown>;
  rank: number;
}

async function main(): Promise<void> {
  const url = getDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });
  const asJson = (value: unknown): ReturnType<typeof sql.json> =>
    sql.json(value as Parameters<typeof sql.json>[0]);
  console.log("connecting...");
  await sql`select 1 as ok`;

  const universe = await sql<UniverseRow[]>`
    SELECT
      d.entity_id,
      d.name,
      d.sector,
      d.tvl_usd,
      df.oracle_providers,
      df.bridge_dependencies,
      df.stablecoin_dependencies,
      df.lst_lrt_dependencies,
      d.chain_deployments,
      i.subsector_tags,
      d.audit_firms,
      df.dvn_configuration,
      df.frontend_host,
      df.npm_lockfile_sha,
      df.kms_provider,
      d.upgrade_authority_type,
      d.multisig_threshold,
      d.audits_tier,
      gf.is_anonymous_team,
      gf.team_jurisdiction,
      gf.has_security_disclosure_policy,
      gf.governance_type
    FROM chaindrain.mvp_master_dedup d
    LEFT JOIN chaindrain.identity                 i  ON i.entity_id  = d.entity_id
    LEFT JOIN chaindrain.dependency_fingerprint   df ON df.entity_id = d.entity_id
    LEFT JOIN chaindrain.governance_fingerprint   gf ON gf.entity_id = d.entity_id
    ORDER BY d.name
  `;
  console.log(`universe: ${universe.length} entities`);

  const incidents = await sql<IncidentRow[]>`
    SELECT root_cause, victim_entity_ids::text[] AS victim_entity_ids
    FROM chaindrain.incident
    WHERE data_confidence = 'DEMO'
  `;
  console.log(`incidents: ${incidents.length} rows`);

  const t0 = Date.now();

  // Pre-compute per-entity attribute bags + fake embeddings + predicate-match
  // bitmask (which root_causes does this entity satisfy?).
  const bags = universe.map(buildAttributeBag);
  const embeds = bags.map(fakeEmbed);
  const matchingCauses: RootCause[][] = universe.map((row) => {
    const pe = toPredicateEntity(row);
    const out: RootCause[] = [];
    for (const rc of ROOT_CAUSES) {
      try {
        if (ROOT_CAUSE_PREDICATES[rc](pe)) out.push(rc);
      } catch {
        /* predicates must be total; ignore */
      }
    }
    return out;
  });

  // Method B aggregation: incidentsByRcByTarget[rc][target_entity_id] = count.
  const incByRcByTarget = new Map<string, Map<string, number>>();
  for (const inc of incidents) {
    let perTarget = incByRcByTarget.get(inc.root_cause);
    if (!perTarget) {
      perTarget = new Map();
      incByRcByTarget.set(inc.root_cause, perTarget);
    }
    for (const victim of inc.victim_entity_ids) {
      perTarget.set(victim, (perTarget.get(victim) ?? 0) + 1);
    }
  }

  console.log(`pre-compute done in ${Date.now() - t0}ms`);

  // For each source, score all targets, take top-25.
  const t1 = Date.now();
  const allRows: SimilarityRow[] = [];
  for (let si = 0; si < universe.length; si++) {
    const source = universe[si]!;
    const sBag = bags[si]!;
    const sEmbed = embeds[si]!;
    const sCauses = matchingCauses[si]!;

    interface Scored {
      ti: number;
      a: number;
      b: number;
      c: number;
      ens: number;
      bCauses: string[];
    }

    const scored: Scored[] = [];
    for (let ti = 0; ti < universe.length; ti++) {
      if (ti === si) continue;
      const target = universe[ti]!;
      const tBag = bags[ti]!;
      const tEmbed = embeds[ti]!;

      const aRaw = methodA(sBag, tBag);
      const a = Number.isFinite(aRaw) ? aRaw : 0;
      let b = 0;
      const bCausesHit: string[] = [];
      for (const rc of sCauses) {
        const perTarget = incByRcByTarget.get(rc);
        if (!perTarget) continue;
        const hit = perTarget.get(target.entity_id) ?? 0;
        if (hit > 0) {
          b += hit;
          bCausesHit.push(rc);
        }
      }
      const cRaw = cosineClamped(sEmbed, tEmbed);
      const c = Number.isFinite(cRaw) ? cRaw : 0.5;
      const { ensemble: ens } = ensembleScore(a, b, c);
      scored.push({ ti, a, b, c, ens, bCauses: bCausesHit });
    }

    scored.sort((x, y) => y.ens - x.ens);
    const top = scored.slice(0, TOP_K);
    for (let rank = 0; rank < top.length; rank++) {
      const sc = top[rank]!;
      const target = universe[sc.ti]!;
      allRows.push({
        source_entity_id: source.entity_id,
        target_entity_id: target.entity_id,
        method_a_jaccard: Math.round(sc.a * 10000) / 10000,
        method_b_overlap: sc.b,
        method_c_cosine: Math.round(sc.c * 10000) / 10000,
        ensemble_score: Math.round(sc.ens * 10000) / 10000,
        shared_attributes: summarizeSharedAttributes(sBag, bags[sc.ti]!, sc.bCauses),
        rank: rank + 1,
      });
    }
  }
  console.log(
    `scored ${universe.length} sources × ${universe.length - 1} targets in ${Date.now() - t1}ms; persisting ${allRows.length} rows`,
  );

  // Idempotency: full table replace. similarity_pair has no real / curated
  // rows — it's all derived — so a wipe-then-insert keeps re-runs clean.
  await sql`DELETE FROM chaindrain.similarity_pair`;

  // Batched INSERT in chunks. Each row is ~10 simple cols + 1 jsonb; 1000 rows
  // per batch keeps the parameter count comfortable.
  const BATCH = 1000;
  const t2 = Date.now();
  for (let i = 0; i < allRows.length; i += BATCH) {
    const slice = allRows.slice(i, i + BATCH);
    await sql`
      INSERT INTO chaindrain.similarity_pair (
        source_entity_id, target_entity_id,
        method_a_jaccard, method_b_overlap, method_c_cosine,
        ensemble_score, shared_attributes, rank
      )
      SELECT
        s.source_entity_id::uuid,
        s.target_entity_id::uuid,
        s.method_a_jaccard,
        s.method_b_overlap,
        s.method_c_cosine,
        s.ensemble_score,
        s.shared_attributes,
        s.rank
      FROM jsonb_to_recordset(${asJson(slice)}) AS s(
        source_entity_id   text,
        target_entity_id   text,
        method_a_jaccard   numeric,
        method_b_overlap   int,
        method_c_cosine    numeric,
        ensemble_score     numeric,
        shared_attributes  jsonb,
        rank               int
      )
    `;
  }
  console.log(`inserted ${allRows.length} rows in ${Date.now() - t2}ms`);

  const stats = await sql<
    {
      total: string;
      sources: string;
      avg_per_source: string;
      max_ensemble: string;
    }[]
  >`
    SELECT
      COUNT(*)::text                                       AS total,
      COUNT(DISTINCT source_entity_id)::text               AS sources,
      ROUND(AVG(per_source), 2)::text                      AS avg_per_source,
      ROUND(MAX(ensemble_score), 4)::text                  AS max_ensemble
    FROM (
      SELECT source_entity_id, ensemble_score,
             COUNT(*) OVER (PARTITION BY source_entity_id) AS per_source
      FROM chaindrain.similarity_pair
    ) t
  `;
  console.log("similarity post-flight:", stats[0]);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
