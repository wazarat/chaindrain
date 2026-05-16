import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import type { PollerContext, RawAlert } from "./types";

interface PairSpec {
  symbol: string;
  coingecko_id: string;
  chainlink_feed: Address;
  pyth_price_id: string;
}

export const PAIRS: PairSpec[] = [
  {
    symbol: "ETH/USD",
    coingecko_id: "ethereum",
    chainlink_feed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    pyth_price_id:
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  },
  {
    symbol: "BTC/USD",
    coingecko_id: "bitcoin",
    chainlink_feed: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    pyth_price_id:
      "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  },
  {
    symbol: "LINK/USD",
    coingecko_id: "chainlink",
    chainlink_feed: "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c",
    pyth_price_id:
      "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",
  },
];

export const MEDIUM_THRESHOLD = 0.01;
export const HIGH_THRESHOLD = 0.05;

export const DEFAULT_ETH_RPC = "https://eth.llamarpc.com";
export const PYTH_HERMES_URL =
  "https://hermes.pyth.network/v2/updates/price/latest";
const CG_URL = "https://api.coingecko.com/api/v3/simple/price";

const CHAINLINK_AGGREGATOR_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface PythHermesResponse {
  parsed?: Array<{
    id: string;
    price: { price: string; expo: number; conf: string; publish_time: number };
  }>;
}

interface CoinGeckoSimplePriceResponse {
  [id: string]: { usd?: number };
}

export interface OracleReading {
  symbol: string;
  reference_usd: number;
  chainlink_usd: number | null;
  pyth_usd: number | null;
  chainlink_updated_at: number | null;
  pyth_publish_time: number | null;
}

export async function pollOracleDeviation(
  ctx: PollerContext,
): Promise<RawAlert[]> {
  const rpcUrl = ctx.env.ETH_RPC_URL?.trim() || DEFAULT_ETH_RPC;
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  const ids = PAIRS.map((p) => p.coingecko_id).join(",");
  const cgUrl = `${CG_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

  const [cgResp, pythResp] = await Promise.allSettled([
    ctx.fetch(cgUrl, { headers: { accept: "application/json" } }),
    fetchPythPrices(ctx),
  ]);

  let cg: CoinGeckoSimplePriceResponse = {};
  if (cgResp.status === "fulfilled") {
    if (cgResp.value.ok) {
      cg = (await cgResp.value.json()) as CoinGeckoSimplePriceResponse;
    } else {
      console.error({
        pollster: "oracle_deviation",
        source: "coingecko",
        error: `http ${cgResp.value.status}`,
      });
    }
  } else {
    console.error({
      pollster: "oracle_deviation",
      source: "coingecko",
      error: String(cgResp.reason),
    });
  }

  const pyth =
    pythResp.status === "fulfilled" ? pythResp.value : new Map<string, { price: number; publish_time: number }>();
  if (pythResp.status === "rejected") {
    console.error({
      pollster: "oracle_deviation",
      source: "pyth_hermes",
      error: String(pythResp.reason),
    });
  }

  const chainlinkReadings = await readChainlink(client);
  return classifyOracleDeviations({
    references: cg,
    chainlink: chainlinkReadings,
    pyth,
    observed_at: ctx.now(),
  });
}

export interface ClassifyOracleInput {
  references: CoinGeckoSimplePriceResponse;
  chainlink: Map<string, { price: number; updated_at: number }>;
  pyth: Map<string, { price: number; publish_time: number }>;
  observed_at: Date;
}

export function classifyOracleDeviations(
  input: ClassifyOracleInput,
): RawAlert[] {
  const alerts: RawAlert[] = [];
  for (const pair of PAIRS) {
    const reference = input.references[pair.coingecko_id]?.usd;
    if (
      typeof reference !== "number" ||
      !Number.isFinite(reference) ||
      reference <= 0
    ) {
      continue;
    }
    const chainlink = input.chainlink.get(pair.symbol);
    const pythPriceEntry = input.pyth.get(pair.pyth_price_id);

    const observation: OracleReading = {
      symbol: pair.symbol,
      reference_usd: reference,
      chainlink_usd: chainlink?.price ?? null,
      chainlink_updated_at: chainlink?.updated_at ?? null,
      pyth_usd: pythPriceEntry?.price ?? null,
      pyth_publish_time: pythPriceEntry?.publish_time ?? null,
    };

    const sources: Array<{
      source: "Chainlink" | "Pyth";
      oracle_price: number;
      updated_at: number | null;
    }> = [];
    if (chainlink) {
      sources.push({
        source: "Chainlink",
        oracle_price: chainlink.price,
        updated_at: chainlink.updated_at,
      });
    }
    if (pythPriceEntry) {
      sources.push({
        source: "Pyth",
        oracle_price: pythPriceEntry.price,
        updated_at: pythPriceEntry.publish_time,
      });
    }

    for (const src of sources) {
      const deviation = Math.abs(src.oracle_price - reference) / reference;
      if (deviation < MEDIUM_THRESHOLD) continue;
      const severity = deviation > HIGH_THRESHOLD ? "high" : "medium";
      alerts.push({
        signal_type: "oracle_deviation",
        severity,
        dependency_key: src.source,
        dependency_field: "oracle_providers",
        raw_signal: {
          ...observation,
          oracle: src.source,
          oracle_price: src.oracle_price,
          oracle_updated_at: src.updated_at,
          reference_source: "coingecko",
          deviation,
          threshold_medium: MEDIUM_THRESHOLD,
          threshold_high: HIGH_THRESHOLD,
          observed_at: input.observed_at.toISOString(),
        },
      });
    }
  }
  return alerts;
}

async function readChainlink(
  client: PublicClient,
): Promise<Map<string, { price: number; updated_at: number }>> {
  const out = new Map<string, { price: number; updated_at: number }>();
  for (const pair of PAIRS) {
    try {
      const [latest, decimals] = await Promise.all([
        client.readContract({
          address: pair.chainlink_feed,
          abi: CHAINLINK_AGGREGATOR_ABI,
          functionName: "latestRoundData",
        }),
        client.readContract({
          address: pair.chainlink_feed,
          abi: CHAINLINK_AGGREGATOR_ABI,
          functionName: "decimals",
        }),
      ]);
      const answer = latest[1] as bigint;
      const updatedAt = Number(latest[3] as bigint);
      const price = Number(answer) / 10 ** Number(decimals);
      if (Number.isFinite(price) && price > 0) {
        out.set(pair.symbol, { price, updated_at: updatedAt });
      }
    } catch (error) {
      console.error({
        pollster: "oracle_deviation",
        source: "chainlink",
        pair: pair.symbol,
        error: String(error),
      });
    }
  }
  return out;
}

async function fetchPythPrices(
  ctx: PollerContext,
): Promise<Map<string, { price: number; publish_time: number }>> {
  const params = new URLSearchParams();
  for (const pair of PAIRS) {
    params.append("ids[]", pair.pyth_price_id);
  }
  params.append("parsed", "true");
  const url = `${PYTH_HERMES_URL}?${params.toString()}`;
  const resp = await ctx.fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`pyth http ${resp.status}`);
  }
  const body = (await resp.json()) as PythHermesResponse;
  const out = new Map<string, { price: number; publish_time: number }>();
  for (const parsed of body.parsed ?? []) {
    const expo = parsed.price.expo;
    const raw = Number(parsed.price.price);
    if (!Number.isFinite(raw) || !Number.isFinite(expo)) continue;
    const price = raw * 10 ** expo;
    if (!Number.isFinite(price) || price <= 0) continue;
    const id = parsed.id.startsWith("0x") ? parsed.id : `0x${parsed.id}`;
    out.set(id, { price, publish_time: parsed.price.publish_time });
  }
  return out;
}
