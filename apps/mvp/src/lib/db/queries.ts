import { sql } from "./index";
import {
  ARRAY_DEPENDENCY_FIELDS,
  type AlertSeverity,
  type AlertSignalType,
  type DependencyField,
} from "../pollers/types";
import type { AdminWatchEntity } from "../pollers/admin-tx";

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
      FROM chaindrain.mvp_master
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
    FROM chaindrain.mvp_master
    ${where}
    ${orderBy}
    LIMIT ${safePageSize}
    OFFSET ${offset}
  `;

  const totalRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM chaindrain.mvp_master
    ${where}
  `;

  return {
    rows,
    total: Number(totalRows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function getEntityById(
  entityId: string,
): Promise<EntityDetail | null> {
  const rows = await sql<EntityDetail[]>`
    SELECT *
    FROM chaindrain.mvp_master
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
      FROM chaindrain.mvp_master
      WHERE ${sql(dependency_field)} && ARRAY[${dependency_key}]::text[]
    `;
  } else {
    rows = await sql<{ count: string; tvl: string | null }[]>`
      SELECT COUNT(*)::text AS count,
             COALESCE(SUM(blast_radius_usd), 0)::text AS tvl
      FROM chaindrain.mvp_master
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
    FROM chaindrain.mvp_master
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
    FROM chaindrain.mvp_master
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
      FROM chaindrain.mvp_master
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
    FROM chaindrain.mvp_master
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
      FROM chaindrain.mvp_master
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
    FROM chaindrain.mvp_master e
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
