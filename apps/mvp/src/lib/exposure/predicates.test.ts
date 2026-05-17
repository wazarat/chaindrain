import { describe, expect, it } from "vitest";
import {
  ROOT_CAUSE_LIST,
  ROOT_CAUSE_PREDICATES,
  matchingRootCauses,
  type PredicateEntity,
} from "./predicates";

const minimal = (overrides: Partial<PredicateEntity> = {}): PredicateEntity => ({
  entity_id: "00000000-0000-0000-0000-000000000000",
  name: "test",
  sector: null,
  tvl_usd: null,
  oracle_providers: null,
  oracle_fallback_present: null,
  bridge_dependencies: null,
  stablecoin_dependencies: null,
  chain_deployments: null,
  upgrade_authority_type: null,
  multisig_threshold: null,
  audits_tier: null,
  dvn_configuration: null,
  frontend_host: null,
  npm_lockfile_sha: null,
  kms_provider: null,
  is_anonymous_team: null,
  team_jurisdiction: null,
  has_security_disclosure_policy: null,
  governance_type: null,
  ...overrides,
});

describe("ROOT_CAUSE_PREDICATES", () => {
  it("ships exactly 24 predicates matching the demo fixtures", () => {
    expect(ROOT_CAUSE_LIST).toHaveLength(24);
  });

  it("every predicate is total — never throws on the minimal input", () => {
    const e = minimal();
    for (const rc of ROOT_CAUSE_LIST) {
      expect(() => ROOT_CAUSE_PREDICATES[rc](e)).not.toThrow();
    }
  });

  it("oracle_manipulation requires chainlink/pyth + >$1M TVL + no fallback", () => {
    expect(
      ROOT_CAUSE_PREDICATES.oracle_manipulation(
        minimal({ oracle_providers: ["chainlink"], tvl_usd: 5_000_000 }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.oracle_manipulation(
        minimal({
          oracle_providers: ["chainlink"],
          tvl_usd: 5_000_000,
          oracle_fallback_present: true,
        }),
      ),
    ).toBe(false);
    expect(
      ROOT_CAUSE_PREDICATES.oracle_manipulation(
        minimal({ oracle_providers: ["chainlink"], tvl_usd: 100 }),
      ),
    ).toBe(false);
  });

  it("proxy_admin_compromise fires for EOA upgrade authority + weak audits", () => {
    expect(
      ROOT_CAUSE_PREDICATES.proxy_admin_compromise(
        minimal({ upgrade_authority_type: "EOA", audits_tier: 1 }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.proxy_admin_compromise(
        minimal({ upgrade_authority_type: "EOA", audits_tier: 4 }),
      ),
    ).toBe(false);
  });

  it("reentrancy fires for audits_tier <= 2 and TVL > $250k", () => {
    expect(
      ROOT_CAUSE_PREDICATES.reentrancy(
        minimal({ audits_tier: 1, tvl_usd: 500_000 }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.reentrancy(
        minimal({ audits_tier: 3, tvl_usd: 500_000 }),
      ),
    ).toBe(false);
  });

  it("access_control_missing fires for EOA/multisig/renounced + audits_tier <= 2", () => {
    expect(
      ROOT_CAUSE_PREDICATES.access_control_missing(
        minimal({ upgrade_authority_type: "multisig", audits_tier: 2 }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.access_control_missing(
        minimal({ upgrade_authority_type: "dao_timelock", audits_tier: 2 }),
      ),
    ).toBe(false);
  });

  it("flash_loan_governance fires for token_voting governance", () => {
    expect(
      ROOT_CAUSE_PREDICATES.flash_loan_governance(
        minimal({ governance_type: "token_voting" }),
      ),
    ).toBe(true);
  });

  it("price_impact_amm fires for uniswap_v3_twap or dex/perp sector", () => {
    expect(
      ROOT_CAUSE_PREDICATES.price_impact_amm(
        minimal({ oracle_providers: ["uniswap_v3_twap"] }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.price_impact_amm(minimal({ sector: "DEX" })),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.price_impact_amm(minimal({ sector: "Lending" })),
    ).toBe(false);
  });

  it("validator_quorum_compromise fires for known multi-validator bridges", () => {
    expect(
      ROOT_CAUSE_PREDICATES.validator_quorum_compromise(
        minimal({ bridge_dependencies: ["wormhole"] }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.validator_quorum_compromise(
        minimal({ bridge_dependencies: ["bedrock"] }),
      ),
    ).toBe(false);
  });

  it("dvn_collapse fires whenever a DVN configuration is present", () => {
    expect(
      ROOT_CAUSE_PREDICATES.dvn_collapse(
        minimal({ dvn_configuration: "lz_default_3" }),
      ),
    ).toBe(true);
    expect(ROOT_CAUSE_PREDICATES.dvn_collapse(minimal())).toBe(false);
  });

  it("frontend_dns_hijack fires for cloud frontend hosts", () => {
    for (const host of ["vercel", "cloudflare_pages", "netlify"]) {
      expect(
        ROOT_CAUSE_PREDICATES.frontend_dns_hijack(
          minimal({ frontend_host: host }),
        ),
      ).toBe(true);
    }
  });

  it("supply_chain_npm fires when a lockfile hash is recorded", () => {
    expect(
      ROOT_CAUSE_PREDICATES.supply_chain_npm(
        minimal({ npm_lockfile_sha: "abc123" }),
      ),
    ).toBe(true);
  });

  it("signature_malleability fires on btc/eth + weak audits", () => {
    expect(
      ROOT_CAUSE_PREDICATES.signature_malleability(
        minimal({ chain_deployments: ["Ethereum"], audits_tier: 1 }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.signature_malleability(
        minimal({ chain_deployments: ["Solana"], audits_tier: 1 }),
      ),
    ).toBe(false);
  });

  it("private_key_leak fires on EOA upgrade authority", () => {
    expect(
      ROOT_CAUSE_PREDICATES.private_key_leak(
        minimal({ upgrade_authority_type: "EOA" }),
      ),
    ).toBe(true);
  });

  it("kms_misconfiguration fires for cloud KMS providers", () => {
    expect(
      ROOT_CAUSE_PREDICATES.kms_misconfiguration(
        minimal({ kms_provider: "aws_kms" }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.kms_misconfiguration(
        minimal({ kms_provider: "fireblocks_mpc" }),
      ),
    ).toBe(false);
  });

  it("mpc_ceremony_compromise fires for fireblocks_mpc OR custody sectors", () => {
    expect(
      ROOT_CAUSE_PREDICATES.mpc_ceremony_compromise(
        minimal({ kms_provider: "fireblocks_mpc" }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.mpc_ceremony_compromise(
        minimal({ sector: "CEX" }),
      ),
    ).toBe(true);
  });

  it("ice_phishing_approval fires on non-custodial sectors with chain deployments", () => {
    expect(
      ROOT_CAUSE_PREDICATES.ice_phishing_approval(
        minimal({ sector: "DeFi", chain_deployments: ["Ethereum"] }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.ice_phishing_approval(
        minimal({ sector: "CEX", chain_deployments: ["Ethereum"] }),
      ),
    ).toBe(false);
  });

  it("phishing_drainer fires for any cloud/IPFS frontend host", () => {
    expect(
      ROOT_CAUSE_PREDICATES.phishing_drainer(
        minimal({ frontend_host: "fleek" }),
      ),
    ).toBe(true);
  });

  it("rug_pull_hard and rug_pull_soft fire only on anonymous teams", () => {
    expect(
      ROOT_CAUSE_PREDICATES.rug_pull_hard(
        minimal({ is_anonymous_team: true }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.rug_pull_soft(
        minimal({ is_anonymous_team: false }),
      ),
    ).toBe(false);
  });

  it("counterparty_default fires for CEX/custody sectors OR > $100M TVL", () => {
    expect(
      ROOT_CAUSE_PREDICATES.counterparty_default(minimal({ sector: "CEX" })),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.counterparty_default(
        minimal({ tvl_usd: 200_000_000 }),
      ),
    ).toBe(true);
  });

  it("regulatory_seizure fires for US/SG/KY/BVI jurisdictions", () => {
    expect(
      ROOT_CAUSE_PREDICATES.regulatory_seizure(
        minimal({ team_jurisdiction: "US" }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.regulatory_seizure(
        minimal({ team_jurisdiction: "CH" }),
      ),
    ).toBe(false);
  });

  it("rounding_precision fires for audits_tier <= 1 with TVL > $100k", () => {
    expect(
      ROOT_CAUSE_PREDICATES.rounding_precision(
        minimal({ audits_tier: 0, tvl_usd: 500_000 }),
      ),
    ).toBe(true);
  });

  it("governance_proposal_malicious fires for vote-driven governance", () => {
    for (const g of ["token_voting", "delegated", "optimistic"]) {
      expect(
        ROOT_CAUSE_PREDICATES.governance_proposal_malicious(
          minimal({ governance_type: g }),
        ),
      ).toBe(true);
    }
  });

  it("cross_chain_replay fires whenever any bridge dependency exists", () => {
    expect(
      ROOT_CAUSE_PREDICATES.cross_chain_replay(
        minimal({ bridge_dependencies: ["wormhole"] }),
      ),
    ).toBe(true);
    expect(ROOT_CAUSE_PREDICATES.cross_chain_replay(minimal())).toBe(false);
  });

  it("prompt_injection_agent fires when no security disclosure + deployments", () => {
    expect(
      ROOT_CAUSE_PREDICATES.prompt_injection_agent(
        minimal({
          chain_deployments: ["Ethereum"],
          has_security_disclosure_policy: false,
        }),
      ),
    ).toBe(true);
    expect(
      ROOT_CAUSE_PREDICATES.prompt_injection_agent(
        minimal({
          chain_deployments: ["Ethereum"],
          has_security_disclosure_policy: true,
        }),
      ),
    ).toBe(false);
  });

  it("matchingRootCauses returns the same list across reruns (deterministic)", () => {
    const e = minimal({
      sector: "RWA",
      oracle_providers: ["chainlink"],
      tvl_usd: 50_000_000,
      chain_deployments: ["Ethereum"],
    });
    const a = matchingRootCauses(e);
    const b = matchingRootCauses(e);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
