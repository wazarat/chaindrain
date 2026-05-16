import type { PollerContext, RawAlert } from "./types";

export const ETHERSCAN_URL = "https://api.etherscan.io/api";
export const ADMIN_TX_LOOKBACK_SECONDS = 5 * 60;
export const ETHERSCAN_SLEEP_MS = 250;

export type UpgradeAuthorityType =
  | "EOA"
  | "Multisig"
  | "Timelock"
  | "DAO"
  | "Immutable"
  | "Unknown"
  | string
  | null;

export interface AdminWatchEntity {
  entity_id: string;
  name: string;
  admin_address: string;
  upgrade_authority_type: UpgradeAuthorityType;
}

interface EtherscanTx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  isError?: string;
  txreceipt_status?: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
}

export interface AdminTxDeps {
  entities: AdminWatchEntity[];
}

export async function pollAdminTx(
  ctx: PollerContext,
  deps: AdminTxDeps,
): Promise<RawAlert[]> {
  const apiKey = ctx.env.ETHERSCAN_API_KEY?.trim();
  if (!apiKey) {
    console.warn({
      pollster: "admin_tx",
      skipped: true,
      reason: "ETHERSCAN_API_KEY not set",
    });
    return [];
  }

  const entities = deps.entities;
  if (entities.length === 0) {
    console.warn({
      pollster: "admin_tx",
      skipped: true,
      reason: "no entities provided",
    });
    return [];
  }

  const cutoff = Math.floor(
    (ctx.now().getTime() - ADMIN_TX_LOOKBACK_SECONDS * 1000) / 1000,
  );
  const alerts: RawAlert[] = [];

  for (const entity of entities) {
    try {
      const txs = await fetchRecentAdminTxs(ctx, entity.admin_address, apiKey);
      const fresh = txs.filter((tx) => {
        const ts = Number(tx.timeStamp);
        return Number.isFinite(ts) && ts >= cutoff;
      });
      for (const tx of fresh) {
        alerts.push(classifyAdminTx(entity, tx, ctx.now()));
      }
    } catch (error) {
      console.error({
        pollster: "admin_tx",
        entity: entity.entity_id,
        error: String(error),
      });
    }
    await sleep(ETHERSCAN_SLEEP_MS);
  }

  return alerts;
}

export function classifyAdminTx(
  entity: AdminWatchEntity,
  tx: EtherscanTx,
  observed_at: Date,
): RawAlert {
  const upgrade = entity.upgrade_authority_type ?? "Unknown";
  const isHighRisk = upgrade === "EOA" || upgrade === "Multisig";
  return {
    signal_type: "admin_tx",
    severity: isHighRisk ? "high" : "medium",
    dependency_key: entity.admin_address.toLowerCase(),
    dependency_field: "admin_address",
    raw_signal: {
      source: "etherscan_txlist",
      entity_id: entity.entity_id,
      entity_name: entity.name,
      admin_address: entity.admin_address,
      upgrade_authority_type: upgrade,
      tx_hash: tx.hash,
      block_number: Number(tx.blockNumber),
      tx_timestamp: Number(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      observed_at: observed_at.toISOString(),
    },
  };
}

async function fetchRecentAdminTxs(
  ctx: PollerContext,
  address: string,
  apiKey: string,
): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "10",
    sort: "desc",
    apikey: apiKey,
  });
  const url = `${ETHERSCAN_URL}?${params.toString()}`;
  const resp = await ctx.fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`etherscan http ${resp.status}`);
  }
  const body = (await resp.json()) as EtherscanResponse;
  if (body.status !== "1") {
    if (Array.isArray(body.result)) return body.result;
    return [];
  }
  return Array.isArray(body.result) ? body.result : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
