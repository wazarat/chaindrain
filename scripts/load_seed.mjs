#!/usr/bin/env node
// scripts/load_seed.mjs — load 875 entities from chaindrain_export/data/entities_final.json
// into the chaindrain.* schema. Source-of-truth is the JSON; the bundled SQL has duplicates.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const envText = readFileSync(resolve(root, "apps/web/.env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.DATABASE_URL_SESSION || env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not found in apps/web/.env.local");

const dataPath = resolve(homedir(), "Downloads/chaindrain_export/data/entities_final.json");
const raw = JSON.parse(readFileSync(dataPath, "utf8"));
console.log(`loaded ${raw.length} entities from JSON`);

// Some source rows collide on entity_id because UUIDv5 normalized whitespace
// in the name. Reassign a deterministic UUID to second+ occurrences so we
// preserve all 875 distinct rows.
function deriveUuid(seed) {
  const h = createHash("sha1").update(seed).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const seen = new Set();
const entities = [];
let collisions = 0;
for (const e of raw) {
  let eid = e.entity_id;
  if (seen.has(eid)) {
    eid = deriveUuid(`${e.entity_id}|${e.name}|${e.key}`);
    collisions++;
    if (seen.has(eid)) {
      eid = deriveUuid(`${e.entity_id}|${e.name}|${e.key}|${entities.length}`);
    }
  }
  seen.add(eid);
  entities.push({ ...e, entity_id: eid });
}
console.log(`expanded to ${entities.length} unique entity_ids (${collisions} regenerated)`);

const norm = (v) => (v === undefined ? null : v);
const arr = (v) => (Array.isArray(v) ? v : []);
const bool = (v) => {
  if (v === true || v === "TRUE" || v === "true") return "TRUE";
  if (v === false || v === "FALSE" || v === "false") return "FALSE";
  return null;
};

const sql = postgres(url, { max: 1, prepare: false });

console.log("connecting...");
await sql`select 1 as ok`;

console.log("clearing chaindrain.* (cascade)...");
await sql`truncate chaindrain.identity restart identity cascade`;

const t0 = Date.now();

// 1. identity
console.log("inserting identity...");
const identityRows = entities.map((e) => ({
  entity_id: e.entity_id,
  name: e.name,
  website: norm(e.website),
  sector: norm(e.sector),
  chain_deployments: arr(e.chain_deployments),
  tvl_usd: norm(e.tvl_usd),
  launch_date: norm(e.launch_date),
  is_immutable: bool(e.is_immutable),
  is_permissionless: bool(e.is_permissionless),
  defillama_slug: norm(e.defillama_slug),
  coingecko_id: norm(e.coingecko_id),
  match_source: norm(e.match_source),
  match_method: norm(e.match_method),
}));
for (let i = 0; i < identityRows.length; i += 200) {
  const batch = identityRows.slice(i, i + 200);
  await sql`insert into chaindrain.identity ${sql(
    batch,
    "entity_id",
    "name",
    "website",
    "sector",
    "chain_deployments",
    "tvl_usd",
    "launch_date",
    "is_immutable",
    "is_permissionless",
    "defillama_slug",
    "coingecko_id",
    "match_source",
    "match_method"
  )}`;
}
console.log(`  identity: ${identityRows.length} rows`);

// 2. contract_fingerprint
console.log("inserting contract_fingerprint...");
const cfRows = entities.map((e) => ({
  entity_id: e.entity_id,
  primary_contract_address: norm(e.primary_contract_address),
  implementation_address: norm(e.implementation_address),
  proxy_pattern: norm(e.proxy_pattern),
  upgrade_authority_type: norm(e.upgrade_authority_type),
  admin_address: norm(e.admin_address),
  multisig_threshold: norm(e.multisig_threshold),
  timelock_delay_hours: norm(e.timelock_delay_hours),
  compiler_version: norm(e.compiler_version),
  verified_source: norm(e.verified_source),
  uses_assembly: norm(e.uses_assembly),
  external_call_count: norm(e.external_call_count),
  audits_tier: norm(e.audits_tier),
  audit_firms: arr(e.audit_firms),
  last_audit_date: norm(e.last_audit_date),
  audit_links:
    e.audit_links == null
      ? null
      : typeof e.audit_links === "string"
        ? e.audit_links
        : JSON.stringify(e.audit_links),
  bug_bounty_program: norm(e.bug_bounty_program),
  bug_bounty_max_payout_usd: norm(e.bug_bounty_max_payout_usd),
  bug_bounty_immunefi_url: norm(e.bug_bounty_immunefi_url),
  bug_bounty_launch_date: norm(e.bug_bounty_launch_date),
  bug_bounty_updated_date: norm(e.bug_bounty_updated_date),
  bug_bounty_kyc_required: norm(e.bug_bounty_kyc_required),
}));
for (let i = 0; i < cfRows.length; i += 200) {
  const batch = cfRows.slice(i, i + 200);
  await sql`insert into chaindrain.contract_fingerprint ${sql(
    batch,
    "entity_id",
    "primary_contract_address",
    "implementation_address",
    "proxy_pattern",
    "upgrade_authority_type",
    "admin_address",
    "multisig_threshold",
    "timelock_delay_hours",
    "compiler_version",
    "verified_source",
    "uses_assembly",
    "external_call_count",
    "audits_tier",
    "audit_firms",
    "last_audit_date",
    "audit_links",
    "bug_bounty_program",
    "bug_bounty_max_payout_usd",
    "bug_bounty_immunefi_url",
    "bug_bounty_launch_date",
    "bug_bounty_updated_date",
    "bug_bounty_kyc_required"
  )}`;
}
console.log(`  contract_fingerprint: ${cfRows.length} rows`);

// 3. dependency_fingerprint
console.log("inserting dependency_fingerprint...");
const dfRows = entities.map((e) => ({
  entity_id: e.entity_id,
  oracle_providers: arr(e.oracle_providers),
  oracle_confidence: norm(e.oracle_confidence),
  bridge_dependencies: arr(e.bridge_dependencies),
  bridge_confidence: norm(e.bridge_confidence),
  stablecoin_dependencies: arr(e.stablecoin_dependencies),
  stablecoin_confidence: norm(e.stablecoin_confidence),
  dvn_configuration: norm(e.dvn_configuration),
  dvn_confidence: norm(e.dvn_confidence),
  dependency_sources:
    e.dependency_sources == null
      ? null
      : typeof e.dependency_sources === "string"
        ? e.dependency_sources
        : JSON.stringify(e.dependency_sources),
}));
for (let i = 0; i < dfRows.length; i += 200) {
  const batch = dfRows.slice(i, i + 200);
  await sql`insert into chaindrain.dependency_fingerprint ${sql(
    batch,
    "entity_id",
    "oracle_providers",
    "oracle_confidence",
    "bridge_dependencies",
    "bridge_confidence",
    "stablecoin_dependencies",
    "stablecoin_confidence",
    "dvn_configuration",
    "dvn_confidence",
    "dependency_sources"
  )}`;
}
console.log(`  dependency_fingerprint: ${dfRows.length} rows`);

// 4. tier_state — risk_score, risk_tier, coverage_tier are NOT NULL in schema
console.log("inserting tier_state...");
const tsRows = entities.map((e) => ({
  entity_id: e.entity_id,
  risk_score: e.risk_score == null ? 0 : e.risk_score,
  risk_tier: e.risk_tier ?? "low",
  coverage_tier: e.coverage_tier ?? "excluded",
  tvl_factor: norm(e.tvl_factor),
  mutability_factor: norm(e.mutability_factor),
  audit_factor: norm(e.audit_factor),
  bounty_factor: norm(e.bounty_factor),
  blast_radius_usd: norm(e.blast_radius_usd),
  state: e.state ?? "active",
  last_state_change: norm(e.last_state_change),
}));
for (let i = 0; i < tsRows.length; i += 200) {
  const batch = tsRows.slice(i, i + 200);
  await sql`insert into chaindrain.tier_state ${sql(
    batch,
    "entity_id",
    "risk_score",
    "risk_tier",
    "coverage_tier",
    "tvl_factor",
    "mutability_factor",
    "audit_factor",
    "bounty_factor",
    "blast_radius_usd",
    "state",
    "last_state_change"
  )}`;
}
console.log(`  tier_state: ${tsRows.length} rows`);

const ms = Date.now() - t0;
console.log(`seed applied in ${ms}ms`);

const counts = await sql`
  select 'identity' as t, count(*)::int as n from chaindrain.identity
  union all select 'contract_fingerprint', count(*) from chaindrain.contract_fingerprint
  union all select 'dependency_fingerprint', count(*) from chaindrain.dependency_fingerprint
  union all select 'tier_state', count(*) from chaindrain.tier_state
  union all select 'mvp_master', count(*) from chaindrain.mvp_master
`;
console.table(counts);

const top = await sql`
  select name, risk_score, risk_tier
  from chaindrain.mvp_master
  order by risk_score desc nulls last
  limit 5
`;
console.log("top 5 by risk_score:");
console.table(top);

await sql.end();
