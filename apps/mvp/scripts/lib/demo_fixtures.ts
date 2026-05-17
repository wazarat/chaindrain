import type { Weighted } from "./demo_rand";

export const ORACLE_POOL = [
  "chainlink",
  "pyth",
  "redstone",
  "uniswap_v3_twap",
  "api3",
  "internal",
] as const;

export const BRIDGE_POOL = [
  "layerzero",
  "wormhole",
  "axelar",
  "ccip",
  "across",
  "hyperlane",
  "stargate",
  "native",
] as const;

export const STABLECOIN_POOL = [
  "usdc",
  "usdt",
  "dai",
  "frax",
  "usde",
  "crvusd",
  "pyusd",
] as const;

export const LST_LRT_POOL = [
  "steth",
  "reth",
  "weeth",
  "ezeth",
  "rseth",
  "cbeth",
  "sfrxeth",
] as const;

export const DEX_VENUE_POOL = [
  "uniswap_v3",
  "uniswap_v4",
  "curve",
  "balancer",
  "velodrome",
  "camelot",
  "aerodrome",
  "pancakeswap",
] as const;

export const CEX_POOL = [
  "binance",
  "coinbase",
  "kraken",
  "okx",
  "bybit",
  "kucoin",
  "gateio",
  "bitget",
  "mexc",
  "htx",
] as const;

export const CUSTODIAN_POOL = [
  "Coinbase Custody",
  "Fireblocks",
  "BitGo",
  "Anchorage",
  "Copper",
  "Hex Trust",
  "Ceffu",
] as const;

export const KMS_PROVIDER_WEIGHTED: readonly Weighted<string>[] = [
  ["unknown", 0.35],
  ["aws_kms", 0.2],
  ["gcp_kms", 0.1],
  ["fireblocks_mpc", 0.18],
  ["hashicorp_vault", 0.08],
  ["internal_hsm", 0.05],
  ["azure_kv", 0.04],
];

export const RPC_PROVIDER_WEIGHTED: readonly Weighted<string>[] = [
  ["alchemy", 0.34],
  ["infura", 0.22],
  ["quicknode", 0.18],
  ["self_hosted", 0.16],
  ["ankr", 0.06],
  ["blast", 0.04],
];

export const FRONTEND_HOST_WEIGHTED: readonly Weighted<string>[] = [
  ["vercel", 0.41],
  ["cloudflare_pages", 0.22],
  ["aws_s3", 0.12],
  ["ipfs", 0.1],
  ["fleek", 0.08],
  ["netlify", 0.04],
  ["github_pages", 0.03],
];

export const AUDIT_FIRMS_POOL = [
  "Trail of Bits",
  "OpenZeppelin",
  "Halborn",
  "ChainSecurity",
  "Spearbit",
  "Cantina",
  "Quantstamp",
  "Certora",
  "Zellic",
  "Code4rena",
] as const;

export const COMPILER_VERSION_WEIGHTED: readonly Weighted<string>[] = [
  ["0.8.20", 0.3],
  ["0.8.19", 0.28],
  ["0.8.13", 0.16],
  ["0.8.10", 0.13],
  ["0.7.6", 0.08],
  ["0.6.12", 0.05],
];

export const PROXY_PATTERN_WEIGHTED: readonly Weighted<string>[] = [
  ["transparent", 0.27],
  ["uups", 0.22],
  ["beacon", 0.04],
  ["diamond", 0.05],
  ["none", 0.42],
];

export const BUG_BOUNTY_PROGRAM_WEIGHTED: readonly Weighted<string>[] = [
  ["none", 0.45],
  ["immunefi", 0.42],
  ["internal", 0.1],
  ["cantina", 0.03],
];

export const GOVERNANCE_TYPE_WEIGHTED: readonly Weighted<string>[] = [
  ["none", 0.18],
  ["multisig_council", 0.34],
  ["token_voting", 0.28],
  ["delegated", 0.14],
  ["optimistic", 0.06],
];

export const TEAM_JURISDICTION_WEIGHTED: readonly Weighted<string>[] = [
  ["US", 0.18],
  ["CH", 0.12],
  ["SG", 0.11],
  ["KY", 0.08],
  ["BVI", 0.08],
  ["AE", 0.07],
  ["GB", 0.06],
  ["PT", 0.05],
  ["DE", 0.05],
  ["FR", 0.04],
  ["JP", 0.04],
  ["KR", 0.04],
  ["IL", 0.03],
  ["OTHER", 0.05],
];

export const INCORPORATION_SUFFIXES = [
  "Foundation",
  "Labs Ltd.",
  "DAO LLC",
  "Holdings AG",
  "Pte. Ltd.",
] as const;

export const KYT_STATUS_WEIGHTED: readonly Weighted<string>[] = [
  ["clean", 0.86],
  ["mixed", 0.11],
  ["sanctioned_exposure", 0.03],
];

export const ATTACKER_ATTRIBUTION_WEIGHTED: readonly Weighted<string>[] = [
  ["unknown", 0.4],
  ["unattributed_criminal", 0.3],
  ["dprk_lazarus", 0.1],
  ["mev_searcher", 0.08],
  ["internal", 0.06],
  ["whitehat", 0.06],
];

export const DVN_POOL = [
  "LayerZero Labs",
  "Google Cloud",
  "Polyhedra",
  "Nethermind",
  "BCW",
  "Animoca",
  "Horizen",
] as const;

export const SUBSECTOR_TAG_MAP: Record<string, readonly string[]> = {
  Lending: ["money_market", "isolated_pool", "rwa_collateral", "fixed_rate"],
  Bridge: ["lock_and_mint", "burn_and_mint", "native", "intent_based"],
  "Liquid Staking": ["validator_pool", "rebase_token", "wrapped_lst"],
  Restaking: ["eigenlayer", "symbiotic", "karak"],
  CEX: ["spot", "derivatives", "custody", "fiat_onramp"],
  "Tokenized Real-World Assets": ["treasury", "credit", "real_estate", "carbon"],
  RWA: ["treasury", "credit", "carbon"],
  DEX: ["amm_v2", "amm_v3", "clob", "intent_solver"],
  Yield: ["auto_compounder", "delta_neutral", "fixed_rate"],
  "Yield Farm": ["auto_compounder", "delta_neutral"],
  Stablecoin: ["fiat_backed", "crypto_backed", "algorithmic"],
  Perpetuals: ["isolated_margin", "cross_margin", "vault_lp"],
  "Perp DEX": ["isolated_margin", "cross_margin", "vault_lp"],
  Custodian: ["institutional", "qualified_custodian", "self_custody"],
  "Tokenization Platform": ["treasury", "credit", "equity"],
  Infrastructure: ["rollup", "data_availability", "shared_sequencer"],
  Insurance: ["mutual", "parametric", "tranched"],
  Wallet: ["smart_account", "mpc", "hardware"],
  MemeCoin: ["fair_launch", "celebrity", "platform"],
  "Anon Bridge": ["mixer", "shielded_pool"],
};

export const SUBSECTOR_FALLBACK = [
  "general_defi",
  "consumer_app",
  "infra_tooling",
] as const;

export const HIGH_TVL_SECTORS_FOR_LIST = new Set([
  "Liquid Staking",
  "Restaking",
  "Lending",
  "Yield",
  "Yield Farm",
]);

export const FRONTEND_DNS_HIJACK_HOSTS = new Set([
  "vercel",
  "cloudflare_pages",
  "netlify",
]);

export const KMS_HIJACK_PROVIDERS = new Set([
  "aws_kms",
  "gcp_kms",
  "azure_kv",
]);

export type RootCause =
  | "oracle_manipulation"
  | "proxy_admin_compromise"
  | "reentrancy"
  | "access_control_missing"
  | "flash_loan_governance"
  | "price_impact_amm"
  | "validator_quorum_compromise"
  | "dvn_collapse"
  | "frontend_dns_hijack"
  | "supply_chain_npm"
  | "signature_malleability"
  | "private_key_leak"
  | "kms_misconfiguration"
  | "mpc_ceremony_compromise"
  | "ice_phishing_approval"
  | "phishing_drainer"
  | "rug_pull_hard"
  | "rug_pull_soft"
  | "counterparty_default"
  | "regulatory_seizure"
  | "rounding_precision"
  | "governance_proposal_malicious"
  | "cross_chain_replay"
  | "prompt_injection_agent";

export const ROOT_CAUSES: readonly RootCause[] = [
  "oracle_manipulation",
  "proxy_admin_compromise",
  "reentrancy",
  "access_control_missing",
  "flash_loan_governance",
  "price_impact_amm",
  "validator_quorum_compromise",
  "dvn_collapse",
  "frontend_dns_hijack",
  "supply_chain_npm",
  "signature_malleability",
  "private_key_leak",
  "kms_misconfiguration",
  "mpc_ceremony_compromise",
  "ice_phishing_approval",
  "phishing_drainer",
  "rug_pull_hard",
  "rug_pull_soft",
  "counterparty_default",
  "regulatory_seizure",
  "rounding_precision",
  "governance_proposal_malicious",
  "cross_chain_replay",
  "prompt_injection_agent",
];

export interface RootCauseSpec {
  count: number;
  lossMin: number;
  lossMax: number;
  attackLayer:
    | "protocol"
    | "cryptoasset"
    | "frontend"
    | "infrastructure"
    | "social"
    | "human_op";
  attackStrategy:
    | "tech_vuln"
    | "human_exploit"
    | "internal_theft"
    | "market_manipulation"
    | "imitation_phishing";
  flashLoanProb: number;
  notes?: string;
}

export const ROOT_CAUSE_SPECS: Record<RootCause, RootCauseSpec> = {
  oracle_manipulation: {
    count: 38,
    lossMin: 5_000_000,
    lossMax: 120_000_000,
    attackLayer: "protocol",
    attackStrategy: "market_manipulation",
    flashLoanProb: 0.25,
    notes: "Mango-shape — 1–3 victims",
  },
  proxy_admin_compromise: {
    count: 32,
    lossMin: 1_000_000,
    lossMax: 600_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  reentrancy: {
    count: 28,
    lossMin: 500_000,
    lossMax: 80_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  access_control_missing: {
    count: 26,
    lossMin: 200_000,
    lossMax: 15_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  flash_loan_governance: {
    count: 18,
    lossMin: 1_000_000,
    lossMax: 200_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.75,
  },
  price_impact_amm: {
    count: 18,
    lossMin: 500_000,
    lossMax: 50_000_000,
    attackLayer: "protocol",
    attackStrategy: "market_manipulation",
    flashLoanProb: 0.5,
  },
  validator_quorum_compromise: {
    count: 14,
    lossMin: 5_000_000,
    lossMax: 600_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  dvn_collapse: {
    count: 8,
    lossMin: 1_000_000,
    lossMax: 100_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  frontend_dns_hijack: {
    count: 12,
    lossMin: 200_000,
    lossMax: 25_000_000,
    attackLayer: "frontend",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  supply_chain_npm: {
    count: 10,
    lossMin: 100_000,
    lossMax: 30_000_000,
    attackLayer: "infrastructure",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  signature_malleability: {
    count: 8,
    lossMin: 250_000,
    lossMax: 20_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  private_key_leak: {
    count: 22,
    lossMin: 1_000_000,
    lossMax: 1_500_000_000,
    attackLayer: "infrastructure",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  kms_misconfiguration: {
    count: 9,
    lossMin: 500_000,
    lossMax: 90_000_000,
    attackLayer: "infrastructure",
    attackStrategy: "human_exploit",
    flashLoanProb: 0.05,
  },
  mpc_ceremony_compromise: {
    count: 4,
    lossMin: 5_000_000,
    lossMax: 250_000_000,
    attackLayer: "infrastructure",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  ice_phishing_approval: {
    count: 16,
    lossMin: 50_000,
    lossMax: 8_000_000,
    attackLayer: "human_op",
    attackStrategy: "human_exploit",
    flashLoanProb: 0.05,
  },
  phishing_drainer: {
    count: 18,
    lossMin: 100_000,
    lossMax: 12_000_000,
    attackLayer: "human_op",
    attackStrategy: "human_exploit",
    flashLoanProb: 0.05,
  },
  rug_pull_hard: {
    count: 22,
    lossMin: 100_000,
    lossMax: 50_000_000,
    attackLayer: "social",
    attackStrategy: "internal_theft",
    flashLoanProb: 0.05,
  },
  rug_pull_soft: {
    count: 14,
    lossMin: 50_000,
    lossMax: 20_000_000,
    attackLayer: "social",
    attackStrategy: "internal_theft",
    flashLoanProb: 0.05,
  },
  counterparty_default: {
    count: 8,
    lossMin: 5_000_000,
    lossMax: 1_000_000_000,
    attackLayer: "cryptoasset",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  regulatory_seizure: {
    count: 6,
    lossMin: 1_000_000,
    lossMax: 250_000_000,
    attackLayer: "social",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  rounding_precision: {
    count: 10,
    lossMin: 50_000,
    lossMax: 5_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  governance_proposal_malicious: {
    count: 5,
    lossMin: 500_000,
    lossMax: 80_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.2,
  },
  cross_chain_replay: {
    count: 6,
    lossMin: 250_000,
    lossMax: 60_000_000,
    attackLayer: "protocol",
    attackStrategy: "tech_vuln",
    flashLoanProb: 0.05,
  },
  prompt_injection_agent: {
    count: 4,
    lossMin: 50_000,
    lossMax: 5_000_000,
    attackLayer: "human_op",
    attackStrategy: "human_exploit",
    flashLoanProb: 0.05,
  },
};

export const SECONDARY_ROOT_CAUSE_HINTS: Partial<Record<RootCause, RootCause[]>> = {
  oracle_manipulation: ["price_impact_amm", "flash_loan_governance"],
  flash_loan_governance: ["governance_proposal_malicious", "oracle_manipulation"],
  proxy_admin_compromise: ["access_control_missing", "private_key_leak"],
  reentrancy: ["access_control_missing"],
  validator_quorum_compromise: ["dvn_collapse", "private_key_leak"],
  dvn_collapse: ["validator_quorum_compromise"],
  frontend_dns_hijack: ["supply_chain_npm"],
  supply_chain_npm: ["frontend_dns_hijack"],
  ice_phishing_approval: ["phishing_drainer"],
  phishing_drainer: ["ice_phishing_approval"],
  kms_misconfiguration: ["private_key_leak"],
  private_key_leak: ["kms_misconfiguration"],
  rug_pull_hard: ["rug_pull_soft"],
  rug_pull_soft: ["rug_pull_hard"],
};
