/**
 * Layer 1 demo seeder — fills the Phase 6 Exposure Graph enrichment fields
 * deterministically per entity. Run after the 20260601000000_exposure_graph.sql
 * migration. Idempotent: re-running produces the same values; never overwrites
 * rows whose existing *_confidence is HIGH / MEDIUM / INFERRED. Real data wins.
 *
 * Usage: pnpm --filter @chaindrain/mvp run seed:exposure-layer1
 */

import postgres from "postgres";
import {
  AUDIT_FIRMS_POOL,
  BUG_BOUNTY_PROGRAM_WEIGHTED,
  CEX_POOL,
  COMPILER_VERSION_WEIGHTED,
  CUSTODIAN_POOL,
  DEX_VENUE_POOL,
  DVN_POOL,
  FRONTEND_HOST_WEIGHTED,
  GOVERNANCE_TYPE_WEIGHTED,
  HIGH_TVL_SECTORS_FOR_LIST,
  INCORPORATION_SUFFIXES,
  KMS_PROVIDER_WEIGHTED,
  KYT_STATUS_WEIGHTED,
  LST_LRT_POOL,
  ORACLE_POOL,
  PROXY_PATTERN_WEIGHTED,
  RPC_PROVIDER_WEIGHTED,
  STABLECOIN_POOL,
  SUBSECTOR_FALLBACK,
  SUBSECTOR_TAG_MAP,
  TEAM_JURISDICTION_WEIGHTED,
} from "./lib/demo_fixtures";
import {
  deterministicAddress,
  intInRange,
  mulberry32,
  pickN,
  seedFromEntityId,
  sha256Hex,
  slugify,
  weighted,
} from "./lib/demo_rand";

const DEMO = "DEMO";

interface UniverseRow {
  entity_id: string;
  name: string;
  sector: string | null;
  tvl_usd: string | null;
  defillama_slug: string | null;
  chain_deployments: string[] | null;
  primary_contract_address: string | null;
  proxy_pattern: string | null;
  upgrade_authority_type: string | null;
  audits_tier: number | null;
  audit_firms: string[] | null;
  is_immutable: string | null;
  is_permissionless: string | null;
  bug_bounty_program: string | null;
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

function deterministicTimestamp(seed: string, days: number): string {
  const sha = sha256Hex(seed);
  const offset = parseInt(sha.slice(0, 12), 16) % (days * 86400);
  const t = Date.now() - offset * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

function buildSubsectorTags(
  rng: () => number,
  sector: string | null,
): string[] {
  const trimmed = (sector ?? "").trim();
  const direct = sector ? SUBSECTOR_TAG_MAP[sector] : undefined;
  const trimmedHit = trimmed ? SUBSECTOR_TAG_MAP[trimmed] : undefined;
  const pool: readonly string[] = direct ?? trimmedHit ?? SUBSECTOR_FALLBACK;
  const n = 2 + Math.floor(rng() * 2);
  return pickN(rng, pool, n);
}

function deriveBoolFromText(
  text: string | null,
  fallbackProb: number,
  rng: () => number,
): boolean {
  if (text == null) return rng() < fallbackProb;
  const v = String(text).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return rng() < fallbackProb;
}

function pickContractAddresses(
  rng: () => number,
  entityId: string,
  primary: string | null,
): string[] {
  if (primary && /^0x[a-fA-F0-9]{40}$/.test(primary)) {
    return [primary];
  }
  const n = 1 + Math.floor(rng() * 3);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(deterministicAddress(`${entityId}:contract:${i}`));
  }
  return out;
}

function bugBountyEnumFromExisting(
  existing: string | null,
  rng: () => number,
): string {
  if (existing != null) {
    const v = String(existing).trim().toLowerCase();
    if (v.includes("immunefi")) return "immunefi";
    if (v.includes("cantina")) return "cantina";
    if (v.includes("internal")) return "internal";
    if (v === "none" || v === "no" || v === "false") return "none";
  }
  return weighted(rng, BUG_BOUNTY_PROGRAM_WEIGHTED);
}

function buildOracleProviders(
  rng: () => number,
  sector: string | null,
): string[] {
  const sec = (sector ?? "").toLowerCase();
  let bias: readonly (typeof ORACLE_POOL)[number][];
  if (sec.includes("lend") || sec.includes("perp")) {
    bias = ["chainlink", "pyth", "redstone"];
  } else if (sec.includes("dex") || sec.includes("amm")) {
    bias = ["uniswap_v3_twap", "chainlink"];
  } else {
    bias = ["chainlink", "pyth", "redstone", "api3", "internal"];
  }
  const n = 1 + Math.floor(rng() * 2);
  return pickN(rng, bias, n);
}

function buildBridgeDependencies(
  rng: () => number,
  chainCount: number,
): string[] {
  if (chainCount < 2) return [];
  const n = Math.min(2, 1 + Math.floor(rng() * 2));
  return pickN(rng, [...["layerzero", "wormhole", "axelar", "ccip", "across", "hyperlane", "stargate", "native"]], n);
}

function buildStablecoins(rng: () => number): string[] {
  const n = 1 + Math.floor(rng() * 3);
  return pickN(rng, STABLECOIN_POOL, n);
}

function buildLstLrt(rng: () => number, sector: string | null): string[] {
  if (!HIGH_TVL_SECTORS_FOR_LIST.has(sector ?? "")) return [];
  const n = Math.floor(rng() * 3);
  if (n === 0) return [];
  return pickN(rng, LST_LRT_POOL, n);
}

function buildDexVenues(rng: () => number): string[] {
  const n = 1 + Math.floor(rng() * 3);
  return pickN(rng, DEX_VENUE_POOL, n);
}

function buildCexListings(rng: () => number, tvl: number): string[] {
  const tier =
    tvl >= 1_000_000_000
      ? 8
      : tvl >= 100_000_000
        ? 5
        : tvl >= 10_000_000
          ? 3
          : tvl >= 1_000_000
            ? 1
            : 0;
  if (tier === 0) return [];
  const n = 1 + Math.floor(rng() * Math.max(1, tier));
  return pickN(rng, CEX_POOL, Math.min(n, CEX_POOL.length));
}

function dvnConfigJson(rng: () => number): string {
  const required = pickN(rng, DVN_POOL, 2 + Math.floor(rng() * 2));
  const optional = pickN(
    rng,
    DVN_POOL.filter((d) => !required.includes(d)),
    Math.floor(rng() * 3),
  );
  return JSON.stringify({
    required_dvns: required,
    optional_dvns: optional,
    threshold: required.length,
  });
}

async function main(): Promise<void> {
  const url = getDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });
  console.log("connecting...");
  await sql`select 1 as ok`;

  const universe = await sql<UniverseRow[]>`
    SELECT entity_id, name, sector, tvl_usd, defillama_slug,
           chain_deployments,
           primary_contract_address, proxy_pattern, upgrade_authority_type,
           audits_tier, audit_firms, is_immutable, is_permissionless,
           bug_bounty_program
    FROM chaindrain.mvp_master_dedup
    ORDER BY name
  `;
  console.log(`universe: ${universe.length} entities`);

  let identityUpdates = 0;
  let cfUpdates = 0;
  let depUpdates = 0;
  let govUpserts = 0;
  let repUpserts = 0;
  const t0 = Date.now();

  for (const e of universe) {
    const rng = mulberry32(seedFromEntityId(e.entity_id));
    const tvl = tvlNum(e.tvl_usd);

    // ----- 1. identity extended columns ---------------------------------
    const subsector_tags = buildSubsectorTags(rng, e.sector);
    const website_canonical = `https://www.${slugify(e.name)}.xyz`;
    const is_immutable_bool = deriveBoolFromText(e.is_immutable, 0.18, rng);
    const is_permissionless_bool = deriveBoolFromText(
      e.is_permissionless,
      0.74,
      rng,
    );

    await sql`
      UPDATE chaindrain.identity
         SET subsector_tags        = COALESCE(subsector_tags,        ${subsector_tags}),
             website_canonical     = COALESCE(website_canonical,     ${website_canonical}),
             is_immutable_bool     = COALESCE(is_immutable_bool,     ${is_immutable_bool}),
             is_permissionless_bool = COALESCE(is_permissionless_bool, ${is_permissionless_bool})
       WHERE entity_id = ${e.entity_id}
    `;
    identityUpdates++;

    // ----- 2. contract_fingerprint extended columns ---------------------
    const contract_addresses = pickContractAddresses(
      rng,
      e.entity_id,
      e.primary_contract_address,
    );
    const uses_assembly_bool = rng() < 0.34;
    const bug_bounty_program_enum = bugBountyEnumFromExisting(
      e.bug_bounty_program,
      rng,
    );

    await sql`
      UPDATE chaindrain.contract_fingerprint
         SET contract_addresses      = COALESCE(contract_addresses,      ${contract_addresses}),
             uses_assembly_bool      = COALESCE(uses_assembly_bool,      ${uses_assembly_bool}),
             bug_bounty_program_enum = COALESCE(bug_bounty_program_enum, ${bug_bounty_program_enum})
       WHERE entity_id = ${e.entity_id}
    `;
    cfUpdates++;

    // Optional: backfill legacy contract_fingerprint columns where NULL so
    // the demo entity detail page has plausible values everywhere.
    const proxy = e.proxy_pattern ?? weighted(rng, PROXY_PATTERN_WEIGHTED);
    const compiler_version = weighted(rng, COMPILER_VERSION_WEIGHTED);
    const audits_tier_pick =
      e.audits_tier ??
      (tvl > 1_000_000_000
        ? weighted(rng, [
            [4, 0.2],
            [3, 0.4],
            [2, 0.3],
            [1, 0.1],
          ] as const)
        : weighted(rng, [
            [0, 0.2],
            [1, 0.25],
            [2, 0.3],
            [3, 0.18],
            [4, 0.07],
          ] as const));
    const audit_firms_pick =
      e.audit_firms ??
      (audits_tier_pick > 0
        ? pickN(rng, AUDIT_FIRMS_POOL, Math.min(3, audits_tier_pick))
        : []);
    const last_audit_date_pick =
      audits_tier_pick > 0 ? deterministicTimestamp(`${e.entity_id}:audit`, 540) : null;
    const verified_source_pick = rng() < 0.91;
    const external_call_count_pick = 1 + Math.floor(rng() * 40);

    await sql`
      UPDATE chaindrain.contract_fingerprint
         SET proxy_pattern         = COALESCE(proxy_pattern,         ${proxy}),
             compiler_version      = COALESCE(compiler_version,      ${compiler_version}),
             verified_source       = COALESCE(verified_source,       ${verified_source_pick}),
             audits_tier           = COALESCE(audits_tier,           ${audits_tier_pick}),
             audit_firms           = COALESCE(audit_firms,           ${audit_firms_pick}),
             last_audit_date       = COALESCE(last_audit_date,       ${last_audit_date_pick}::date),
             external_call_count   = COALESCE(external_call_count,   ${external_call_count_pick})
       WHERE entity_id = ${e.entity_id}
    `;

    // ----- 3. dependency_fingerprint §3.3 deferred fields ---------------
    // (oracle_fallback_present is derived in queries.ts at read time as
    // `oracle_providers.length >= 2`, so we don't persist it as its own
    // column. Keep the rng draw here to preserve seed-stable downstream
    // values for this entity.)
    rng();
    const oracle_pick = buildOracleProviders(rng, e.sector);
    const bridge_pick = buildBridgeDependencies(
      rng,
      Array.isArray(e.chain_deployments) ? e.chain_deployments.length : 0,
    );
    const stablecoin_pick = buildStablecoins(rng);
    const lst_pick = buildLstLrt(rng, e.sector);
    const dex_pick = buildDexVenues(rng);
    const cex_pick = buildCexListings(rng, tvl);
    const sec = (e.sector ?? "").toLowerCase();
    const custodian_pick =
      sec.includes("cex") ||
      sec.includes("custodian") ||
      sec.includes("tokenization") ||
      sec.includes("rwa")
        ? CUSTODIAN_POOL[
            seedFromEntityId(e.entity_id) % CUSTODIAN_POOL.length
          ]
        : null;
    const kms_pick = weighted(rng, KMS_PROVIDER_WEIGHTED);
    const rpc_pick = weighted(rng, RPC_PROVIDER_WEIGHTED);
    const frontend_pick = weighted(rng, FRONTEND_HOST_WEIGHTED);
    const npm_lockfile_pick =
      "sha256:" + sha256Hex(`${e.entity_id}:lockfile`).slice(0, 64);
    const dvn_json = bridge_pick.includes("layerzero") ? dvnConfigJson(rng) : null;

    await sql`
      INSERT INTO chaindrain.dependency_fingerprint (
        entity_id,
        oracle_providers, oracle_confidence,
        bridge_dependencies, bridge_confidence,
        stablecoin_dependencies, stablecoin_confidence,
        lst_lrt_dependencies, lst_lrt_confidence,
        dex_liquidity_venues, dex_liquidity_venues_confidence,
        cex_listings, cex_listings_confidence,
        custodian, custodian_confidence,
        kms_provider, kms_provider_confidence,
        rpc_provider_primary, rpc_provider_primary_confidence,
        frontend_host, frontend_host_confidence,
        npm_lockfile_sha, npm_lockfile_sha_confidence,
        dvn_configuration, dvn_confidence
      )
      VALUES (
        ${e.entity_id},
        ${oracle_pick}, ${DEMO},
        ${bridge_pick}, ${DEMO},
        ${stablecoin_pick}, ${DEMO},
        ${lst_pick}, ${DEMO},
        ${dex_pick}, ${DEMO},
        ${cex_pick}, ${DEMO},
        ${custodian_pick}, ${DEMO},
        ${kms_pick}, ${DEMO},
        ${rpc_pick}, ${DEMO},
        ${frontend_pick}, ${DEMO},
        ${npm_lockfile_pick}, ${DEMO},
        ${dvn_json}, ${DEMO}
      )
      ON CONFLICT (entity_id) DO UPDATE SET
        oracle_providers = CASE
          WHEN chaindrain.dependency_fingerprint.oracle_confidence IN ('HIGH','MEDIUM','INFERRED')
            THEN chaindrain.dependency_fingerprint.oracle_providers
          ELSE COALESCE(chaindrain.dependency_fingerprint.oracle_providers, EXCLUDED.oracle_providers) END,
        oracle_confidence = CASE
          WHEN chaindrain.dependency_fingerprint.oracle_confidence IN ('HIGH','MEDIUM','INFERRED')
            THEN chaindrain.dependency_fingerprint.oracle_confidence
          ELSE COALESCE(chaindrain.dependency_fingerprint.oracle_confidence, EXCLUDED.oracle_confidence) END,
        bridge_dependencies = CASE
          WHEN chaindrain.dependency_fingerprint.bridge_confidence IN ('HIGH','MEDIUM','INFERRED')
            THEN chaindrain.dependency_fingerprint.bridge_dependencies
          ELSE COALESCE(chaindrain.dependency_fingerprint.bridge_dependencies, EXCLUDED.bridge_dependencies) END,
        bridge_confidence = CASE
          WHEN chaindrain.dependency_fingerprint.bridge_confidence IN ('HIGH','MEDIUM','INFERRED')
            THEN chaindrain.dependency_fingerprint.bridge_confidence
          ELSE COALESCE(chaindrain.dependency_fingerprint.bridge_confidence, EXCLUDED.bridge_confidence) END,
        stablecoin_dependencies = CASE
          WHEN chaindrain.dependency_fingerprint.stablecoin_confidence IN ('HIGH','MEDIUM','INFERRED')
            THEN chaindrain.dependency_fingerprint.stablecoin_dependencies
          ELSE COALESCE(chaindrain.dependency_fingerprint.stablecoin_dependencies, EXCLUDED.stablecoin_dependencies) END,
        stablecoin_confidence = CASE
          WHEN chaindrain.dependency_fingerprint.stablecoin_confidence IN ('HIGH','MEDIUM','INFERRED')
            THEN chaindrain.dependency_fingerprint.stablecoin_confidence
          ELSE COALESCE(chaindrain.dependency_fingerprint.stablecoin_confidence, EXCLUDED.stablecoin_confidence) END,
        lst_lrt_dependencies = COALESCE(chaindrain.dependency_fingerprint.lst_lrt_dependencies, EXCLUDED.lst_lrt_dependencies),
        lst_lrt_confidence = COALESCE(chaindrain.dependency_fingerprint.lst_lrt_confidence, EXCLUDED.lst_lrt_confidence),
        dex_liquidity_venues = COALESCE(chaindrain.dependency_fingerprint.dex_liquidity_venues, EXCLUDED.dex_liquidity_venues),
        dex_liquidity_venues_confidence = COALESCE(chaindrain.dependency_fingerprint.dex_liquidity_venues_confidence, EXCLUDED.dex_liquidity_venues_confidence),
        cex_listings = COALESCE(chaindrain.dependency_fingerprint.cex_listings, EXCLUDED.cex_listings),
        cex_listings_confidence = COALESCE(chaindrain.dependency_fingerprint.cex_listings_confidence, EXCLUDED.cex_listings_confidence),
        custodian = COALESCE(chaindrain.dependency_fingerprint.custodian, EXCLUDED.custodian),
        custodian_confidence = COALESCE(chaindrain.dependency_fingerprint.custodian_confidence, EXCLUDED.custodian_confidence),
        kms_provider = COALESCE(chaindrain.dependency_fingerprint.kms_provider, EXCLUDED.kms_provider),
        kms_provider_confidence = COALESCE(chaindrain.dependency_fingerprint.kms_provider_confidence, EXCLUDED.kms_provider_confidence),
        rpc_provider_primary = COALESCE(chaindrain.dependency_fingerprint.rpc_provider_primary, EXCLUDED.rpc_provider_primary),
        rpc_provider_primary_confidence = COALESCE(chaindrain.dependency_fingerprint.rpc_provider_primary_confidence, EXCLUDED.rpc_provider_primary_confidence),
        frontend_host = COALESCE(chaindrain.dependency_fingerprint.frontend_host, EXCLUDED.frontend_host),
        frontend_host_confidence = COALESCE(chaindrain.dependency_fingerprint.frontend_host_confidence, EXCLUDED.frontend_host_confidence),
        npm_lockfile_sha = COALESCE(chaindrain.dependency_fingerprint.npm_lockfile_sha, EXCLUDED.npm_lockfile_sha),
        npm_lockfile_sha_confidence = COALESCE(chaindrain.dependency_fingerprint.npm_lockfile_sha_confidence, EXCLUDED.npm_lockfile_sha_confidence),
        dvn_configuration = COALESCE(chaindrain.dependency_fingerprint.dvn_configuration, EXCLUDED.dvn_configuration),
        dvn_confidence = COALESCE(chaindrain.dependency_fingerprint.dvn_confidence, EXCLUDED.dvn_confidence)
    `;
    depUpdates++;

    // also flag fallback presence as a synthetic boolean — there is no
    // boolean column for this on dependency_fingerprint, but the predicate
    // layer can derive it from the array length, so nothing else is
    // required here.

    // ----- 4. governance_fingerprint -----------------------------------
    const governance_type = weighted(rng, GOVERNANCE_TYPE_WEIGHTED);
    const governance_token_address =
      governance_type === "token_voting" ||
      governance_type === "delegated" ||
      governance_type === "optimistic"
        ? deterministicAddress(`${e.entity_id}:govtoken`)
        : null;
    const treasury_size_usd = Math.min(
      500_000_000,
      Math.max(0, tvl * (0.005 + rng() * 0.05)),
    );
    const team_size_estimate = weighted(rng, [
      [intInRange(rng, 3, 8), 0.22],
      [intInRange(rng, 9, 25), 0.41],
      [intInRange(rng, 26, 80), 0.27],
      [intInRange(rng, 81, 300), 0.1],
    ] as const);
    const team_jurisdiction = weighted(rng, TEAM_JURISDICTION_WEIGHTED);
    const incorporation =
      INCORPORATION_SUFFIXES[
        seedFromEntityId(e.entity_id) % INCORPORATION_SUFFIXES.length
      ];
    const incorporated_entity = `${e.name.split("(")[0].trim()} ${incorporation}`;
    const sectorLower = (e.sector ?? "").toLowerCase();
    const isAnonProb =
      sectorLower.includes("meme") ||
      sectorLower.includes("yield farm") ||
      sectorLower.includes("anon")
        ? 0.55
        : 0.21;
    const is_anonymous_team = rng() < isAnonProb;
    const has_disclosure_policy =
      rng() < (audits_tier_pick >= 2 ? 0.88 : 0.31);
    const incident_response_sla_hours = has_disclosure_policy
      ? ([2, 4, 12, 24, 48, 72] as const)[Math.floor(rng() * 6)]
      : null;

    await sql`
      INSERT INTO chaindrain.governance_fingerprint (
        entity_id, governance_type, governance_token_address, treasury_size_usd,
        team_size_estimate, team_jurisdiction, incorporated_entity,
        is_anonymous_team, has_security_disclosure_policy,
        incident_response_sla_hours, data_confidence
      )
      VALUES (
        ${e.entity_id}, ${governance_type}, ${governance_token_address},
        ${treasury_size_usd}, ${team_size_estimate}, ${team_jurisdiction},
        ${incorporated_entity}, ${is_anonymous_team}, ${has_disclosure_policy},
        ${incident_response_sla_hours}, ${DEMO}
      )
      ON CONFLICT (entity_id) DO UPDATE SET
        governance_type             = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.governance_type             ELSE EXCLUDED.governance_type END,
        governance_token_address    = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.governance_token_address    ELSE EXCLUDED.governance_token_address END,
        treasury_size_usd           = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.treasury_size_usd           ELSE EXCLUDED.treasury_size_usd END,
        team_size_estimate          = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.team_size_estimate          ELSE EXCLUDED.team_size_estimate END,
        team_jurisdiction           = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.team_jurisdiction           ELSE EXCLUDED.team_jurisdiction END,
        incorporated_entity         = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.incorporated_entity         ELSE EXCLUDED.incorporated_entity END,
        is_anonymous_team           = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.is_anonymous_team           ELSE EXCLUDED.is_anonymous_team END,
        has_security_disclosure_policy = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.has_security_disclosure_policy ELSE EXCLUDED.has_security_disclosure_policy END,
        incident_response_sla_hours = CASE WHEN chaindrain.governance_fingerprint.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.governance_fingerprint.incident_response_sla_hours ELSE EXCLUDED.incident_response_sla_hours END
    `;
    govUpserts++;

    // ----- 5. reputation_signal -----------------------------------------
    const slug = slugify(e.name);
    const github_repo_url = `https://github.com/${slug}/${slug}`;
    const github_velocity = weighted(rng, [
      [intInRange(rng, 0, 2), 0.18],
      [intInRange(rng, 3, 15), 0.36],
      [intInRange(rng, 16, 60), 0.34],
      [intInRange(rng, 61, 200), 0.12],
    ] as const);
    const github_contributors = 2 + Math.floor(rng() * 60);
    const github_last_security =
      rng() < 0.7
        ? deterministicTimestamp(`${e.entity_id}:secissue`, 720)
        : null;
    const twitter_handle = `@${slug}`;
    const discord_invite = `https://discord.gg/${seedFromEntityId(e.entity_id).toString(36)}`;
    const kyt_status = weighted(rng, KYT_STATUS_WEIGHTED);

    await sql`
      INSERT INTO chaindrain.reputation_signal (
        entity_id, github_repo_url, github_commit_velocity_30d,
        github_contributor_count, github_last_security_issue_date,
        twitter_handle, discord_invite, kyt_screening_status,
        data_confidence
      )
      VALUES (
        ${e.entity_id}, ${github_repo_url}, ${github_velocity},
        ${github_contributors}, ${github_last_security}::date,
        ${twitter_handle}, ${discord_invite}, ${kyt_status},
        ${DEMO}
      )
      ON CONFLICT (entity_id) DO UPDATE SET
        github_repo_url                 = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.github_repo_url                 ELSE EXCLUDED.github_repo_url END,
        github_commit_velocity_30d      = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.github_commit_velocity_30d      ELSE EXCLUDED.github_commit_velocity_30d END,
        github_contributor_count        = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.github_contributor_count        ELSE EXCLUDED.github_contributor_count END,
        github_last_security_issue_date = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.github_last_security_issue_date ELSE EXCLUDED.github_last_security_issue_date END,
        twitter_handle                  = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.twitter_handle                  ELSE EXCLUDED.twitter_handle END,
        discord_invite                  = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.discord_invite                  ELSE EXCLUDED.discord_invite END,
        kyt_screening_status            = CASE WHEN chaindrain.reputation_signal.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN chaindrain.reputation_signal.kyt_screening_status            ELSE EXCLUDED.kyt_screening_status END
    `;
    repUpserts++;
  }

  const ms = Date.now() - t0;
  console.log(
    `Layer 1 seed done in ${ms}ms — identity:${identityUpdates} cf:${cfUpdates} dep:${depUpdates} gov:${govUpserts} rep:${repUpserts}`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
