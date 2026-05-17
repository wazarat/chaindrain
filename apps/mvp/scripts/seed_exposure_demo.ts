/**
 * Layer 1 demo seeder — fills the Phase 6 Exposure Graph enrichment fields
 * deterministically per entity. Run after the 20260601000000_exposure_graph.sql
 * migration. Idempotent: re-running produces the same values; never overwrites
 * rows whose existing *_confidence is HIGH / MEDIUM / INFERRED. Real data wins.
 *
 * Performance contract (PM #12, post-rewrite):
 *   - 772-entity universe processed in ONE pass through JS,
 *   - then exactly FIVE round trips to Postgres (one bulk statement per table),
 *   - completing in 2-4s on the 6543 Supavisor transaction-mode pooler.
 *   - The prior row-by-row pattern (PM #11 draft) did 5 * 772 = ~3,860 round
 *     trips and was killed at 226s; do not regress.
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

interface IdentityPayload {
  entity_id: string;
  subsector_tags: string[];
  website_canonical: string;
  is_immutable_bool: boolean;
  is_permissionless_bool: boolean;
}

interface ContractFingerprintPayload {
  entity_id: string;
  contract_addresses: string[];
  uses_assembly_bool: boolean;
  bug_bounty_program_enum: string;
  proxy_pattern: string;
  compiler_version: string;
  audits_tier: number;
  audit_firms: string[];
  last_audit_date: string | null;
  verified_source: boolean;
  external_call_count: number;
}

interface DependencyFingerprintPayload {
  entity_id: string;
  oracle_providers: string[];
  bridge_dependencies: string[];
  stablecoin_dependencies: string[];
  lst_lrt_dependencies: string[];
  dex_liquidity_venues: string[];
  cex_listings: string[];
  custodian: string | null;
  kms_provider: string;
  rpc_provider_primary: string;
  frontend_host: string;
  npm_lockfile_sha: string;
  dvn_configuration: string | null;
}

interface GovernancePayload {
  entity_id: string;
  governance_type: string;
  governance_token_address: string | null;
  treasury_size_usd: number;
  team_size_estimate: number;
  team_jurisdiction: string;
  incorporated_entity: string;
  is_anonymous_team: boolean;
  has_security_disclosure_policy: boolean;
  incident_response_sla_hours: number | null;
}

interface ReputationPayload {
  entity_id: string;
  github_repo_url: string;
  github_commit_velocity_30d: number;
  github_contributor_count: number;
  github_last_security_issue_date: string | null;
  twitter_handle: string;
  discord_invite: string;
  kyt_screening_status: string;
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

function deterministicDate(seed: string, days: number): string {
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
  return pickN(
    rng,
    [
      "layerzero",
      "wormhole",
      "axelar",
      "ccip",
      "across",
      "hyperlane",
      "stargate",
      "native",
    ] as const,
    n,
  );
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

function buildPayloads(universe: readonly UniverseRow[]): {
  identity: IdentityPayload[];
  contract: ContractFingerprintPayload[];
  dependency: DependencyFingerprintPayload[];
  governance: GovernancePayload[];
  reputation: ReputationPayload[];
} {
  const identity: IdentityPayload[] = [];
  const contract: ContractFingerprintPayload[] = [];
  const dependency: DependencyFingerprintPayload[] = [];
  const governance: GovernancePayload[] = [];
  const reputation: ReputationPayload[] = [];

  for (const e of universe) {
    const rng = mulberry32(seedFromEntityId(e.entity_id));
    const tvl = tvlNum(e.tvl_usd);

    // ----- identity extended cols ---------------------------------------
    identity.push({
      entity_id: e.entity_id,
      subsector_tags: buildSubsectorTags(rng, e.sector),
      website_canonical: `https://www.${slugify(e.name)}.xyz`,
      is_immutable_bool: deriveBoolFromText(e.is_immutable, 0.18, rng),
      is_permissionless_bool: deriveBoolFromText(
        e.is_permissionless,
        0.74,
        rng,
      ),
    });

    // ----- contract_fingerprint extended cols + legacy backfill ---------
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
      audits_tier_pick > 0
        ? deterministicDate(`${e.entity_id}:audit`, 540)
        : null;
    const verified_source_pick = rng() < 0.91;
    const external_call_count_pick = 1 + Math.floor(rng() * 40);

    contract.push({
      entity_id: e.entity_id,
      contract_addresses: pickContractAddresses(
        rng,
        e.entity_id,
        e.primary_contract_address,
      ),
      uses_assembly_bool: rng() < 0.34,
      bug_bounty_program_enum: bugBountyEnumFromExisting(
        e.bug_bounty_program,
        rng,
      ),
      proxy_pattern: proxy,
      compiler_version,
      audits_tier: audits_tier_pick,
      audit_firms: audit_firms_pick,
      last_audit_date: last_audit_date_pick,
      verified_source: verified_source_pick,
      external_call_count: external_call_count_pick,
    });

    // Preserve a single rng draw at this position to keep the §3.3
    // distribution stable against the PM #11 reference (oracle_fallback
    // boolean was rolled here in the original draft but is now derived
    // at read time, not persisted).
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
          ]!
        : null;
    const kms_pick = weighted(rng, KMS_PROVIDER_WEIGHTED);
    const rpc_pick = weighted(rng, RPC_PROVIDER_WEIGHTED);
    const frontend_pick = weighted(rng, FRONTEND_HOST_WEIGHTED);
    const npm_lockfile_pick =
      "sha256:" + sha256Hex(`${e.entity_id}:lockfile`).slice(0, 64);
    const dvn_json = bridge_pick.includes("layerzero")
      ? dvnConfigJson(rng)
      : null;

    dependency.push({
      entity_id: e.entity_id,
      oracle_providers: oracle_pick,
      bridge_dependencies: bridge_pick,
      stablecoin_dependencies: stablecoin_pick,
      lst_lrt_dependencies: lst_pick,
      dex_liquidity_venues: dex_pick,
      cex_listings: cex_pick,
      custodian: custodian_pick,
      kms_provider: kms_pick,
      rpc_provider_primary: rpc_pick,
      frontend_host: frontend_pick,
      npm_lockfile_sha: npm_lockfile_pick,
      dvn_configuration: dvn_json,
    });

    // ----- governance_fingerprint ---------------------------------------
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
      ]!;
    const incorporated_entity = `${e.name.split("(")[0]!.trim()} ${incorporation}`;
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
      ? ([2, 4, 12, 24, 48, 72] as const)[Math.floor(rng() * 6)]!
      : null;

    governance.push({
      entity_id: e.entity_id,
      governance_type,
      governance_token_address,
      treasury_size_usd,
      team_size_estimate,
      team_jurisdiction,
      incorporated_entity,
      is_anonymous_team,
      has_security_disclosure_policy: has_disclosure_policy,
      incident_response_sla_hours,
    });

    // ----- reputation_signal --------------------------------------------
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
        ? deterministicDate(`${e.entity_id}:secissue`, 720)
        : null;
    const twitter_handle = `@${slug}`;
    const discord_invite = `https://discord.gg/${seedFromEntityId(e.entity_id).toString(36)}`;
    const kyt_status = weighted(rng, KYT_STATUS_WEIGHTED);

    reputation.push({
      entity_id: e.entity_id,
      github_repo_url,
      github_commit_velocity_30d: github_velocity,
      github_contributor_count: github_contributors,
      github_last_security_issue_date: github_last_security,
      twitter_handle,
      discord_invite,
      kyt_screening_status: kyt_status,
    });
  }

  return { identity, contract, dependency, governance, reputation };
}

async function main(): Promise<void> {
  const url = getDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });
  // Helper: cast strongly-typed payload arrays into the postgres-js JSONValue
  // shape so we can pass them through sql.json() without weakening field types.
  // The runtime expects plain JSON values; the typed payload interfaces are
  // structurally compatible but TS can't prove the index signature.
  const asJson = (value: unknown): ReturnType<typeof sql.json> =>
    sql.json(value as Parameters<typeof sql.json>[0]);
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

  const t0 = Date.now();
  const payloads = buildPayloads(universe);
  const buildMs = Date.now() - t0;
  console.log(`payloads built in ${buildMs}ms`);

  // ---------------------------------------------------------------------
  // 1. identity — UPDATE existing rows, only fill NULL columns.
  // ---------------------------------------------------------------------
  const t1 = Date.now();
  await sql`
    UPDATE chaindrain.identity AS t
    SET
      subsector_tags         = COALESCE(t.subsector_tags,         s.subsector_tags),
      website_canonical      = COALESCE(t.website_canonical,      s.website_canonical),
      is_immutable_bool      = COALESCE(t.is_immutable_bool,      s.is_immutable_bool),
      is_permissionless_bool = COALESCE(t.is_permissionless_bool, s.is_permissionless_bool)
    FROM jsonb_to_recordset(${asJson(payloads.identity)}) AS s(
      entity_id              uuid,
      subsector_tags         text[],
      website_canonical      text,
      is_immutable_bool      boolean,
      is_permissionless_bool boolean
    )
    WHERE t.entity_id = s.entity_id
  `;
  console.log(`  identity: ${payloads.identity.length} rows in ${Date.now() - t1}ms`);

  // ---------------------------------------------------------------------
  // 2. contract_fingerprint — UPDATE existing rows. COALESCE preserves any
  //    real values; only NULLs get demo fill. No *_confidence column on
  //    contract_fingerprint, so we use plain COALESCE.
  // ---------------------------------------------------------------------
  const t2 = Date.now();
  await sql`
    UPDATE chaindrain.contract_fingerprint AS t
    SET
      contract_addresses      = COALESCE(t.contract_addresses,      s.contract_addresses),
      uses_assembly_bool      = COALESCE(t.uses_assembly_bool,      s.uses_assembly_bool),
      bug_bounty_program_enum = COALESCE(t.bug_bounty_program_enum, s.bug_bounty_program_enum),
      proxy_pattern           = COALESCE(t.proxy_pattern,           s.proxy_pattern),
      compiler_version        = COALESCE(t.compiler_version,        s.compiler_version),
      verified_source         = COALESCE(t.verified_source,         s.verified_source),
      audits_tier             = COALESCE(t.audits_tier,             s.audits_tier),
      audit_firms             = COALESCE(t.audit_firms,             s.audit_firms),
      last_audit_date         = COALESCE(t.last_audit_date,         s.last_audit_date::date),
      external_call_count     = COALESCE(t.external_call_count,     s.external_call_count)
    FROM jsonb_to_recordset(${asJson(payloads.contract)}) AS s(
      entity_id               uuid,
      contract_addresses      text[],
      uses_assembly_bool      boolean,
      bug_bounty_program_enum text,
      proxy_pattern           text,
      compiler_version        text,
      audits_tier             int,
      audit_firms             text[],
      last_audit_date         text,
      verified_source         boolean,
      external_call_count     int
    )
    WHERE t.entity_id = s.entity_id
  `;
  console.log(`  contract_fingerprint: ${payloads.contract.length} rows in ${Date.now() - t2}ms`);

  // ---------------------------------------------------------------------
  // 3. dependency_fingerprint — UPDATE existing rows. Per-column confidence
  //    gate: rows whose existing *_confidence IN ('HIGH','MEDIUM','INFERRED')
  //    are preserved verbatim; otherwise COALESCE in the demo value and tag
  //    its confidence = 'DEMO'.
  // ---------------------------------------------------------------------
  const t3 = Date.now();
  await sql`
    UPDATE chaindrain.dependency_fingerprint AS t
    SET
      oracle_providers = CASE
        WHEN t.oracle_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.oracle_providers
        ELSE COALESCE(t.oracle_providers, s.oracle_providers) END,
      oracle_confidence = CASE
        WHEN t.oracle_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.oracle_confidence
        ELSE COALESCE(t.oracle_confidence, ${DEMO}) END,
      bridge_dependencies = CASE
        WHEN t.bridge_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.bridge_dependencies
        ELSE COALESCE(t.bridge_dependencies, s.bridge_dependencies) END,
      bridge_confidence = CASE
        WHEN t.bridge_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.bridge_confidence
        ELSE COALESCE(t.bridge_confidence, ${DEMO}) END,
      stablecoin_dependencies = CASE
        WHEN t.stablecoin_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.stablecoin_dependencies
        ELSE COALESCE(t.stablecoin_dependencies, s.stablecoin_dependencies) END,
      stablecoin_confidence = CASE
        WHEN t.stablecoin_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.stablecoin_confidence
        ELSE COALESCE(t.stablecoin_confidence, ${DEMO}) END,
      lst_lrt_dependencies = COALESCE(t.lst_lrt_dependencies, s.lst_lrt_dependencies),
      lst_lrt_confidence = COALESCE(t.lst_lrt_confidence, ${DEMO}),
      dex_liquidity_venues = COALESCE(t.dex_liquidity_venues, s.dex_liquidity_venues),
      dex_liquidity_venues_confidence = COALESCE(t.dex_liquidity_venues_confidence, ${DEMO}),
      cex_listings = COALESCE(t.cex_listings, s.cex_listings),
      cex_listings_confidence = COALESCE(t.cex_listings_confidence, ${DEMO}),
      custodian = COALESCE(t.custodian, s.custodian),
      custodian_confidence = COALESCE(t.custodian_confidence, ${DEMO}),
      kms_provider = COALESCE(t.kms_provider, s.kms_provider),
      kms_provider_confidence = COALESCE(t.kms_provider_confidence, ${DEMO}),
      rpc_provider_primary = COALESCE(t.rpc_provider_primary, s.rpc_provider_primary),
      rpc_provider_primary_confidence = COALESCE(t.rpc_provider_primary_confidence, ${DEMO}),
      frontend_host = COALESCE(t.frontend_host, s.frontend_host),
      frontend_host_confidence = COALESCE(t.frontend_host_confidence, ${DEMO}),
      npm_lockfile_sha = COALESCE(t.npm_lockfile_sha, s.npm_lockfile_sha),
      npm_lockfile_sha_confidence = COALESCE(t.npm_lockfile_sha_confidence, ${DEMO}),
      dvn_configuration = CASE
        WHEN t.dvn_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.dvn_configuration
        ELSE COALESCE(t.dvn_configuration, s.dvn_configuration) END,
      dvn_confidence = CASE
        WHEN t.dvn_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.dvn_confidence
        ELSE COALESCE(t.dvn_confidence, ${DEMO}) END
    FROM jsonb_to_recordset(${asJson(payloads.dependency)}) AS s(
      entity_id               uuid,
      oracle_providers        text[],
      bridge_dependencies     text[],
      stablecoin_dependencies text[],
      lst_lrt_dependencies    text[],
      dex_liquidity_venues    text[],
      cex_listings            text[],
      custodian               text,
      kms_provider            text,
      rpc_provider_primary    text,
      frontend_host           text,
      npm_lockfile_sha        text,
      dvn_configuration       text
    )
    WHERE t.entity_id = s.entity_id
  `;
  console.log(`  dependency_fingerprint: ${payloads.dependency.length} rows in ${Date.now() - t3}ms`);

  // ---------------------------------------------------------------------
  // 4. governance_fingerprint — INSERT … ON CONFLICT DO UPDATE.
  //    Whole-row gate: rows with data_confidence IN HIGH/MEDIUM/INFERRED
  //    are preserved verbatim. DEMO/NULL rows get overwritten with the
  //    deterministic re-derivation so re-running is idempotent.
  // ---------------------------------------------------------------------
  const t4 = Date.now();
  await sql`
    INSERT INTO chaindrain.governance_fingerprint AS t (
      entity_id, governance_type, governance_token_address, treasury_size_usd,
      team_size_estimate, team_jurisdiction, incorporated_entity,
      is_anonymous_team, has_security_disclosure_policy,
      incident_response_sla_hours, data_confidence
    )
    SELECT
      s.entity_id, s.governance_type, s.governance_token_address, s.treasury_size_usd,
      s.team_size_estimate, s.team_jurisdiction, s.incorporated_entity,
      s.is_anonymous_team, s.has_security_disclosure_policy,
      s.incident_response_sla_hours, ${DEMO}
    FROM jsonb_to_recordset(${asJson(payloads.governance)}) AS s(
      entity_id                       uuid,
      governance_type                 text,
      governance_token_address        text,
      treasury_size_usd               numeric,
      team_size_estimate              int,
      team_jurisdiction               text,
      incorporated_entity             text,
      is_anonymous_team               boolean,
      has_security_disclosure_policy  boolean,
      incident_response_sla_hours     int
    )
    ON CONFLICT (entity_id) DO UPDATE SET
      governance_type                = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.governance_type                ELSE EXCLUDED.governance_type END,
      governance_token_address       = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.governance_token_address       ELSE EXCLUDED.governance_token_address END,
      treasury_size_usd              = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.treasury_size_usd              ELSE EXCLUDED.treasury_size_usd END,
      team_size_estimate             = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.team_size_estimate             ELSE EXCLUDED.team_size_estimate END,
      team_jurisdiction              = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.team_jurisdiction              ELSE EXCLUDED.team_jurisdiction END,
      incorporated_entity            = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.incorporated_entity            ELSE EXCLUDED.incorporated_entity END,
      is_anonymous_team              = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.is_anonymous_team              ELSE EXCLUDED.is_anonymous_team END,
      has_security_disclosure_policy = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.has_security_disclosure_policy ELSE EXCLUDED.has_security_disclosure_policy END,
      incident_response_sla_hours    = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.incident_response_sla_hours    ELSE EXCLUDED.incident_response_sla_hours END
  `;
  console.log(`  governance_fingerprint: ${payloads.governance.length} rows in ${Date.now() - t4}ms`);

  // ---------------------------------------------------------------------
  // 5. reputation_signal — INSERT … ON CONFLICT DO UPDATE with the same
  //    whole-row confidence gate.
  // ---------------------------------------------------------------------
  const t5 = Date.now();
  await sql`
    INSERT INTO chaindrain.reputation_signal AS t (
      entity_id, github_repo_url, github_commit_velocity_30d,
      github_contributor_count, github_last_security_issue_date,
      twitter_handle, discord_invite, kyt_screening_status, data_confidence
    )
    SELECT
      s.entity_id, s.github_repo_url, s.github_commit_velocity_30d,
      s.github_contributor_count, s.github_last_security_issue_date::date,
      s.twitter_handle, s.discord_invite, s.kyt_screening_status, ${DEMO}
    FROM jsonb_to_recordset(${asJson(payloads.reputation)}) AS s(
      entity_id                       uuid,
      github_repo_url                 text,
      github_commit_velocity_30d      int,
      github_contributor_count        int,
      github_last_security_issue_date text,
      twitter_handle                  text,
      discord_invite                  text,
      kyt_screening_status            text
    )
    ON CONFLICT (entity_id) DO UPDATE SET
      github_repo_url                 = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.github_repo_url                 ELSE EXCLUDED.github_repo_url END,
      github_commit_velocity_30d      = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.github_commit_velocity_30d      ELSE EXCLUDED.github_commit_velocity_30d END,
      github_contributor_count        = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.github_contributor_count        ELSE EXCLUDED.github_contributor_count END,
      github_last_security_issue_date = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.github_last_security_issue_date ELSE EXCLUDED.github_last_security_issue_date END,
      twitter_handle                  = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.twitter_handle                  ELSE EXCLUDED.twitter_handle END,
      discord_invite                  = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.discord_invite                  ELSE EXCLUDED.discord_invite END,
      kyt_screening_status            = CASE WHEN t.data_confidence IN ('HIGH','MEDIUM','INFERRED') THEN t.kyt_screening_status            ELSE EXCLUDED.kyt_screening_status END
  `;
  console.log(`  reputation_signal: ${payloads.reputation.length} rows in ${Date.now() - t5}ms`);

  const ms = Date.now() - t0;
  console.log(`Layer 1 seed done in ${ms}ms total`);

  // Post-flight verification — counts only, no row content.
  const counts = await sql<
    {
      governance_rows: string;
      reputation_rows: string;
      identity_filled: string;
      contract_filled: string;
      dep_filled: string;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::text FROM chaindrain.governance_fingerprint)                       AS governance_rows,
      (SELECT COUNT(*)::text FROM chaindrain.reputation_signal)                            AS reputation_rows,
      (SELECT COUNT(*)::text FROM chaindrain.identity         WHERE subsector_tags IS NOT NULL) AS identity_filled,
      (SELECT COUNT(*)::text FROM chaindrain.contract_fingerprint WHERE contract_addresses IS NOT NULL) AS contract_filled,
      (SELECT COUNT(*)::text FROM chaindrain.dependency_fingerprint WHERE npm_lockfile_sha IS NOT NULL) AS dep_filled
  `;
  console.log("post-flight counts:", counts[0]);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
