import { unstable_cache } from "next/cache";
import { sql } from "./index";
import {
  ARRAY_DEPENDENCY_FIELDS,
  type AlertSeverity,
  type AlertSignalType,
  type DependencyField,
} from "../pollers/types";
import type { AdminWatchEntity } from "../pollers/admin-tx";

export const CACHE_TAG_KPIS = "kpis";
export const CACHE_TAG_FILTER_OPTIONS = "filter-options";
export const CACHE_TAG_ENTITIES = "entities";
export const CACHE_TAG_ALERTS = "alerts";
// Phase 6 — Exposure Graph
export const CACHE_TAG_EXPOSURE_LAYER1 = "exposure:layer1";
export const CACHE_TAG_EXPOSURE_INCIDENTS = "exposure:incidents";
export const CACHE_TAG_EXPOSURE_SIMILARITY = "exposure:similarity";

export type { AlertSeverity, AlertSignalType, DependencyField } from "../pollers/types";

export type RiskTier = "critical" | "high" | "medium" | "low";
export type CoverageTier = "core" | "monitored" | "archive" | "excluded";

export type SortField =
  | "risk_score"
  | "tvl_usd"
  | "blast_radius_usd"
  | "name"
  | "sector"
  | "risk_tier"
  | "coverage_tier";

export type SortDirection = "asc" | "desc";

export interface EntityFilters {
  sectors?: string[];
  riskTiers?: RiskTier[];
  coverageTiers?: CoverageTier[];
  oracles?: string[];
  chains?: string[];
  bridges?: string[];
  search?: string;
}

export interface EntityListOptions {
  filters: EntityFilters;
  sortField: SortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface EntityRow {
  entity_id: string;
  name: string;
  sector: string | null;
  tvl_usd: string | null;
  risk_score: string | null;
  risk_tier: string | null;
  coverage_tier: string | null;
  blast_radius_usd: string | null;
  oracle_providers: string[] | null;
  bridge_dependencies: string[] | null;
  stablecoin_dependencies: string[] | null;
  chain_deployments: string[] | null;
  state: string | null;
}

export interface EntityDetail extends EntityRow {
  website: string | null;
  launch_date: string | null;
  is_immutable: string | null;
  is_permissionless: string | null;
  defillama_slug: string | null;
  coingecko_id: string | null;
  primary_contract_address: string | null;
  implementation_address: string | null;
  proxy_pattern: string | null;
  upgrade_authority_type: string | null;
  admin_address: string | null;
  multisig_threshold: number | null;
  timelock_delay_hours: string | null;
  compiler_version: string | null;
  verified_source: boolean | null;
  uses_assembly: boolean | null;
  external_call_count: number | null;
  audits_tier: number | null;
  audit_firms: string[] | null;
  last_audit_date: string | null;
  audit_links: string | null;
  bug_bounty_program: string | null;
  bug_bounty_max_payout_usd: string | null;
  bug_bounty_immunefi_url: string | null;
  oracle_confidence: string | null;
  bridge_confidence: string | null;
  stablecoin_confidence: string | null;
  dvn_configuration: string | null;
  dvn_confidence: string | null;
  dependency_sources: string | null;
  tvl_factor: string | null;
  mutability_factor: string | null;
  audit_factor: string | null;
  bounty_factor: string | null;
  last_state_change: string | null;
}

export interface KpiSummary {
  total_entities: number;
  critical_count: number;
  high_count: number;
  total_tvl_usd: string;
  total_blast_radius_usd: string;
  alerts_24h: number;
  alerts_24h_critical: number;
}

export interface FilterOptions {
  sectors: string[];
  risk_tiers: string[];
  coverage_tiers: string[];
  oracles: string[];
  chains: string[];
  bridges: string[];
}

export interface EntityListResult {
  rows: EntityRow[];
  total: number;
  page: number;
  pageSize: number;
}

const SORTABLE: Record<SortField, string> = {
  risk_score: "risk_score",
  tvl_usd: "tvl_usd",
  blast_radius_usd: "blast_radius_usd",
  name: "name",
  sector: "sector",
  risk_tier: "risk_tier",
  coverage_tier: "coverage_tier",
};

export async function countIdentities(): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM chaindrain.identity
  `;
  return Number(rows[0]?.count ?? 0);
}

export const getKpiSummaryCached = unstable_cache(
  async (): Promise<KpiSummary> => getKpiSummary(),
  ["kpi-summary-v2"],
  { revalidate: 30, tags: [CACHE_TAG_KPIS, CACHE_TAG_ALERTS] },
);

export async function getKpiSummary(): Promise<KpiSummary> {
  const [entityRow, alertRow] = await Promise.all([
    sql<
      {
        total_entities: string;
        critical_count: string;
        high_count: string;
        total_tvl_usd: string | null;
        total_blast_radius_usd: string | null;
      }[]
    >`
      SELECT
        COUNT(*)::text                                                    AS total_entities,
        COUNT(*) FILTER (WHERE risk_tier = 'critical')::text              AS critical_count,
        COUNT(*) FILTER (WHERE risk_tier = 'high')::text                  AS high_count,
        COALESCE(SUM(tvl_usd), 0)::text                                   AS total_tvl_usd,
        COALESCE(SUM(blast_radius_usd), 0)::text                          AS total_blast_radius_usd
      FROM chaindrain.mvp_master_dedup
    `,
    sql<{ total: string; critical: string }[]>`
      SELECT
        COUNT(*)::text                                                AS total,
        COUNT(*) FILTER (WHERE severity = 'critical')::text           AS critical
      FROM chaindrain.alert
      WHERE detected_at >= now() - INTERVAL '24 hours'
    `,
  ]);

  const r = entityRow[0];
  const a = alertRow[0];
  return {
    total_entities: Number(r?.total_entities ?? 0),
    critical_count: Number(r?.critical_count ?? 0),
    high_count: Number(r?.high_count ?? 0),
    total_tvl_usd: r?.total_tvl_usd ?? "0",
    total_blast_radius_usd: r?.total_blast_radius_usd ?? "0",
    alerts_24h: Number(a?.total ?? 0),
    alerts_24h_critical: Number(a?.critical ?? 0),
  };
}

export const getFilterOptionsCached = unstable_cache(
  async (): Promise<FilterOptions> => getFilterOptions(),
  ["filter-options-v2"],
  { revalidate: 3600, tags: [CACHE_TAG_FILTER_OPTIONS] },
);

export async function getFilterOptions(): Promise<FilterOptions> {
  const [sectors, oracles, chains, bridges] = await Promise.all([
    sql<{ v: string }[]>`
      SELECT DISTINCT sector AS v
      FROM chaindrain.identity
      WHERE sector IS NOT NULL
      ORDER BY 1
    `,
    sql<{ v: string }[]>`
      SELECT DISTINCT unnest(oracle_providers) AS v
      FROM chaindrain.dependency_fingerprint
      WHERE oracle_providers IS NOT NULL
      ORDER BY 1
    `,
    sql<{ v: string }[]>`
      SELECT chain AS v
      FROM (
        SELECT unnest(chain_deployments) AS chain
        FROM chaindrain.identity
        WHERE chain_deployments IS NOT NULL
      ) s
      GROUP BY chain
      ORDER BY COUNT(*) DESC, chain ASC
    `,
    sql<{ v: string }[]>`
      SELECT DISTINCT unnest(bridge_dependencies) AS v
      FROM chaindrain.dependency_fingerprint
      WHERE bridge_dependencies IS NOT NULL
      ORDER BY 1
    `,
  ]);

  return {
    sectors: sectors.map((r) => r.v),
    risk_tiers: ["critical", "high", "medium", "low"],
    coverage_tiers: ["core", "monitored", "archive", "excluded"],
    oracles: oracles.map((r) => r.v),
    chains: chains.map((r) => r.v),
    bridges: bridges.map((r) => r.v),
  };
}

function buildWhereClause(filters: EntityFilters) {
  const clauses: ReturnType<typeof sql>[] = [];

  if (filters.sectors && filters.sectors.length > 0) {
    clauses.push(sql`sector = ANY(${filters.sectors}::text[])`);
  }
  if (filters.riskTiers && filters.riskTiers.length > 0) {
    clauses.push(sql`risk_tier = ANY(${filters.riskTiers}::text[])`);
  }
  if (filters.coverageTiers && filters.coverageTiers.length > 0) {
    clauses.push(sql`coverage_tier = ANY(${filters.coverageTiers}::text[])`);
  }
  if (filters.oracles && filters.oracles.length > 0) {
    clauses.push(sql`oracle_providers && ${filters.oracles}::text[]`);
  }
  if (filters.chains && filters.chains.length > 0) {
    clauses.push(sql`chain_deployments && ${filters.chains}::text[]`);
  }
  if (filters.bridges && filters.bridges.length > 0) {
    clauses.push(sql`bridge_dependencies && ${filters.bridges}::text[]`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    clauses.push(sql`name ILIKE ${term}`);
  }

  if (clauses.length === 0) return sql``;

  let combined = sql`WHERE ${clauses[0]}`;
  for (let i = 1; i < clauses.length; i++) {
    combined = sql`${combined} AND ${clauses[i]}`;
  }
  return combined;
}

export const getEntitiesCached = unstable_cache(
  async (options: EntityListOptions): Promise<EntityListResult> =>
    getEntities(options),
  ["entities-v2"],
  { revalidate: 30, tags: [CACHE_TAG_ENTITIES] },
);

export async function getEntities(
  options: EntityListOptions,
): Promise<EntityListResult> {
  const { filters, sortField, sortDirection, page, pageSize } = options;
  const safeField = SORTABLE[sortField] ?? "risk_score";
  const safeDirection: "ASC" | "DESC" =
    sortDirection.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const where = buildWhereClause(filters);

  const orderBy =
    safeDirection === "DESC"
      ? sql`ORDER BY ${sql(safeField)} DESC NULLS LAST, name ASC`
      : sql`ORDER BY ${sql(safeField)} ASC NULLS LAST, name ASC`;

  const rows = await sql<EntityRow[]>`
    SELECT
      entity_id,
      name,
      sector,
      tvl_usd,
      risk_score,
      risk_tier,
      coverage_tier,
      blast_radius_usd,
      oracle_providers,
      bridge_dependencies,
      stablecoin_dependencies,
      chain_deployments,
      state
    FROM chaindrain.mvp_master_dedup
    ${where}
    ${orderBy}
    LIMIT ${safePageSize}
    OFFSET ${offset}
  `;

  const totalRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM chaindrain.mvp_master_dedup
    ${where}
  `;

  return {
    rows,
    total: Number(totalRows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}

export const getEntityByIdCached = unstable_cache(
  async (entityId: string): Promise<EntityDetail | null> =>
    getEntityById(entityId),
  ["entity-by-id-v2"],
  { revalidate: 60, tags: [CACHE_TAG_ENTITIES] },
);

export async function getEntityById(
  entityId: string,
): Promise<EntityDetail | null> {
  const rows = await sql<EntityDetail[]>`
    SELECT *
    FROM chaindrain.mvp_master_dedup
    WHERE entity_id = ${entityId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface AlertInsert {
  signal_type: AlertSignalType;
  severity: AlertSeverity;
  dependency_key: string;
  dependency_field: DependencyField;
  raw_signal: Record<string, unknown>;
  fanout_count: number;
  fanout_tvl_usd: string | number;
}

export interface AlertRow extends AlertInsert {
  alert_id: string;
  detected_at: string;
}

export async function insertAlert(alert: AlertInsert): Promise<AlertRow> {
  const rawSignal = JSON.stringify(alert.raw_signal);
  const rows = await sql<AlertRow[]>`
    INSERT INTO chaindrain.alert
      (signal_type, severity, dependency_key, dependency_field,
       raw_signal, fanout_count, fanout_tvl_usd)
    VALUES
      (${alert.signal_type}, ${alert.severity}, ${alert.dependency_key},
       ${alert.dependency_field},
       ${rawSignal}::jsonb,
       ${alert.fanout_count}, ${alert.fanout_tvl_usd})
    RETURNING alert_id, detected_at,
              signal_type, severity, dependency_key, dependency_field,
              raw_signal, fanout_count, fanout_tvl_usd
  `;
  return rows[0]!;
}

export interface FanoutResult {
  fanout_count: number;
  fanout_tvl_usd: string;
}

export async function computeFanout(
  dependency_field: DependencyField,
  dependency_key: string,
): Promise<FanoutResult> {
  let rows: { count: string; tvl: string | null }[];
  if (ARRAY_DEPENDENCY_FIELDS.has(dependency_field)) {
    rows = await sql<{ count: string; tvl: string | null }[]>`
      SELECT COUNT(*)::text AS count,
             COALESCE(SUM(blast_radius_usd), 0)::text AS tvl
      FROM chaindrain.mvp_master_dedup
      WHERE ${sql(dependency_field)} && ARRAY[${dependency_key}]::text[]
    `;
  } else {
    rows = await sql<{ count: string; tvl: string | null }[]>`
      SELECT COUNT(*)::text AS count,
             COALESCE(SUM(blast_radius_usd), 0)::text AS tvl
      FROM chaindrain.mvp_master_dedup
      WHERE ${sql(dependency_field)} = ${dependency_key}
    `;
  }
  const row = rows[0];
  return {
    fanout_count: Number(row?.count ?? 0),
    fanout_tvl_usd: row?.tvl ?? "0",
  };
}

export async function getTopAdminWatchEntities(
  limit: number,
): Promise<AdminWatchEntity[]> {
  const rows = await sql<
    {
      entity_id: string;
      name: string;
      admin_address: string;
      upgrade_authority_type: string | null;
    }[]
  >`
    SELECT entity_id, name, admin_address, upgrade_authority_type
    FROM chaindrain.mvp_master_dedup
    WHERE admin_address IS NOT NULL
      AND admin_address ~ '^0x[0-9a-fA-F]{40}$'
    ORDER BY risk_score DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    entity_id: r.entity_id,
    name: r.name,
    admin_address: r.admin_address,
    upgrade_authority_type: r.upgrade_authority_type,
  }));
}

export async function getWatchedDefillamaSlugs(): Promise<string[]> {
  const rows = await sql<{ defillama_slug: string }[]>`
    SELECT DISTINCT defillama_slug
    FROM chaindrain.mvp_master_dedup
    WHERE defillama_slug IS NOT NULL AND defillama_slug <> ''
  `;
  return rows.map((r) => r.defillama_slug);
}

export async function getRecentAlertCount(
  windowHours: number,
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM chaindrain.alert
    WHERE detected_at >= now() - (${windowHours}::int * INTERVAL '1 hour')
  `;
  return Number(rows[0]?.count ?? 0);
}

export type AlertSortField =
  | "detected_at"
  | "severity"
  | "fanout_tvl_usd"
  | "fanout_count";

export interface AlertListOptions {
  windowDays: number;
  signalTypes?: AlertSignalType[];
  severities?: AlertSeverity[];
  sortField: AlertSortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface AlertListResult {
  rows: AlertRow[];
  total: number;
  page: number;
  pageSize: number;
}

const ALERT_SORTABLE: Record<AlertSortField, string> = {
  detected_at: "detected_at",
  severity:
    "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END",
  fanout_tvl_usd: "fanout_tvl_usd",
  fanout_count: "fanout_count",
};

function buildAlertWhere(opts: {
  windowDays: number;
  signalTypes?: AlertSignalType[];
  severities?: AlertSeverity[];
}) {
  const clauses: ReturnType<typeof sql>[] = [];
  clauses.push(
    sql`detected_at >= now() - (${opts.windowDays}::int * INTERVAL '1 day')`,
  );
  if (opts.signalTypes && opts.signalTypes.length > 0) {
    clauses.push(sql`signal_type = ANY(${opts.signalTypes}::text[])`);
  }
  if (opts.severities && opts.severities.length > 0) {
    clauses.push(sql`severity = ANY(${opts.severities}::text[])`);
  }
  let combined = sql`WHERE ${clauses[0]}`;
  for (let i = 1; i < clauses.length; i++) {
    combined = sql`${combined} AND ${clauses[i]}`;
  }
  return combined;
}

export const listAlertsCached = unstable_cache(
  async (options: AlertListOptions): Promise<AlertListResult> =>
    listAlerts(options),
  ["list-alerts-v1"],
  { revalidate: 30, tags: [CACHE_TAG_ALERTS] },
);

export async function listAlerts(
  options: AlertListOptions,
): Promise<AlertListResult> {
  const {
    windowDays,
    signalTypes,
    severities,
    sortField,
    sortDirection,
    page,
    pageSize,
  } = options;
  const sortExpr = ALERT_SORTABLE[sortField] ?? ALERT_SORTABLE.detected_at;
  const safeDirection: "ASC" | "DESC" =
    sortDirection.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const where = buildAlertWhere({ windowDays, signalTypes, severities });

  const orderBy =
    safeDirection === "DESC"
      ? sql`ORDER BY ${sql.unsafe(sortExpr)} DESC NULLS LAST, detected_at DESC`
      : sql`ORDER BY ${sql.unsafe(sortExpr)} ASC NULLS LAST, detected_at DESC`;

  const rows = await sql<AlertRow[]>`
    SELECT alert_id, detected_at,
           signal_type, severity, dependency_key, dependency_field,
           raw_signal, fanout_count, fanout_tvl_usd
    FROM chaindrain.alert
    ${where}
    ${orderBy}
    LIMIT ${safePageSize}
    OFFSET ${offset}
  `;

  const totalRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM chaindrain.alert
    ${where}
  `;

  return {
    rows,
    total: Number(totalRows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}

export const getAlertByIdCached = unstable_cache(
  async (alertId: string): Promise<AlertRow | null> => getAlertById(alertId),
  ["alert-by-id-v1"],
  { revalidate: 300, tags: [CACHE_TAG_ALERTS] },
);

export async function getAlertById(alertId: string): Promise<AlertRow | null> {
  const rows = await sql<AlertRow[]>`
    SELECT alert_id, detected_at,
           signal_type, severity, dependency_key, dependency_field,
           raw_signal, fanout_count, fanout_tvl_usd
    FROM chaindrain.alert
    WHERE alert_id = ${alertId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface AffectedEntityRow extends EntityRow {
  defillama_slug: string | null;
  admin_address: string | null;
}

export const getAffectedEntitiesCached = unstable_cache(
  async (
    dependency_field: DependencyField,
    dependency_key: string,
    options: { limit?: number } = {},
  ): Promise<AffectedEntityRow[]> =>
    getAffectedEntities(dependency_field, dependency_key, options),
  ["affected-entities-v2"],
  { revalidate: 60, tags: [CACHE_TAG_ENTITIES, CACHE_TAG_ALERTS] },
);

export async function getAffectedEntities(
  dependency_field: DependencyField,
  dependency_key: string,
  options: { limit?: number } = {},
): Promise<AffectedEntityRow[]> {
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));
  if (ARRAY_DEPENDENCY_FIELDS.has(dependency_field)) {
    return await sql<AffectedEntityRow[]>`
      SELECT
        entity_id, name, sector, tvl_usd, risk_score, risk_tier, coverage_tier,
        blast_radius_usd, oracle_providers, bridge_dependencies,
        stablecoin_dependencies, chain_deployments, state,
        defillama_slug, admin_address
      FROM chaindrain.mvp_master_dedup
      WHERE ${sql(dependency_field)} && ARRAY[${dependency_key}]::text[]
      ORDER BY blast_radius_usd DESC NULLS LAST, risk_score DESC NULLS LAST, name ASC
      LIMIT ${limit}
    `;
  }
  return await sql<AffectedEntityRow[]>`
    SELECT
      entity_id, name, sector, tvl_usd, risk_score, risk_tier, coverage_tier,
      blast_radius_usd, oracle_providers, bridge_dependencies,
      stablecoin_dependencies, chain_deployments, state,
      defillama_slug, admin_address
    FROM chaindrain.mvp_master_dedup
    WHERE ${sql(dependency_field)} = ${dependency_key}
    ORDER BY blast_radius_usd DESC NULLS LAST, risk_score DESC NULLS LAST, name ASC
    LIMIT ${limit}
  `;
}

export type SimilarExposureField =
  | "oracle_providers"
  | "bridge_dependencies"
  | "stablecoin_dependencies";

export const SIMILAR_VIA_FIELDS: ReadonlySet<SimilarExposureField> = new Set([
  "oracle_providers",
  "bridge_dependencies",
  "stablecoin_dependencies",
]);

export function defaultSimilarVia(
  dependency_field: DependencyField,
): SimilarExposureField {
  if (dependency_field === "oracle_providers") return "stablecoin_dependencies";
  return "oracle_providers";
}

export interface SimilarExposureRow {
  entity_id: string;
  name: string;
  sector: string | null;
  tvl_usd: string | null;
  risk_score: string | null;
  risk_tier: string | null;
  blast_radius_usd: string | null;
  overlap_score: number;
  overlap_members: string[];
}

export const getSimilarExposureCached = unstable_cache(
  async (
    dependency_field: DependencyField,
    dependency_key: string,
    options: { similarVia?: SimilarExposureField; limit?: number } = {},
  ): Promise<SimilarExposureRow[]> =>
    getSimilarExposure(dependency_field, dependency_key, options),
  ["similar-exposure-v2"],
  { revalidate: 300, tags: [CACHE_TAG_ENTITIES, CACHE_TAG_ALERTS] },
);

export async function getSimilarExposure(
  dependency_field: DependencyField,
  dependency_key: string,
  options: { similarVia?: SimilarExposureField; limit?: number } = {},
): Promise<SimilarExposureRow[]> {
  const similarVia =
    options.similarVia && SIMILAR_VIA_FIELDS.has(options.similarVia)
      ? options.similarVia
      : defaultSimilarVia(dependency_field);
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  const isArrayField = ARRAY_DEPENDENCY_FIELDS.has(dependency_field);

  if (similarVia === dependency_field) {
    return [];
  }

  type Row = {
    entity_id: string;
    name: string;
    sector: string | null;
    tvl_usd: string | null;
    risk_score: string | null;
    risk_tier: string | null;
    blast_radius_usd: string | null;
    overlap_score: string;
    overlap_members: string[];
  };

  const affectedPredicate = isArrayField
    ? sql`${sql(dependency_field)} && ARRAY[${dependency_key}]::text[]`
    : sql`${sql(dependency_field)} = ${dependency_key}`;

  const notAffectedPredicate = isArrayField
    ? sql`NOT (e.${sql(dependency_field)} && ARRAY[${dependency_key}]::text[])`
    : sql`e.${sql(dependency_field)} IS DISTINCT FROM ${dependency_key}`;

  const rows = await sql<Row[]>`
    WITH affected AS (
      SELECT ${sql(similarVia)} AS via_arr
      FROM chaindrain.mvp_master_dedup
      WHERE ${affectedPredicate}
        AND ${sql(similarVia)} IS NOT NULL
    ),
    exposure AS (
      SELECT DISTINCT member
      FROM affected, unnest(via_arr) AS member
      WHERE member IS NOT NULL AND member <> ''
    ),
    exposure_arr AS (
      SELECT COALESCE(array_agg(member), ARRAY[]::text[]) AS members
      FROM exposure
    )
    SELECT
      e.entity_id,
      e.name,
      e.sector,
      e.tvl_usd,
      e.risk_score,
      e.risk_tier,
      e.blast_radius_usd,
      (
        SELECT count(*)::text
        FROM unnest(e.${sql(similarVia)}) m
        WHERE m IN (SELECT member FROM exposure)
      ) AS overlap_score,
      (
        SELECT COALESCE(array_agg(DISTINCT m), ARRAY[]::text[])
        FROM unnest(e.${sql(similarVia)}) m
        WHERE m IN (SELECT member FROM exposure)
      ) AS overlap_members
    FROM chaindrain.mvp_master_dedup e
    WHERE ${notAffectedPredicate}
      AND e.${sql(similarVia)} && (SELECT members FROM exposure_arr)
      AND EXISTS (SELECT 1 FROM exposure)
    ORDER BY overlap_score DESC NULLS LAST,
             e.blast_radius_usd DESC NULLS LAST,
             e.risk_score DESC NULLS LAST,
             e.name ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    entity_id: r.entity_id,
    name: r.name,
    sector: r.sector,
    tvl_usd: r.tvl_usd,
    risk_score: r.risk_score,
    risk_tier: r.risk_tier,
    blast_radius_usd: r.blast_radius_usd,
    overlap_score: Number(r.overlap_score ?? 0),
    overlap_members: r.overlap_members ?? [],
  }));
}

// ===========================================================================
// Phase 6 — Exposure Graph (Layer 1 enrichment + Incident Ledger + Similarity)
// Universe selector: chaindrain.mvp_master_dedup (772 rows) per DECISIONS §27.
// All read sides have `*Cached` siblings wrapped in `unstable_cache` per
// DECISIONS §25; seeders + tests still call the raw uncached variants.
// ===========================================================================

export type ExposureSortField =
  | "name"
  | "sector"
  | "risk_score"
  | "tvl_usd"
  | "blast_radius_usd"
  | "historical_incidents"
  | "top_twin_score";

export interface ExposureFilters {
  sectors?: string[];
  riskTiers?: RiskTier[];
  coverageTiers?: CoverageTier[];
  hasIncidentHistory?: boolean;
  rootCauseExposure?: string[];
  search?: string;
}

export interface ExposureListOptions {
  filters: ExposureFilters;
  sortField: ExposureSortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface ExposureEntityRow {
  entity_id: string;
  name: string;
  sector: string | null;
  tvl_usd: string | null;
  risk_score: string | null;
  risk_tier: string | null;
  coverage_tier: string | null;
  blast_radius_usd: string | null;
  state: string | null;
  chain_deployments: string[] | null;
  oracle_providers: string[] | null;
  bridge_dependencies: string[] | null;
  historical_incidents: number;
  top_twin_entity_id: string | null;
  top_twin_name: string | null;
  top_twin_ensemble: string | null;
}

export interface ExposureListResult {
  rows: ExposureEntityRow[];
  total: number;
  page: number;
  pageSize: number;
}

const EXPOSURE_SORTABLE: Record<ExposureSortField, string> = {
  name: "u.name",
  sector: "u.sector",
  risk_score: "u.risk_score",
  tvl_usd: "u.tvl_usd",
  blast_radius_usd: "u.blast_radius_usd",
  historical_incidents: "historical_incidents",
  top_twin_score: "top_twin_ensemble",
};

export const listExposureEntitiesCached = unstable_cache(
  async (options: ExposureListOptions): Promise<ExposureListResult> =>
    listExposureEntities(options),
  ["exposure-entities-v1"],
  {
    revalidate: 60,
    tags: [CACHE_TAG_EXPOSURE_LAYER1, CACHE_TAG_EXPOSURE_INCIDENTS, CACHE_TAG_EXPOSURE_SIMILARITY],
  },
);

export async function listExposureEntities(
  options: ExposureListOptions,
): Promise<ExposureListResult> {
  const { filters, sortField, sortDirection, page, pageSize } = options;
  const sortExpr =
    EXPOSURE_SORTABLE[sortField] ?? EXPOSURE_SORTABLE.risk_score;
  const safeDirection: "ASC" | "DESC" =
    sortDirection.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const clauses: ReturnType<typeof sql>[] = [];
  if (filters.sectors && filters.sectors.length > 0) {
    clauses.push(sql`u.sector = ANY(${filters.sectors}::text[])`);
  }
  if (filters.riskTiers && filters.riskTiers.length > 0) {
    clauses.push(sql`u.risk_tier = ANY(${filters.riskTiers}::text[])`);
  }
  if (filters.coverageTiers && filters.coverageTiers.length > 0) {
    clauses.push(sql`u.coverage_tier = ANY(${filters.coverageTiers}::text[])`);
  }
  if (filters.hasIncidentHistory === true) {
    clauses.push(sql`historical_incidents > 0`);
  } else if (filters.hasIncidentHistory === false) {
    clauses.push(sql`historical_incidents = 0`);
  }
  if (filters.rootCauseExposure && filters.rootCauseExposure.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM chaindrain.incident i
      WHERE i.root_cause = ANY(${filters.rootCauseExposure}::text[])
        AND u.entity_id = ANY(i.victim_entity_ids)
    )`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    clauses.push(sql`u.name ILIKE ${term}`);
  }

  let where = sql``;
  if (clauses.length > 0) {
    where = sql`WHERE ${clauses[0]}`;
    for (let i = 1; i < clauses.length; i++) {
      where = sql`${where} AND ${clauses[i]}`;
    }
  }

  const orderBy =
    safeDirection === "DESC"
      ? sql`ORDER BY ${sql.unsafe(sortExpr)} DESC NULLS LAST, u.name ASC`
      : sql`ORDER BY ${sql.unsafe(sortExpr)} ASC NULLS LAST, u.name ASC`;

  const rows = await sql<ExposureEntityRow[]>`
    WITH base AS (
      SELECT
        u.entity_id, u.name, u.sector, u.tvl_usd, u.risk_score, u.risk_tier,
        u.coverage_tier, u.blast_radius_usd, u.state, u.chain_deployments,
        u.oracle_providers, u.bridge_dependencies,
        COALESCE((
          SELECT COUNT(*)
          FROM chaindrain.incident i
          WHERE u.entity_id = ANY(i.victim_entity_ids)
        ), 0)::int AS historical_incidents,
        top_twin.target_entity_id      AS top_twin_entity_id,
        top_twin_name.name             AS top_twin_name,
        top_twin.ensemble_score::text  AS top_twin_ensemble
      FROM chaindrain.mvp_master_dedup u
      LEFT JOIN LATERAL (
        SELECT sp.target_entity_id, sp.ensemble_score
        FROM chaindrain.similarity_pair sp
        WHERE sp.source_entity_id = u.entity_id
        ORDER BY sp.rank ASC
        LIMIT 1
      ) top_twin ON TRUE
      LEFT JOIN chaindrain.identity top_twin_name
             ON top_twin_name.entity_id = top_twin.target_entity_id
    )
    SELECT * FROM base u
    ${where}
    ${orderBy}
    LIMIT ${safePageSize}
    OFFSET ${offset}
  `;

  const totalRows = await sql<{ count: string }[]>`
    WITH base AS (
      SELECT
        u.entity_id, u.name, u.sector, u.risk_tier, u.coverage_tier,
        COALESCE((
          SELECT COUNT(*)
          FROM chaindrain.incident i
          WHERE u.entity_id = ANY(i.victim_entity_ids)
        ), 0)::int AS historical_incidents
      FROM chaindrain.mvp_master_dedup u
    )
    SELECT COUNT(*)::text AS count FROM base u
    ${where}
  `;

  return {
    rows,
    total: Number(totalRows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}

export interface ExposureEntityDetail extends EntityDetail {
  subsector_tags: string[] | null;
  website_canonical: string | null;
  is_immutable_bool: boolean | null;
  is_permissionless_bool: boolean | null;
  contract_addresses: string[] | null;
  uses_assembly_bool: boolean | null;
  bug_bounty_program_enum: string | null;
  lst_lrt_dependencies: string[] | null;
  lst_lrt_confidence: string | null;
  dex_liquidity_venues: string[] | null;
  dex_liquidity_venues_confidence: string | null;
  cex_listings: string[] | null;
  cex_listings_confidence: string | null;
  custodian: string | null;
  custodian_confidence: string | null;
  kms_provider: string | null;
  kms_provider_confidence: string | null;
  rpc_provider_primary: string | null;
  rpc_provider_primary_confidence: string | null;
  frontend_host: string | null;
  frontend_host_confidence: string | null;
  npm_lockfile_sha: string | null;
  npm_lockfile_sha_confidence: string | null;
  governance_type: string | null;
  governance_token_address: string | null;
  treasury_size_usd: string | null;
  team_size_estimate: number | null;
  team_jurisdiction: string | null;
  incorporated_entity: string | null;
  is_anonymous_team: boolean | null;
  has_security_disclosure_policy: boolean | null;
  incident_response_sla_hours: number | null;
  governance_confidence: string | null;
  github_repo_url: string | null;
  github_commit_velocity_30d: number | null;
  github_contributor_count: number | null;
  github_last_security_issue_date: string | null;
  twitter_handle: string | null;
  discord_invite: string | null;
  last_known_incident_date: string | null;
  kyt_screening_status: string | null;
  reputation_confidence: string | null;
}

export const getExposureEntityCached = unstable_cache(
  async (entityId: string): Promise<ExposureEntityDetail | null> =>
    getExposureEntity(entityId),
  ["exposure-entity-v1"],
  {
    revalidate: 60,
    tags: [CACHE_TAG_EXPOSURE_LAYER1, CACHE_TAG_ENTITIES],
  },
);

export async function getExposureEntity(
  entityId: string,
): Promise<ExposureEntityDetail | null> {
  const rows = await sql<ExposureEntityDetail[]>`
    SELECT
      u.*,
      i.subsector_tags,
      i.website_canonical,
      i.is_immutable_bool,
      i.is_permissionless_bool,
      cf.contract_addresses,
      cf.uses_assembly_bool,
      cf.bug_bounty_program_enum,
      df.lst_lrt_dependencies,
      df.lst_lrt_confidence,
      df.dex_liquidity_venues,
      df.dex_liquidity_venues_confidence,
      df.cex_listings,
      df.cex_listings_confidence,
      df.custodian,
      df.custodian_confidence,
      df.kms_provider,
      df.kms_provider_confidence,
      df.rpc_provider_primary,
      df.rpc_provider_primary_confidence,
      df.frontend_host,
      df.frontend_host_confidence,
      df.npm_lockfile_sha,
      df.npm_lockfile_sha_confidence,
      gf.governance_type,
      gf.governance_token_address,
      gf.treasury_size_usd::text     AS treasury_size_usd,
      gf.team_size_estimate,
      gf.team_jurisdiction,
      gf.incorporated_entity,
      gf.is_anonymous_team,
      gf.has_security_disclosure_policy,
      gf.incident_response_sla_hours,
      gf.data_confidence              AS governance_confidence,
      rs.github_repo_url,
      rs.github_commit_velocity_30d,
      rs.github_contributor_count,
      rs.github_last_security_issue_date,
      rs.twitter_handle,
      rs.discord_invite,
      rs.last_known_incident_date,
      rs.kyt_screening_status,
      rs.data_confidence              AS reputation_confidence
    FROM chaindrain.mvp_master_dedup u
    LEFT JOIN chaindrain.identity              i  ON i.entity_id  = u.entity_id
    LEFT JOIN chaindrain.contract_fingerprint  cf ON cf.entity_id = u.entity_id
    LEFT JOIN chaindrain.dependency_fingerprint df ON df.entity_id = u.entity_id
    LEFT JOIN chaindrain.governance_fingerprint gf ON gf.entity_id = u.entity_id
    LEFT JOIN chaindrain.reputation_signal      rs ON rs.entity_id = u.entity_id
    WHERE u.entity_id = ${entityId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface IncidentRow {
  incident_id: string;
  victim_entity_ids: string[];
  event_date: string;
  disclosure_date: string | null;
  loss_amount_usd: string | null;
  funds_recovered_usd: string | null;
  actor_role: string | null;
  attack_strategy: string | null;
  aadapt_tactic_ids: string[] | null;
  aadapt_technique_ids: string[] | null;
  root_cause: string;
  secondary_root_causes: string[] | null;
  attack_layer: string | null;
  flash_loan_used: boolean | null;
  attacker_address: string | null;
  attacker_attribution: string | null;
  audit_firm_at_time: string[] | null;
  was_audited: boolean | null;
  bounty_program_at_time: boolean | null;
  tx_hashes: string[] | null;
  post_mortem_urls: string[] | null;
  narrative_summary: string | null;
  data_confidence: string;
}

export const getThreatHistoryCached = unstable_cache(
  async (entityId: string): Promise<IncidentRow[]> =>
    getThreatHistory(entityId),
  ["exposure-threat-history-v1"],
  { revalidate: 300, tags: [CACHE_TAG_EXPOSURE_INCIDENTS] },
);

export async function getThreatHistory(
  entityId: string,
): Promise<IncidentRow[]> {
  const rows = await sql<IncidentRow[]>`
    SELECT
      incident_id, victim_entity_ids::text[] AS victim_entity_ids,
      event_date, disclosure_date,
      loss_amount_usd::text AS loss_amount_usd,
      funds_recovered_usd::text AS funds_recovered_usd,
      actor_role, attack_strategy,
      aadapt_tactic_ids, aadapt_technique_ids,
      root_cause, secondary_root_causes, attack_layer,
      flash_loan_used, attacker_address, attacker_attribution,
      audit_firm_at_time, was_audited, bounty_program_at_time,
      tx_hashes, post_mortem_urls, narrative_summary, data_confidence
    FROM chaindrain.incident
    WHERE ${entityId}::uuid = ANY(victim_entity_ids)
    ORDER BY event_date DESC
  `;
  return rows;
}

export interface PeerIncidentGroup {
  root_cause: string;
  matched_predicate_summary: string;
  incidents: (IncidentRow & {
    victim_names: string[];
  })[];
}

export const getPeerIncidentsCached = unstable_cache(
  async (
    entityId: string,
    rootCauses: readonly string[],
  ): Promise<PeerIncidentGroup[]> => getPeerIncidents(entityId, rootCauses),
  ["exposure-peer-incidents-v1"],
  { revalidate: 300, tags: [CACHE_TAG_EXPOSURE_INCIDENTS] },
);

export async function getPeerIncidents(
  entityId: string,
  rootCauses: readonly string[],
): Promise<PeerIncidentGroup[]> {
  if (rootCauses.length === 0) return [];
  type Row = IncidentRow & { victim_names: string[] };
  const rows = await sql<Row[]>`
    SELECT
      i.incident_id, i.victim_entity_ids::text[] AS victim_entity_ids,
      i.event_date, i.disclosure_date,
      i.loss_amount_usd::text AS loss_amount_usd,
      i.funds_recovered_usd::text AS funds_recovered_usd,
      i.actor_role, i.attack_strategy,
      i.aadapt_tactic_ids, i.aadapt_technique_ids,
      i.root_cause, i.secondary_root_causes, i.attack_layer,
      i.flash_loan_used, i.attacker_address, i.attacker_attribution,
      i.audit_firm_at_time, i.was_audited, i.bounty_program_at_time,
      i.tx_hashes, i.post_mortem_urls, i.narrative_summary, i.data_confidence,
      COALESCE(
        (
          SELECT array_agg(id.name ORDER BY id.name)
          FROM chaindrain.identity id
          WHERE id.entity_id = ANY(i.victim_entity_ids)
        ),
        ARRAY[]::text[]
      ) AS victim_names
    FROM chaindrain.incident i
    WHERE i.root_cause = ANY(${rootCauses as string[]}::text[])
      AND NOT (${entityId}::uuid = ANY(i.victim_entity_ids))
    ORDER BY i.event_date DESC
  `;

  const byRc = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byRc.get(r.root_cause) ?? [];
    list.push(r);
    byRc.set(r.root_cause, list);
  }
  const groups: PeerIncidentGroup[] = [];
  for (const [rc, list] of byRc) {
    groups.push({
      root_cause: rc,
      matched_predicate_summary: `Matches the ${rc.replace(/_/g, " ")} predicate`,
      incidents: list,
    });
  }
  groups.sort((a, b) => b.incidents.length - a.incidents.length);
  return groups;
}

export interface DependencyTwinRow {
  source_entity_id: string;
  target_entity_id: string;
  target_name: string;
  target_sector: string | null;
  target_risk_tier: string | null;
  target_tvl_usd: string | null;
  method_a_jaccard: string;
  method_b_overlap: number;
  method_c_cosine: string;
  ensemble_score: string;
  shared_attributes: Record<string, unknown>;
  rank: number;
}

export const getDependencyTwinsCached = unstable_cache(
  async (
    entityId: string,
    options: { limit?: number } = {},
  ): Promise<DependencyTwinRow[]> => getDependencyTwins(entityId, options),
  ["exposure-dependency-twins-v1"],
  { revalidate: 600, tags: [CACHE_TAG_EXPOSURE_SIMILARITY] },
);

export async function getDependencyTwins(
  entityId: string,
  options: { limit?: number } = {},
): Promise<DependencyTwinRow[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  return await sql<DependencyTwinRow[]>`
    SELECT
      sp.source_entity_id, sp.target_entity_id,
      i.name           AS target_name,
      i.sector         AS target_sector,
      t.risk_tier      AS target_risk_tier,
      i.tvl_usd::text  AS target_tvl_usd,
      sp.method_a_jaccard::text AS method_a_jaccard,
      sp.method_b_overlap,
      sp.method_c_cosine::text  AS method_c_cosine,
      sp.ensemble_score::text   AS ensemble_score,
      sp.shared_attributes,
      sp.rank
    FROM chaindrain.similarity_pair sp
    LEFT JOIN chaindrain.identity   i ON i.entity_id   = sp.target_entity_id
    LEFT JOIN chaindrain.tier_state t ON t.entity_id   = sp.target_entity_id
    WHERE sp.source_entity_id = ${entityId}
    ORDER BY sp.rank ASC
    LIMIT ${limit}
  `;
}

export type IncidentSortField = "event_date" | "loss_amount_usd" | "root_cause";

export interface IncidentListOptions {
  rootCauses?: string[];
  attribution?: string[];
  attackLayer?: string[];
  year?: number;
  minLossUsd?: number;
  sortField: IncidentSortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface IncidentListResult {
  rows: (IncidentRow & { victim_names: string[] })[];
  total: number;
  page: number;
  pageSize: number;
}

const INCIDENT_SORTABLE: Record<IncidentSortField, string> = {
  event_date: "event_date",
  loss_amount_usd: "loss_amount_usd",
  root_cause: "root_cause",
};

export const listIncidentsCached = unstable_cache(
  async (options: IncidentListOptions): Promise<IncidentListResult> =>
    listIncidents(options),
  ["exposure-list-incidents-v1"],
  { revalidate: 300, tags: [CACHE_TAG_EXPOSURE_INCIDENTS] },
);

export async function listIncidents(
  options: IncidentListOptions,
): Promise<IncidentListResult> {
  const sortExpr = INCIDENT_SORTABLE[options.sortField] ?? "event_date";
  const safeDirection: "ASC" | "DESC" =
    options.sortDirection.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const safePage = Math.max(1, Math.floor(options.page));
  const safePageSize = Math.max(1, Math.min(200, Math.floor(options.pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const clauses: ReturnType<typeof sql>[] = [];
  if (options.rootCauses && options.rootCauses.length > 0) {
    clauses.push(sql`root_cause = ANY(${options.rootCauses}::text[])`);
  }
  if (options.attribution && options.attribution.length > 0) {
    clauses.push(sql`attacker_attribution = ANY(${options.attribution}::text[])`);
  }
  if (options.attackLayer && options.attackLayer.length > 0) {
    clauses.push(sql`attack_layer = ANY(${options.attackLayer}::text[])`);
  }
  if (options.year != null) {
    const yearStart = `${options.year}-01-01`;
    const yearEnd = `${options.year + 1}-01-01`;
    clauses.push(sql`event_date >= ${yearStart}::date AND event_date < ${yearEnd}::date`);
  }
  if (options.minLossUsd != null) {
    clauses.push(sql`loss_amount_usd >= ${options.minLossUsd}`);
  }

  let where = sql``;
  if (clauses.length > 0) {
    where = sql`WHERE ${clauses[0]}`;
    for (let i = 1; i < clauses.length; i++) {
      where = sql`${where} AND ${clauses[i]}`;
    }
  }

  const orderBy =
    safeDirection === "DESC"
      ? sql`ORDER BY ${sql.unsafe(sortExpr)} DESC NULLS LAST, event_date DESC`
      : sql`ORDER BY ${sql.unsafe(sortExpr)} ASC NULLS LAST, event_date DESC`;

  type Row = IncidentRow & { victim_names: string[] };
  const rows = await sql<Row[]>`
    SELECT
      i.incident_id, i.victim_entity_ids::text[] AS victim_entity_ids,
      i.event_date, i.disclosure_date,
      i.loss_amount_usd::text AS loss_amount_usd,
      i.funds_recovered_usd::text AS funds_recovered_usd,
      i.actor_role, i.attack_strategy,
      i.aadapt_tactic_ids, i.aadapt_technique_ids,
      i.root_cause, i.secondary_root_causes, i.attack_layer,
      i.flash_loan_used, i.attacker_address, i.attacker_attribution,
      i.audit_firm_at_time, i.was_audited, i.bounty_program_at_time,
      i.tx_hashes, i.post_mortem_urls, i.narrative_summary, i.data_confidence,
      COALESCE(
        (
          SELECT array_agg(id.name ORDER BY id.name)
          FROM chaindrain.identity id
          WHERE id.entity_id = ANY(i.victim_entity_ids)
        ),
        ARRAY[]::text[]
      ) AS victim_names
    FROM chaindrain.incident i
    ${where}
    ${orderBy}
    LIMIT ${safePageSize}
    OFFSET ${offset}
  `;

  const totalRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM chaindrain.incident ${where}
  `;

  return {
    rows,
    total: Number(totalRows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}

export const getIncidentByIdCached = unstable_cache(
  async (
    incidentId: string,
  ): Promise<(IncidentRow & { victim_names: string[] }) | null> =>
    getIncidentById(incidentId),
  ["exposure-incident-by-id-v1"],
  { revalidate: 600, tags: [CACHE_TAG_EXPOSURE_INCIDENTS] },
);

export async function getIncidentById(
  incidentId: string,
): Promise<(IncidentRow & { victim_names: string[] }) | null> {
  type Row = IncidentRow & { victim_names: string[] };
  const rows = await sql<Row[]>`
    SELECT
      i.incident_id, i.victim_entity_ids::text[] AS victim_entity_ids,
      i.event_date, i.disclosure_date,
      i.loss_amount_usd::text AS loss_amount_usd,
      i.funds_recovered_usd::text AS funds_recovered_usd,
      i.actor_role, i.attack_strategy,
      i.aadapt_tactic_ids, i.aadapt_technique_ids,
      i.root_cause, i.secondary_root_causes, i.attack_layer,
      i.flash_loan_used, i.attacker_address, i.attacker_attribution,
      i.audit_firm_at_time, i.was_audited, i.bounty_program_at_time,
      i.tx_hashes, i.post_mortem_urls, i.narrative_summary, i.data_confidence,
      COALESCE(
        (
          SELECT array_agg(id.name ORDER BY id.name)
          FROM chaindrain.identity id
          WHERE id.entity_id = ANY(i.victim_entity_ids)
        ),
        ARRAY[]::text[]
      ) AS victim_names
    FROM chaindrain.incident i
    WHERE i.incident_id = ${incidentId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface ExposureKpis {
  entities_mapped: number;
  historical_incidents: number;
  dependency_edges: number;
  avg_twins_per_entity: number;
}

export const getExposureKpisCached = unstable_cache(
  async (): Promise<ExposureKpis> => getExposureKpis(),
  ["exposure-kpis-v1"],
  {
    revalidate: 300,
    tags: [CACHE_TAG_EXPOSURE_LAYER1, CACHE_TAG_EXPOSURE_INCIDENTS, CACHE_TAG_EXPOSURE_SIMILARITY],
  },
);

export async function getExposureKpis(): Promise<ExposureKpis> {
  const rows = await sql<
    {
      entities_mapped: string;
      historical_incidents: string;
      dependency_edges: string;
      avg_twins_per_entity: string;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::text FROM chaindrain.mvp_master_dedup) AS entities_mapped,
      (SELECT COUNT(*)::text FROM chaindrain.incident)         AS historical_incidents,
      (
        SELECT COALESCE(SUM(
          COALESCE(array_length(oracle_providers,1), 0) +
          COALESCE(array_length(bridge_dependencies,1), 0) +
          COALESCE(array_length(stablecoin_dependencies,1), 0)
        ), 0)::text
        FROM chaindrain.dependency_fingerprint
      )                                                         AS dependency_edges,
      (
        SELECT COALESCE(ROUND(AVG(c)::numeric, 2), 0)::text
        FROM (
          SELECT COUNT(*)::int AS c
          FROM chaindrain.similarity_pair
          GROUP BY source_entity_id
        ) s
      )                                                         AS avg_twins_per_entity
  `;
  const r = rows[0];
  return {
    entities_mapped: Number(r?.entities_mapped ?? 0),
    historical_incidents: Number(r?.historical_incidents ?? 0),
    dependency_edges: Number(r?.dependency_edges ?? 0),
    avg_twins_per_entity: Number(r?.avg_twins_per_entity ?? 0),
  };
}
