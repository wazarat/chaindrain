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
