import type { PollerContext, RawAlert } from "./types";

interface CoinGeckoSimplePriceResponse {
  [id: string]: { usd?: number };
}

interface StableSpec {
  symbol: string;
  coingecko_id: string;
}

export const STABLES: StableSpec[] = [
  { symbol: "USDC", coingecko_id: "usd-coin" },
  { symbol: "USDT", coingecko_id: "tether" },
  { symbol: "DAI", coingecko_id: "dai" },
  { symbol: "FDUSD", coingecko_id: "first-digital-usd" },
  { symbol: "USDS", coingecko_id: "usds" },
  { symbol: "USDe", coingecko_id: "ethena-usde" },
  { symbol: "USD0", coingecko_id: "usual-usd" },
];

export const HIGH_THRESHOLD = 0.005;
export const CRITICAL_THRESHOLD = 0.02;

const CG_URL = "https://api.coingecko.com/api/v3/simple/price";

export async function pollStablecoinDepeg(
  ctx: PollerContext,
): Promise<RawAlert[]> {
  const ids = STABLES.map((s) => s.coingecko_id).join(",");
  const url = `${CG_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

  let prices: CoinGeckoSimplePriceResponse;
  try {
    const resp = await ctx.fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`coingecko http ${resp.status}`);
    }
    prices = (await resp.json()) as CoinGeckoSimplePriceResponse;
  } catch (error) {
    console.error({ pollster: "stablecoin_depeg", error: String(error) });
    throw error;
  }

  return classifyStablecoinPrices(prices, ctx.now());
}

export function classifyStablecoinPrices(
  prices: CoinGeckoSimplePriceResponse,
  observed_at: Date,
): RawAlert[] {
  const alerts: RawAlert[] = [];
  for (const stable of STABLES) {
    const price = prices[stable.coingecko_id]?.usd;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }
    const deviation = Math.abs(price - 1);
    if (deviation < HIGH_THRESHOLD) continue;

    const severity = deviation > CRITICAL_THRESHOLD ? "critical" : "high";
    alerts.push({
      signal_type: "stablecoin_depeg",
      severity,
      dependency_key: stable.symbol,
      dependency_field: "stablecoin_dependencies",
      raw_signal: {
        source: "coingecko",
        coingecko_id: stable.coingecko_id,
        price,
        peg: 1,
        deviation,
        threshold_high: HIGH_THRESHOLD,
        threshold_critical: CRITICAL_THRESHOLD,
        observed_at: observed_at.toISOString(),
      },
    });
  }
  return alerts;
}
