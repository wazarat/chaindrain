-- =====================================================================
-- Canonical taxonomy: 7 sectors, 34 subsectors.
-- Companies arrive via scripts/import_from_google_sheets.py
-- (or scripts/import_companies.py for an offline CSV).
-- =====================================================================

insert into public.sectors (slug, name, description) values
  ('core-protocol-architecture',  'Core Protocol Architecture',
    'Consensus, execution, validators, MEV, and network upgrades'),
  ('rollup-scaling-frameworks',   'Rollup & Scaling Frameworks',
    'Optimistic, ZK, L3/appchain, and hybrid scaling systems'),
  ('monetary-access-rails',       'Monetary & Access Rails',
    'Stablecoins, on-ramps, and institutional/regional payment networks'),
  ('defi-systems-architecture',   'DeFi Systems Architecture',
    'Lending, DEXs, yield, LSTs, restaking, and synthetics/derivatives'),
  ('data-consensus-infrastructure', 'Data & Consensus Infrastructure',
    'RPC, oracles, DA, indexing, and analytics intelligence'),
  ('advanced-compute-integration',  'Advanced Compute & Integration',
    'AI agents, RWAs, identity, DePIN, and cross-chain compute'),
  ('governance-enterprise-framework', 'Governance & Enterprise Framework',
    'DAO governance, enterprise adoption, CBDCs, compliance, and custody')
on conflict (slug) do nothing;

insert into public.subsectors (sector_id, slug, name)
select s.id, sub.slug, sub.name
from (values
  -- Core Protocol Architecture
  ('core-protocol-architecture', 'consensus-layer',              'Consensus Layer'),
  ('core-protocol-architecture', 'execution-layer',              'Execution Layer'),
  ('core-protocol-architecture', 'validators-staking-providers', 'Validators & Staking Providers'),
  ('core-protocol-architecture', 'mev-block-builders',           'MEV & Block Builders'),
  ('core-protocol-architecture', 'network-upgrades',             'Network Upgrades'),

  -- Rollup & Scaling Frameworks
  ('rollup-scaling-frameworks', 'optimistic-rollups',                  'Optimistic Rollups'),
  ('rollup-scaling-frameworks', 'zk-rollups',                          'ZK Rollups'),
  ('rollup-scaling-frameworks', 'l3-appchain-frameworks',              'L3 & Appchain Frameworks'),
  ('rollup-scaling-frameworks', 'validiums-volitions-hybrid-rollups',  'Validiums, Volitions, and Hybrid Rollups'),

  -- Monetary & Access Rails
  ('monetary-access-rails', 'centralized-stablecoins',          'Centralized Stablecoins'),
  ('monetary-access-rails', 'decentralized-stablecoins',        'Decentralized Stablecoins'),
  ('monetary-access-rails', 'synthetic-yield-bearing-dollars',  'Synthetic & Yield-Bearing Dollars'),
  ('monetary-access-rails', 'global-on-ramps',                  'Global On-Ramps'),
  ('monetary-access-rails', 'institutional-payment-rails',      'Institutional Payment Rails'),
  ('monetary-access-rails', 'regional-payment-networks',        'Regional Payment Networks'),

  -- DeFi Systems Architecture
  ('defi-systems-architecture', 'lending-markets',          'Lending Markets'),
  ('defi-systems-architecture', 'dexs-liquidity-protocols', 'DEXs & Liquidity Protocols'),
  ('defi-systems-architecture', 'yield-structured-markets', 'Yield & Structured Markets'),
  ('defi-systems-architecture', 'liquid-staking-tokens',    'Liquid Staking Tokens (LSTs)'),
  ('defi-systems-architecture', 'restaking-systems',        'Restaking Systems'),
  ('defi-systems-architecture', 'synthetic-derivatives',    'Synthetic & Derivatives'),

  -- Data & Consensus Infrastructure
  ('data-consensus-infrastructure', 'rpc-node-providers',         'RPC & Node Providers'),
  ('data-consensus-infrastructure', 'oracles-data-networks',      'Oracles & Data Networks'),
  ('data-consensus-infrastructure', 'data-availability-systems',  'Data Availability Systems'),
  ('data-consensus-infrastructure', 'indexing-query-engines',     'Indexing & Query Engines'),
  ('data-consensus-infrastructure', 'analytics-intelligence',     'Analytics & Intelligence'),

  -- Advanced Compute & Integration
  ('advanced-compute-integration', 'ai-agents-autonomous-systems', 'AI Agents & Autonomous Systems'),
  ('advanced-compute-integration', 'real-world-assets',            'Real World Assets (RWAs)'),
  ('advanced-compute-integration', 'identity-social-graphs',       'Identity & Social Graphs'),
  ('advanced-compute-integration', 'depin-physical-infrastructure','DePIN (Physical Infrastructure)'),
  ('advanced-compute-integration', 'cross-chain-compute',          'Cross-Chain Compute'),

  -- Governance & Enterprise Framework
  ('governance-enterprise-framework', 'dao-governance-systems',           'DAO Governance Systems'),
  ('governance-enterprise-framework', 'enterprise-blockchain-adoption',   'Enterprise Blockchain Adoption'),
  ('governance-enterprise-framework', 'cbdcs-public-sector-pilots',       'CBDCs & Public Sector Pilots'),
  ('governance-enterprise-framework', 'compliance-regulatory-intelligence','Compliance & Regulatory Intelligence'),
  ('governance-enterprise-framework', 'institutional-custody-security',   'Institutional Custody & Security')
) as sub(sector_slug, slug, name)
join public.sectors s on s.slug = sub.sector_slug
on conflict (sector_id, slug) do nothing;
