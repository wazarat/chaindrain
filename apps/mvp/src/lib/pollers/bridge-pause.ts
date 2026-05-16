import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { DEFAULT_ETH_RPC } from "./oracle-deviation";
import type { PollerContext, RawAlert } from "./types";

export const LAYERZERO_ENDPOINT_V2: Address =
  "0x1a44076050125825900e736c501f859c50fE728c";
export const WORMHOLE_HEARTBEATS_URL =
  "https://api.wormholescan.io/api/v1/heartbeats";
export const AXELAR_CHAIN_MAINTAINERS_URL =
  "https://api.axelarscan.io/api/getChainMaintainers";

export const WORMHOLE_GUARDIAN_QUORUM = 13;
export const AXELAR_MIN_MAINTAINERS = 3;

const PAUSABLE_ABI = [
  {
    inputs: [],
    name: "paused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface WormholeHeartbeatsResponse {
  entries?: Array<{ verifiedGuardianAddr?: string }>;
}

interface AxelarMaintainersResponse {
  data?: Array<{ chain?: string; maintainers?: string[] }>;
}

export interface BridgeProbeReadings {
  layerzero_paused: boolean | null;
  wormhole_active_guardians: number | null;
  axelar_chains: Array<{ chain: string; maintainers: number }>;
}

export async function pollBridgePause(
  ctx: PollerContext,
): Promise<RawAlert[]> {
  const rpcUrl = ctx.env.ETH_RPC_URL?.trim() || DEFAULT_ETH_RPC;
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  const [layerzero, wormhole, axelar] = await Promise.allSettled([
    checkLayerZero(client),
    checkWormhole(ctx),
    checkAxelar(ctx),
  ]);

  const readings: BridgeProbeReadings = {
    layerzero_paused:
      layerzero.status === "fulfilled" ? layerzero.value : null,
    wormhole_active_guardians:
      wormhole.status === "fulfilled" ? wormhole.value : null,
    axelar_chains: axelar.status === "fulfilled" ? axelar.value : [],
  };

  if (layerzero.status === "rejected") {
    console.error({
      pollster: "bridge_pause",
      source: "layerzero",
      error: String(layerzero.reason),
    });
  }
  if (wormhole.status === "rejected") {
    console.error({
      pollster: "bridge_pause",
      source: "wormhole",
      error: String(wormhole.reason),
    });
  }
  if (axelar.status === "rejected") {
    console.error({
      pollster: "bridge_pause",
      source: "axelar",
      error: String(axelar.reason),
    });
  }

  return classifyBridgeReadings(readings, ctx.now());
}

export function classifyBridgeReadings(
  readings: BridgeProbeReadings,
  observed_at: Date,
): RawAlert[] {
  const alerts: RawAlert[] = [];
  const ts = observed_at.toISOString();

  if (readings.layerzero_paused === true) {
    alerts.push({
      signal_type: "bridge_pause",
      severity: "critical",
      dependency_key: "LayerZero",
      dependency_field: "bridge_dependencies",
      raw_signal: {
        source: "layerzero_v2_endpoint",
        endpoint: LAYERZERO_ENDPOINT_V2,
        paused: true,
        observed_at: ts,
      },
    });
  }

  if (
    typeof readings.wormhole_active_guardians === "number" &&
    readings.wormhole_active_guardians < WORMHOLE_GUARDIAN_QUORUM
  ) {
    alerts.push({
      signal_type: "bridge_pause",
      severity: "critical",
      dependency_key: "Wormhole",
      dependency_field: "bridge_dependencies",
      raw_signal: {
        source: "wormholescan_heartbeats",
        active_guardians: readings.wormhole_active_guardians,
        quorum_threshold: WORMHOLE_GUARDIAN_QUORUM,
        observed_at: ts,
      },
    });
  }

  for (const c of readings.axelar_chains) {
    if (c.maintainers < AXELAR_MIN_MAINTAINERS) {
      alerts.push({
        signal_type: "bridge_pause",
        severity: "critical",
        dependency_key: "Axelar",
        dependency_field: "bridge_dependencies",
        raw_signal: {
          source: "axelarscan_chain_maintainers",
          chain: c.chain,
          maintainers: c.maintainers,
          min_maintainers: AXELAR_MIN_MAINTAINERS,
          observed_at: ts,
        },
      });
    }
  }

  return alerts;
}

async function checkLayerZero(client: PublicClient): Promise<boolean | null> {
  try {
    const paused = (await client.readContract({
      address: LAYERZERO_ENDPOINT_V2,
      abi: PAUSABLE_ABI,
      functionName: "paused",
    })) as boolean;
    return paused;
  } catch {
    return null;
  }
}

async function checkWormhole(ctx: PollerContext): Promise<number> {
  const resp = await ctx.fetch(WORMHOLE_HEARTBEATS_URL, {
    headers: { accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`wormholescan http ${resp.status}`);
  }
  const body = (await resp.json()) as WormholeHeartbeatsResponse;
  const distinct = new Set<string>();
  for (const entry of body.entries ?? []) {
    if (entry.verifiedGuardianAddr) {
      distinct.add(entry.verifiedGuardianAddr.toLowerCase());
    }
  }
  return distinct.size;
}

async function checkAxelar(
  ctx: PollerContext,
): Promise<Array<{ chain: string; maintainers: number }>> {
  const resp = await ctx.fetch(AXELAR_CHAIN_MAINTAINERS_URL, {
    headers: { accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`axelarscan http ${resp.status}`);
  }
  const body = (await resp.json()) as AxelarMaintainersResponse;
  const out: Array<{ chain: string; maintainers: number }> = [];
  for (const row of body.data ?? []) {
    if (typeof row?.chain === "string") {
      out.push({
        chain: row.chain,
        maintainers: Array.isArray(row.maintainers)
          ? row.maintainers.length
          : 0,
      });
    }
  }
  return out;
}
