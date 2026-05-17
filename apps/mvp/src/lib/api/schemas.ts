import { z } from "zod";

export const RISK_TIERS = ["critical", "high", "medium", "low"] as const;
export const COVERAGE_TIERS = ["core", "monitored", "archive", "excluded"] as const;
export const SORT_FIELDS = [
  "risk_score",
  "tvl_usd",
  "blast_radius_usd",
  "name",
  "sector",
  "risk_tier",
  "coverage_tier",
] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

const csvList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const arr = Array.isArray(value) ? value : value.split(",");
    const cleaned = arr.map((s) => s.trim()).filter((s) => s.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  });

const csvEnumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const arr = Array.isArray(value) ? value : value.split(",");
      const cleaned = arr.map((s) => s.trim()).filter((s) => s.length > 0);
      return cleaned.length > 0 ? cleaned : undefined;
    })
    .pipe(z.array(z.enum(values)).optional());

export const entitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(SORT_FIELDS).default("risk_score"),
  direction: z.enum(SORT_DIRECTIONS).default("desc"),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  sectors: csvList,
  riskTiers: csvEnumList(RISK_TIERS),
  coverageTiers: csvEnumList(COVERAGE_TIERS),
  oracles: csvList,
  chains: csvList,
  bridges: csvList,
});

export type EntitiesQueryInput = z.input<typeof entitiesQuerySchema>;
export type EntitiesQuery = z.output<typeof entitiesQuerySchema>;

export const entityIdParamsSchema = z.object({
  entity_id: z.string().uuid(),
});

export const SIGNAL_TYPES = [
  "stablecoin_depeg",
  "oracle_deviation",
  "bridge_pause",
  "admin_tx",
  "tvl_drop",
] as const;

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export const ALERT_SORT_FIELDS = [
  "detected_at",
  "severity",
  "fanout_tvl_usd",
  "fanout_count",
] as const;

export const alertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(ALERT_SORT_FIELDS).default("detected_at"),
  direction: z.enum(SORT_DIRECTIONS).default("desc"),
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
  signalTypes: csvEnumList(SIGNAL_TYPES),
  severities: csvEnumList(SEVERITIES),
});

export type AlertsQueryInput = z.input<typeof alertsQuerySchema>;
export type AlertsQuery = z.output<typeof alertsQuerySchema>;

export const alertIdParamsSchema = z.object({
  alert_id: z.string().uuid(),
});

// Phase 6 — Exposure Graph

export const EXPOSURE_SORT_FIELDS = [
  "name",
  "sector",
  "risk_score",
  "tvl_usd",
  "blast_radius_usd",
  "historical_incidents",
  "top_twin_score",
] as const;

const trueish = ["1", "true", "yes"];
const falseish = ["0", "false", "no"];

export const exposureQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(EXPOSURE_SORT_FIELDS).default("risk_score"),
  direction: z.enum(SORT_DIRECTIONS).default("desc"),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  sectors: csvList,
  riskTiers: csvEnumList(RISK_TIERS),
  coverageTiers: csvEnumList(COVERAGE_TIERS),
  hasIncidentHistory: z
    .string()
    .optional()
    .transform((v) => {
      if (v == null) return undefined;
      const lower = v.toLowerCase();
      if (trueish.includes(lower)) return true;
      if (falseish.includes(lower)) return false;
      return undefined;
    }),
  rootCauseExposure: csvList,
});

export type ExposureQuery = z.output<typeof exposureQuerySchema>;

export const INCIDENT_SORT_FIELDS = [
  "event_date",
  "loss_amount_usd",
  "root_cause",
] as const;

export const incidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(INCIDENT_SORT_FIELDS).default("event_date"),
  direction: z.enum(SORT_DIRECTIONS).default("desc"),
  rootCauses: csvList,
  attribution: csvList,
  attackLayer: csvList,
  year: z.coerce.number().int().min(2009).max(2030).optional(),
  minLossUsd: z.coerce.number().min(0).optional(),
});

export type IncidentsQuery = z.output<typeof incidentsQuerySchema>;

export const incidentIdParamsSchema = z.object({
  incident_id: z.string().uuid(),
});

export function parseSearchParams(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(Array.from(searchParams.keys()))) {
    const all = searchParams.getAll(key);
    out[key] = all.length === 1 ? all[0] : all;
  }
  return out;
}
