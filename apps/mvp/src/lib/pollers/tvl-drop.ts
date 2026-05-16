import type { PollerContext, RawAlert } from "./types";

export const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";

export const HIGH_THRESHOLD_PCT = -20;
export const CRITICAL_THRESHOLD_PCT = -40;

interface DefiLlamaProtocol {
  slug?: string;
  name?: string;
  tvl?: number;
  change_1h?: number | null;
  change_1d?: number | null;
  change_7d?: number | null;
}

export interface TvlDropDeps {
  watched_slugs: string[];
}

export async function pollTvlDrop(
  ctx: PollerContext,
  deps: TvlDropDeps,
): Promise<RawAlert[]> {
  if (deps.watched_slugs.length === 0) {
    return [];
  }

  let body: DefiLlamaProtocol[];
  try {
    const resp = await ctx.fetch(DEFILLAMA_PROTOCOLS_URL, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`defillama http ${resp.status}`);
    }
    body = (await resp.json()) as DefiLlamaProtocol[];
  } catch (error) {
    console.error({ pollster: "tvl_drop", error: String(error) });
    throw error;
  }

  const watched = new Set(deps.watched_slugs);
  return classifyTvlDrops(body, watched, ctx.now());
}

export function classifyTvlDrops(
  protocols: DefiLlamaProtocol[],
  watched: ReadonlySet<string>,
  observed_at: Date,
): RawAlert[] {
  const alerts: RawAlert[] = [];
  for (const p of protocols) {
    if (!p.slug || !watched.has(p.slug)) continue;
    const change = p.change_1d;
    if (typeof change !== "number" || !Number.isFinite(change)) continue;
    if (change > HIGH_THRESHOLD_PCT) continue;

    const severity = change <= CRITICAL_THRESHOLD_PCT ? "critical" : "high";
    alerts.push({
      signal_type: "tvl_drop",
      severity,
      dependency_key: p.slug,
      dependency_field: "defillama_slug",
      raw_signal: {
        source: "defillama_protocols",
        protocol_slug: p.slug,
        protocol_name: p.name ?? null,
        tvl_usd: p.tvl ?? null,
        change_1d_pct: change,
        threshold_high_pct: HIGH_THRESHOLD_PCT,
        threshold_critical_pct: CRITICAL_THRESHOLD_PCT,
        observed_at: observed_at.toISOString(),
      },
    });
  }
  return alerts;
}
