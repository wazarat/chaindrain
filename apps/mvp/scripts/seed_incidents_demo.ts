/**
 * Layer 2 demo seeder — the Incident Ledger. Inserts ~356 synthetic incidents
 * across the 24 root_cause buckets per ~/Downloads/chaindrain_exposure_graph_scope.md
 * §4.1. Idempotent: deletes any prior `data_confidence='DEMO'` rows first so the
 * total stays stable across re-runs. Real (non-DEMO) incidents are preserved.
 *
 * Performance contract: one batched INSERT for all 356 rows + one batched
 * UPDATE for reputation_signal.last_known_incident_date backfill. Both run in
 * O(seconds) over the Supavisor pooler — same shape as the Layer 1 rewrite.
 *
 * Victim selection is conditioned on ROOT_CAUSE_PREDICATES so Method B has
 * real signal — Method-B overlap is exactly "incidents whose root_cause
 * predicate matches my source AND whose victim is my target".
 *
 * Usage: pnpm --filter @chaindrain/mvp run seed:exposure-incidents
 */

import postgres from "postgres";
import {
  AUDIT_FIRMS_POOL,
  ATTACKER_ATTRIBUTION_WEIGHTED,
  ROOT_CAUSES,
  ROOT_CAUSE_SPECS,
  SECONDARY_ROOT_CAUSE_HINTS,
  type RootCause,
} from "./lib/demo_fixtures";
import {
  deterministicAddress,
  deterministicTxHash,
  logNormalLoss,
  mulberry32,
  pickN,
  sha256Hex,
  slugify,
  triangularDate,
  weighted,
} from "./lib/demo_rand";
import {
  ROOT_CAUSE_PREDICATES,
  type PredicateEntity,
} from "../src/lib/exposure/predicates";
import {
  AADAPT_TACTIC_MAP,
  AADAPT_TECHNIQUE_MAP,
} from "../src/lib/exposure/aadapt_map";

const DEMO = "DEMO";

const TRIANGULAR_START = "2020-01-01";
const TRIANGULAR_PEAK = "2024-06-01";

interface UniverseRow {
  entity_id: string;
  name: string;
  sector: string | null;
  tvl_usd: string | null;
  oracle_providers: string[] | null;
  bridge_dependencies: string[] | null;
  stablecoin_dependencies: string[] | null;
  chain_deployments: string[] | null;
  upgrade_authority_type: string | null;
  multisig_threshold: number | null;
  audits_tier: number | null;
  audit_firms: string[] | null;
  bug_bounty_program_enum: string | null;
  dvn_configuration: string | null;
  frontend_host: string | null;
  npm_lockfile_sha: string | null;
  kms_provider: string | null;
  is_anonymous_team: boolean | null;
  team_jurisdiction: string | null;
  has_security_disclosure_policy: boolean | null;
  governance_type: string | null;
}

interface IncidentPayload {
  victim_entity_ids: string[];
  event_date: string;
  disclosure_date: string | null;
  loss_amount_usd: number;
  funds_recovered_usd: number | null;
  actor_role: string;
  attack_strategy: string;
  aadapt_tactic_ids: string[];
  aadapt_technique_ids: string[];
  root_cause: RootCause;
  secondary_root_causes: string[] | null;
  attack_layer: string;
  flash_loan_used: boolean;
  attacker_address: string | null;
  attacker_attribution: string;
  audit_firm_at_time: string[];
  was_audited: boolean;
  bounty_program_at_time: boolean;
  tx_hashes: string[];
  post_mortem_urls: string[];
  narrative_summary: string;
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

function poissonLike(rng: () => number, lambda: number): number {
  // Approximation good enough for demo "days delta" (no real Poisson lib).
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (p > L) {
    k++;
    p *= rng();
  }
  return Math.max(0, k - 1);
}

function addDays(isoDate: string, days: number): string {
  const t = new Date(isoDate).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function actorRoleFor(rc: RootCause): string {
  if (rc === "rug_pull_hard" || rc === "rug_pull_soft") return "perpetrator";
  if (rc === "validator_quorum_compromise" || rc === "dvn_collapse") {
    return "intermediary";
  }
  return "target";
}

function pickVictims(
  rng: () => number,
  rc: RootCause,
  universe: readonly UniverseRow[],
  predicateEntities: readonly PredicateEntity[],
): UniverseRow[] {
  const pred = ROOT_CAUSE_PREDICATES[rc];
  const eligible: UniverseRow[] = [];
  for (let i = 0; i < universe.length; i++) {
    if (pred(predicateEntities[i]!)) eligible.push(universe[i]!);
  }
  // How many victims? Multi-victim shapes per scope §4.1.
  const multiVictim = rc === "validator_quorum_compromise" || rc === "dvn_collapse";
  const oracleMango = rc === "oracle_manipulation";
  let n: number;
  if (multiVictim) {
    n = 2 + Math.floor(rng() * 3); // 2-4
  } else if (oracleMango) {
    n = 1 + Math.floor(rng() * 3); // 1-3
  } else {
    n = 1;
  }
  const pool = eligible.length > 0 ? eligible : universe.slice();
  return pickN(rng, pool, Math.min(n, pool.length));
}

function attackerAttributionFor(
  rng: () => number,
  rc: RootCause,
  victims: readonly UniverseRow[],
): string {
  if (rc === "private_key_leak") {
    const cexVictim = victims.some(
      (v) =>
        (v.sector ?? "").toLowerCase().includes("cex") ||
        (v.sector ?? "").toLowerCase().includes("custodian") ||
        (v.sector ?? "").toLowerCase().includes("wallet"),
    );
    if (cexVictim) {
      return weighted(rng, [
        ["dprk_lazarus", 0.3],
        ["unknown", 0.3],
        ["unattributed_criminal", 0.25],
        ["internal", 0.1],
        ["mev_searcher", 0.0],
        ["whitehat", 0.05],
      ] as const);
    }
  }
  return weighted(rng, ATTACKER_ATTRIBUTION_WEIGHTED);
}

function buildIncidentPayload(
  rc: RootCause,
  index: number,
  universe: readonly UniverseRow[],
  predicateEntities: readonly PredicateEntity[],
): IncidentPayload {
  const seed = parseInt(sha256Hex(`incident:${rc}:${index}`).slice(0, 8), 16) >>> 0;
  const rng = mulberry32(seed);
  const spec = ROOT_CAUSE_SPECS[rc];

  const todayMinus30 = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const event_date = triangularDate(
    rng,
    TRIANGULAR_START,
    TRIANGULAR_PEAK,
    todayMinus30,
  );
  const disclosure_date = addDays(event_date, poissonLike(rng, 2));

  const loss_amount_usd = logNormalLoss(rng, spec.lossMin, spec.lossMax);
  const has_recovery = rng() < 0.3;
  const funds_recovered_usd = has_recovery
    ? Math.round(rng() * loss_amount_usd * 0.6)
    : null;

  const victims = pickVictims(rng, rc, universe, predicateEntities);
  const victim_entity_ids = victims.map((v) => v.entity_id);

  const aadapt_tactic_ids = [...(AADAPT_TACTIC_MAP[rc] ?? [])];
  const aadapt_technique_ids = [...(AADAPT_TECHNIQUE_MAP[rc] ?? [])];

  const secondaryPool = SECONDARY_ROOT_CAUSE_HINTS[rc];
  const secondary_root_causes =
    rng() < 0.3 && secondaryPool && secondaryPool.length > 0
      ? [secondaryPool[Math.floor(rng() * secondaryPool.length)]!]
      : null;

  const flash_loan_used = rng() < spec.flashLoanProb;

  const incidentKey = `incident:${rc}:${index}`;
  const attacker_address =
    rng() < 0.7 ? deterministicAddress(`${incidentKey}:attacker`) : null;
  const attacker_attribution = attackerAttributionFor(rng, rc, victims);

  // audit_firm_at_time + was_audited + bounty_program_at_time — copied from
  // the first victim's current snapshot (good enough for demo, scope §4.2).
  const firstVictim = victims[0];
  const inheritsAudits = rng() < 0.7;
  const audit_firm_at_time =
    inheritsAudits && firstVictim?.audit_firms
      ? [...firstVictim.audit_firms]
      : rng() < 0.4
        ? pickN(rng, AUDIT_FIRMS_POOL, 1 + Math.floor(rng() * 2))
        : [];
  const was_audited = audit_firm_at_time.length > 0;
  const bounty_program_at_time =
    (firstVictim?.bug_bounty_program_enum ?? "none") !== "none";

  const txCount = 1 + Math.floor(rng() * 4);
  const tx_hashes: string[] = [];
  for (let i = 0; i < txCount; i++) {
    tx_hashes.push(deterministicTxHash(`${incidentKey}:tx:${i}`));
  }

  const slug = slugify(firstVictim?.name ?? rc);
  const post_mortem_urls = [
    `https://medium.com/${slug}/post-mortem-${slug}-${event_date}`,
    `https://rekt.news/${slug}-rekt`,
    `https://blog.${slug}.xyz/incident-report`,
  ].slice(0, 1 + Math.floor(rng() * 3));

  const victimName = firstVictim?.name ?? "an entity";
  const lossLabel = loss_amount_usd.toLocaleString("en-US");
  const flashClause = flash_loan_used
    ? " A flash loan was used to amplify the attack."
    : "";
  const narrative_summary = `On ${event_date}, ${victimName} suffered a ${rc.replace(/_/g, " ")} incident resulting in approximately $${lossLabel} in losses. The exploit targeted the ${spec.attackLayer} layer.${flashClause} Attribution: ${attacker_attribution}. This is a demonstration entry — not a real incident.`;

  return {
    victim_entity_ids,
    event_date,
    disclosure_date,
    loss_amount_usd,
    funds_recovered_usd,
    actor_role: actorRoleFor(rc),
    attack_strategy: spec.attackStrategy,
    aadapt_tactic_ids,
    aadapt_technique_ids,
    root_cause: rc,
    secondary_root_causes,
    attack_layer: spec.attackLayer,
    flash_loan_used,
    attacker_address,
    attacker_attribution,
    audit_firm_at_time,
    was_audited,
    bounty_program_at_time,
    tx_hashes,
    post_mortem_urls,
    narrative_summary,
  };
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
      d.chain_deployments,
      d.upgrade_authority_type,
      d.multisig_threshold,
      d.audits_tier,
      d.audit_firms,
      cf.bug_bounty_program_enum,
      df.dvn_configuration,
      df.frontend_host,
      df.npm_lockfile_sha,
      df.kms_provider,
      gf.is_anonymous_team,
      gf.team_jurisdiction,
      gf.has_security_disclosure_policy,
      gf.governance_type
    FROM chaindrain.mvp_master_dedup d
    LEFT JOIN chaindrain.dependency_fingerprint   df ON df.entity_id = d.entity_id
    LEFT JOIN chaindrain.contract_fingerprint     cf ON cf.entity_id = d.entity_id
    LEFT JOIN chaindrain.governance_fingerprint   gf ON gf.entity_id = d.entity_id
    ORDER BY d.name
  `;
  console.log(`universe: ${universe.length} entities`);

  const predicateEntities = universe.map(toPredicateEntity);

  const incidents: IncidentPayload[] = [];
  for (const rc of ROOT_CAUSES) {
    const count = ROOT_CAUSE_SPECS[rc].count;
    for (let i = 0; i < count; i++) {
      incidents.push(
        buildIncidentPayload(rc, i, universe, predicateEntities),
      );
    }
  }
  console.log(`generated ${incidents.length} incidents`);

  // Idempotency — wipe prior DEMO rows. Real / hand-curated incidents
  // (data_confidence != 'DEMO') are preserved.
  const deleted = await sql`
    DELETE FROM chaindrain.incident WHERE data_confidence = ${DEMO}
  `;
  console.log(`cleared ${deleted.count} prior DEMO incidents`);

  const t0 = Date.now();

  // Bulk INSERT all incidents in one round-trip. JSON victim_entity_ids
  // arrives as text[] via the JSONB intermediate; cast back to uuid[].
  await sql`
    INSERT INTO chaindrain.incident (
      victim_entity_ids, event_date, disclosure_date,
      loss_amount_usd, funds_recovered_usd,
      actor_role, attack_strategy,
      aadapt_tactic_ids, aadapt_technique_ids,
      root_cause, secondary_root_causes, attack_layer,
      flash_loan_used, attacker_address, attacker_attribution,
      audit_firm_at_time, was_audited, bounty_program_at_time,
      tx_hashes, post_mortem_urls, narrative_summary,
      data_confidence
    )
    SELECT
      s.victim_entity_ids::uuid[],
      s.event_date::date,
      s.disclosure_date::date,
      s.loss_amount_usd,
      s.funds_recovered_usd,
      s.actor_role,
      s.attack_strategy,
      s.aadapt_tactic_ids,
      s.aadapt_technique_ids,
      s.root_cause,
      s.secondary_root_causes,
      s.attack_layer,
      s.flash_loan_used,
      s.attacker_address,
      s.attacker_attribution,
      s.audit_firm_at_time,
      s.was_audited,
      s.bounty_program_at_time,
      s.tx_hashes,
      s.post_mortem_urls,
      s.narrative_summary,
      ${DEMO}
    FROM jsonb_to_recordset(${asJson(incidents)}) AS s(
      victim_entity_ids      text[],
      event_date             text,
      disclosure_date        text,
      loss_amount_usd        numeric,
      funds_recovered_usd    numeric,
      actor_role             text,
      attack_strategy        text,
      aadapt_tactic_ids      text[],
      aadapt_technique_ids   text[],
      root_cause             text,
      secondary_root_causes  text[],
      attack_layer           text,
      flash_loan_used        boolean,
      attacker_address       text,
      attacker_attribution   text,
      audit_firm_at_time     text[],
      was_audited            boolean,
      bounty_program_at_time boolean,
      tx_hashes              text[],
      post_mortem_urls       text[],
      narrative_summary      text
    )
  `;
  console.log(`inserted ${incidents.length} incidents in ${Date.now() - t0}ms`);

  // Backfill reputation_signal.last_known_incident_date = MAX(event_date)
  // per entity that's a victim. One UPDATE … FROM aggregating CTE — single
  // round trip for all 772 entities.
  const t1 = Date.now();
  await sql`
    WITH last_per_entity AS (
      SELECT victim_id::uuid AS entity_id, MAX(event_date) AS last_date
      FROM chaindrain.incident,
           unnest(victim_entity_ids) AS victim_id
      WHERE data_confidence = ${DEMO}
      GROUP BY victim_id
    )
    UPDATE chaindrain.reputation_signal r
       SET last_known_incident_date = l.last_date
      FROM last_per_entity l
     WHERE r.entity_id = l.entity_id
       AND r.data_confidence NOT IN ('HIGH','MEDIUM','INFERRED')
  `;
  console.log(`reputation backfill in ${Date.now() - t1}ms`);

  const counts = await sql<
    {
      total: string;
      demo: string;
      with_last_incident: string;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::text FROM chaindrain.incident)                                       AS total,
      (SELECT COUNT(*)::text FROM chaindrain.incident WHERE data_confidence = 'DEMO')        AS demo,
      (SELECT COUNT(*)::text FROM chaindrain.reputation_signal WHERE last_known_incident_date IS NOT NULL) AS with_last_incident
  `;
  console.log("post-flight counts:", counts[0]);

  const byRoot = await sql<{ root_cause: string; n: string }[]>`
    SELECT root_cause, COUNT(*)::text AS n
    FROM chaindrain.incident
    WHERE data_confidence = 'DEMO'
    GROUP BY root_cause
    ORDER BY 1
  `;
  console.log("by root_cause:");
  for (const r of byRoot) {
    console.log(`  ${r.root_cause}: ${r.n}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
