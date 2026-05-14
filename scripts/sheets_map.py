"""Canonical mapping of Google Sheet (file_id, gid) -> (sector_slug, subsector_slug).

Keep this in lock-step with `supabase/seed.sql`.
Add a `notes` field for sheets that need special handling on import.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SheetTarget:
    sector_slug: str
    subsector_slug: str
    file_id: str
    gid: str
    label: str
    notes: str = ""


# Spreadsheet IDs (one per sector workbook)
CORE_PROTO = "1eSqVRbzdd53dbVNJEM5-uH1NKBB8Cmyh4TWrXPCMEBU"
ROLLUP_SCALING = "1J08OAuQ5UW4HQfoOrInTxYnoKXWqppOCRBr-1PxaKLk"
MONETARY = "1MyXItem529dr0NGkXmVQXS0zvzdwm-yNTQoh56LYEtI"
DEFI = "1bdcu0UIBvZ6ZLmuG9rTLvXrVEdTh3wg1W9yMZ90K6pU"
DATA_INFRA = "1oxpdT9qsScSl8b3nL543bEO-q8GRTj2CtfACsfu1W8A"
ADVANCED_COMPUTE = "1mpaWTCz9tTaKiJ1sBENEsetbRo85NX2NrCvOTbVtvZU"
GOV_ENTERPRISE = "1dQr7W47rQ1L83lTIuNrTl324hH6fDB1Lek7kSqgxZec"


SHEETS: list[SheetTarget] = [
    # Core Protocol Architecture
    SheetTarget("core-protocol-architecture", "consensus-layer",              CORE_PROTO, "0",         "Consensus Layer"),
    SheetTarget("core-protocol-architecture", "execution-layer",              CORE_PROTO, "1973587895","Execution Layer"),
    SheetTarget("core-protocol-architecture", "validators-staking-providers", CORE_PROTO, "1461607073","Validators & Staking Providers"),
    SheetTarget("core-protocol-architecture", "mev-block-builders",           CORE_PROTO, "1892242156","MEV & Block Builders"),
    SheetTarget("core-protocol-architecture", "network-upgrades",             CORE_PROTO, "853500365", "Network Upgrades"),

    # Rollup & Scaling Frameworks
    SheetTarget("rollup-scaling-frameworks", "optimistic-rollups",                  ROLLUP_SCALING, "1623116093","Optimistic Rollups"),
    SheetTarget("rollup-scaling-frameworks", "zk-rollups",                          ROLLUP_SCALING, "841503241", "ZK Rollups"),
    SheetTarget("rollup-scaling-frameworks", "l3-appchain-frameworks",              ROLLUP_SCALING, "698572346", "L3 & Appchain Frameworks", notes="User flagged: may have malformed rows; importer will skip-and-log"),
    SheetTarget("rollup-scaling-frameworks", "validiums-volitions-hybrid-rollups",  ROLLUP_SCALING, "2102310935","Validiums, Volitions, and Hybrid Rollups"),

    # Monetary & Access Rails
    SheetTarget("monetary-access-rails", "centralized-stablecoins",         MONETARY, "740017838", "Centralized Stablecoins"),
    SheetTarget("monetary-access-rails", "decentralized-stablecoins",       MONETARY, "793795651", "Decentralized Stablecoins"),
    SheetTarget("monetary-access-rails", "synthetic-yield-bearing-dollars", MONETARY, "2027955655","Synthetic & Yield-Bearing Dollars"),
    SheetTarget("monetary-access-rails", "global-on-ramps",                 MONETARY, "536722612", "Global On-Ramps"),
    SheetTarget("monetary-access-rails", "institutional-payment-rails",     MONETARY, "1092087303","Institutional Payment Rails"),
    SheetTarget("monetary-access-rails", "regional-payment-networks",       MONETARY, "353346319", "Regional Payment Networks"),

    # DeFi Systems Architecture
    SheetTarget("defi-systems-architecture", "lending-markets",          DEFI, "1468161002","Lending Markets"),
    SheetTarget("defi-systems-architecture", "dexs-liquidity-protocols", DEFI, "1271133982","DEXs & Liquidity Protocols"),
    SheetTarget("defi-systems-architecture", "yield-structured-markets", DEFI, "472989866", "Yield & Structured Markets"),
    SheetTarget("defi-systems-architecture", "liquid-staking-tokens",    DEFI, "104070153", "Liquid Staking Tokens (LSTs)"),
    SheetTarget("defi-systems-architecture", "restaking-systems",        DEFI, "858691553", "Restaking Systems"),
    SheetTarget("defi-systems-architecture", "synthetic-derivatives",    DEFI, "970731173", "Synthetic & Derivatives"),

    # Data & Consensus Infrastructure
    SheetTarget("data-consensus-infrastructure", "rpc-node-providers",        DATA_INFRA, "1270499317","RPC & Node Providers"),
    SheetTarget("data-consensus-infrastructure", "oracles-data-networks",     DATA_INFRA, "1127240504","Oracles & Data Networks"),
    SheetTarget("data-consensus-infrastructure", "data-availability-systems", DATA_INFRA, "154577554", "Data Availability Systems"),
    SheetTarget("data-consensus-infrastructure", "indexing-query-engines",    DATA_INFRA, "1023110846","Indexing & Query Engines"),
    SheetTarget("data-consensus-infrastructure", "analytics-intelligence",    DATA_INFRA, "457625346", "Analytics & Intelligence"),

    # Advanced Compute & Integration
    SheetTarget("advanced-compute-integration", "ai-agents-autonomous-systems",  ADVANCED_COMPUTE, "1608239665","AI Agents & Autonomous Systems"),
    SheetTarget("advanced-compute-integration", "real-world-assets",             ADVANCED_COMPUTE, "1894391559","Real World Assets (RWAs)"),
    SheetTarget("advanced-compute-integration", "identity-social-graphs",        ADVANCED_COMPUTE, "341534256", "Identity & Social Graphs"),
    SheetTarget("advanced-compute-integration", "depin-physical-infrastructure", ADVANCED_COMPUTE, "1254628628","DePIN (Physical Infrastructure)"),
    SheetTarget("advanced-compute-integration", "cross-chain-compute",           ADVANCED_COMPUTE, "403856203", "Cross-Chain Compute"),

    # Governance & Enterprise Framework
    SheetTarget("governance-enterprise-framework", "dao-governance-systems",            GOV_ENTERPRISE, "1800934348","DAO Governance Systems"),
    SheetTarget("governance-enterprise-framework", "enterprise-blockchain-adoption",    GOV_ENTERPRISE, "2131719987","Enterprise Blockchain Adoption"),
    SheetTarget("governance-enterprise-framework", "cbdcs-public-sector-pilots",        GOV_ENTERPRISE, "652382610", "CBDCs & Public Sector Pilots"),
    SheetTarget("governance-enterprise-framework", "compliance-regulatory-intelligence",GOV_ENTERPRISE, "341111534", "Compliance & Regulatory Intelligence"),
    SheetTarget("governance-enterprise-framework", "institutional-custody-security",    GOV_ENTERPRISE, "1845020211","Institutional Custody & Security"),
]


def export_csv_url(target: SheetTarget) -> str:
    """Public-link CSV export URL.

    Works if the sheet is shared "Anyone with the link → Viewer".
    Format `out:csv` via the gviz API is more tolerant of empty rows than
    the legacy `/export?format=csv` endpoint.
    """
    return (
        f"https://docs.google.com/spreadsheets/d/{target.file_id}"
        f"/gviz/tq?tqx=out:csv&gid={target.gid}"
    )
