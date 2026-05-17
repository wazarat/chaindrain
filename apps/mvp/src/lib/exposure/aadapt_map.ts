import type { RootCause } from "../../../scripts/lib/demo_fixtures";

// MITRE AADAPT-shaped tactic IDs. These are placeholder identifiers shaped
// like the upstream AADAPT taxonomy (TA0001 = Reconnaissance, TA0007 =
// Discovery, etc.) so the UI can render chips that look real. Each value is
// prefixed `DEMO:` so the UI can render a small "demo" chip next to it.
//
// Phase 3c will swap these for the actual MITRE codes from
// https://github.com/CenterForThreatInformedDefense/aadapt and remove the
// `DEMO:` prefix.

const tag = (id: string): string => `DEMO:AADAPT.${id}`;

export const AADAPT_TACTIC_MAP: Record<RootCause, readonly string[]> = {
  oracle_manipulation: [tag("TA0040"), tag("TA0007")],
  proxy_admin_compromise: [tag("TA0006"), tag("TA0008")],
  reentrancy: [tag("TA0004"), tag("TA0040")],
  access_control_missing: [tag("TA0004"), tag("TA0006")],
  flash_loan_governance: [tag("TA0040"), tag("TA0009")],
  price_impact_amm: [tag("TA0040")],
  validator_quorum_compromise: [tag("TA0006"), tag("TA0008")],
  dvn_collapse: [tag("TA0008")],
  frontend_dns_hijack: [tag("TA0001"), tag("TA0008")],
  supply_chain_npm: [tag("TA0001"), tag("TA0011")],
  signature_malleability: [tag("TA0004")],
  private_key_leak: [tag("TA0006"), tag("TA0009")],
  kms_misconfiguration: [tag("TA0006"), tag("TA0005")],
  mpc_ceremony_compromise: [tag("TA0006"), tag("TA0005")],
  ice_phishing_approval: [tag("TA0001"), tag("TA0040")],
  phishing_drainer: [tag("TA0001"), tag("TA0040")],
  rug_pull_hard: [tag("TA0040"), tag("TA0010")],
  rug_pull_soft: [tag("TA0040")],
  counterparty_default: [tag("TA0010")],
  regulatory_seizure: [tag("TA0010")],
  rounding_precision: [tag("TA0004")],
  governance_proposal_malicious: [tag("TA0009"), tag("TA0040")],
  cross_chain_replay: [tag("TA0008"), tag("TA0011")],
  prompt_injection_agent: [tag("TA0001"), tag("TA0011")],
};

export const AADAPT_TECHNIQUE_MAP: Record<RootCause, readonly string[]> = {
  oracle_manipulation: ["DEMO:AADAPT.T1499.001", "DEMO:AADAPT.T1565.003"],
  proxy_admin_compromise: ["DEMO:AADAPT.T1078.004"],
  reentrancy: ["DEMO:AADAPT.T1190"],
  access_control_missing: ["DEMO:AADAPT.T1078"],
  flash_loan_governance: ["DEMO:AADAPT.T1565.003"],
  price_impact_amm: ["DEMO:AADAPT.T1499.002"],
  validator_quorum_compromise: ["DEMO:AADAPT.T1110"],
  dvn_collapse: ["DEMO:AADAPT.T1499"],
  frontend_dns_hijack: ["DEMO:AADAPT.T1071.001", "DEMO:AADAPT.T1583.001"],
  supply_chain_npm: ["DEMO:AADAPT.T1195.002"],
  signature_malleability: ["DEMO:AADAPT.T1190"],
  private_key_leak: ["DEMO:AADAPT.T1552.001"],
  kms_misconfiguration: ["DEMO:AADAPT.T1552.005"],
  mpc_ceremony_compromise: ["DEMO:AADAPT.T1552"],
  ice_phishing_approval: ["DEMO:AADAPT.T1566.002"],
  phishing_drainer: ["DEMO:AADAPT.T1566.003"],
  rug_pull_hard: ["DEMO:AADAPT.T1657"],
  rug_pull_soft: ["DEMO:AADAPT.T1657"],
  counterparty_default: ["DEMO:AADAPT.T1657"],
  regulatory_seizure: ["DEMO:AADAPT.T1657"],
  rounding_precision: ["DEMO:AADAPT.T1190"],
  governance_proposal_malicious: ["DEMO:AADAPT.T1565.003"],
  cross_chain_replay: ["DEMO:AADAPT.T1499"],
  prompt_injection_agent: ["DEMO:AADAPT.T1059"],
};

export function getAadaptTactics(rc: string): string[] {
  return [...(AADAPT_TACTIC_MAP[rc as RootCause] ?? [])];
}

export function getAadaptTechniques(rc: string): string[] {
  return [...(AADAPT_TECHNIQUE_MAP[rc as RootCause] ?? [])];
}
