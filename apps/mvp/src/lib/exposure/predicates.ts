import type { RootCause } from "../../../scripts/lib/demo_fixtures";

export interface PredicateEntity {
  entity_id: string;
  name?: string | null;
  sector?: string | null;
  tvl_usd?: number | null;
  oracle_providers?: readonly string[] | null;
  oracle_fallback_present?: boolean | null;
  bridge_dependencies?: readonly string[] | null;
  stablecoin_dependencies?: readonly string[] | null;
  chain_deployments?: readonly string[] | null;
  upgrade_authority_type?: string | null;
  multisig_threshold?: number | string | null;
  audits_tier?: number | null;
  dvn_configuration?: string | null;
  frontend_host?: string | null;
  npm_lockfile_sha?: string | null;
  kms_provider?: string | null;
  is_anonymous_team?: boolean | null;
  team_jurisdiction?: string | null;
  has_security_disclosure_policy?: boolean | null;
  governance_type?: string | null;
}

const has = <T,>(arr: readonly T[] | null | undefined): arr is readonly T[] =>
  Array.isArray(arr) && arr.length > 0;

const overlap = (
  arr: readonly string[] | null | undefined,
  needles: readonly string[],
): boolean =>
  Array.isArray(arr) && arr.some((v) => needles.includes(v));

const SECTOR_CEX = new Set([
  "CEX",
  "Custodian",
  "Tokenization Platform",
  "RWA",
  "Tokenized Real-World Assets",
  "Wallet",
]);

export const ROOT_CAUSE_PREDICATES: Record<
  RootCause,
  (e: PredicateEntity) => boolean
> = {
  oracle_manipulation: (e) =>
    overlap(e.oracle_providers, ["chainlink", "pyth"]) &&
    e.oracle_fallback_present !== true &&
    (e.tvl_usd ?? 0) > 1_000_000,

  proxy_admin_compromise: (e) =>
    ["EOA", "multisig"].includes(e.upgrade_authority_type ?? "") &&
    (e.audits_tier ?? 0) < 3,

  reentrancy: (e) =>
    (e.audits_tier ?? 0) <= 2 && (e.tvl_usd ?? 0) > 250_000,

  access_control_missing: (e) =>
    ["EOA", "multisig", "renounced"].includes(e.upgrade_authority_type ?? "") &&
    (e.audits_tier ?? 0) <= 2,

  flash_loan_governance: (e) =>
    (e.governance_type ?? "") === "token_voting" ||
    overlap(e.bridge_dependencies, ["across", "stargate"]),

  price_impact_amm: (e) =>
    overlap(e.oracle_providers, ["uniswap_v3_twap"]) ||
    (e.sector ?? "").toLowerCase().includes("dex") ||
    (e.sector ?? "").toLowerCase().includes("perp"),

  validator_quorum_compromise: (e) =>
    overlap(e.bridge_dependencies, [
      "wormhole",
      "axelar",
      "ccip",
      "hyperlane",
    ]),

  dvn_collapse: (e) => e.dvn_configuration != null,

  frontend_dns_hijack: (e) =>
    ["vercel", "cloudflare_pages", "netlify"].includes(e.frontend_host ?? ""),

  supply_chain_npm: (e) => e.npm_lockfile_sha != null,

  signature_malleability: (e) =>
    overlap(e.chain_deployments, ["Bitcoin", "Ethereum"]) &&
    (e.audits_tier ?? 0) <= 2,

  private_key_leak: (e) =>
    SECTOR_CEX.has(e.sector ?? "") ||
    ["EOA"].includes(e.upgrade_authority_type ?? ""),

  kms_misconfiguration: (e) =>
    ["aws_kms", "gcp_kms", "azure_kv"].includes(e.kms_provider ?? ""),

  mpc_ceremony_compromise: (e) =>
    (e.kms_provider ?? "") === "fireblocks_mpc" ||
    SECTOR_CEX.has(e.sector ?? ""),

  ice_phishing_approval: (e) =>
    has(e.chain_deployments) &&
    (e.sector ?? "").length > 0 &&
    !SECTOR_CEX.has(e.sector ?? ""),

  phishing_drainer: (e) =>
    ["vercel", "cloudflare_pages", "netlify", "ipfs", "fleek"].includes(
      e.frontend_host ?? "",
    ),

  rug_pull_hard: (e) => e.is_anonymous_team === true,

  rug_pull_soft: (e) => e.is_anonymous_team === true,

  counterparty_default: (e) =>
    SECTOR_CEX.has(e.sector ?? "") || (e.tvl_usd ?? 0) > 100_000_000,

  regulatory_seizure: (e) =>
    ["US", "SG", "KY", "BVI"].includes(e.team_jurisdiction ?? ""),

  rounding_precision: (e) =>
    (e.audits_tier ?? 0) <= 1 && (e.tvl_usd ?? 0) > 100_000,

  governance_proposal_malicious: (e) =>
    ["token_voting", "delegated", "optimistic"].includes(e.governance_type ?? ""),

  cross_chain_replay: (e) => has(e.bridge_dependencies),

  prompt_injection_agent: (e) =>
    (e.has_security_disclosure_policy ?? false) === false &&
    has(e.chain_deployments),
};

export const ROOT_CAUSE_LIST = Object.keys(
  ROOT_CAUSE_PREDICATES,
) as RootCause[];

export function matchingRootCauses(e: PredicateEntity): RootCause[] {
  const out: RootCause[] = [];
  for (const rc of ROOT_CAUSE_LIST) {
    try {
      if (ROOT_CAUSE_PREDICATES[rc](e)) out.push(rc);
    } catch {
      // ignore — predicates must be total over the typed input.
    }
  }
  return out;
}
