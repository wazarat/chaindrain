
-- chaindrain MVP schema for threat detection — Phase 1+2 dataset
-- Idempotent: safe to re-run.
-- Isolated from public.* — existing production tables untouched.

CREATE SCHEMA IF NOT EXISTS chaindrain;

-- =========================================================================
-- TABLE 1: identity (§3.1 Identity & Classification)
-- =========================================================================
DROP TABLE IF EXISTS chaindrain.identity CASCADE;
CREATE TABLE chaindrain.identity (
    entity_id           uuid PRIMARY KEY,
    name                text NOT NULL,
    website             text,
    sector              text,
    chain_deployments   text[],
    tvl_usd             numeric,
    launch_date         date,
    is_immutable        text,    -- TRUE / FALSE / UNKNOWN
    is_permissionless   text,
    defillama_slug      text,
    coingecko_id        text,
    match_source        text,
    match_method        text,
    created_at          timestamptz DEFAULT now()
);
CREATE INDEX idx_identity_sector       ON chaindrain.identity(sector);
CREATE INDEX idx_identity_tvl          ON chaindrain.identity(tvl_usd DESC NULLS LAST);
CREATE INDEX idx_identity_chains       ON chaindrain.identity USING GIN(chain_deployments);
CREATE INDEX idx_identity_slug         ON chaindrain.identity(defillama_slug);

-- =========================================================================
-- TABLE 2: contract_fingerprint (§3.2)
-- =========================================================================
DROP TABLE IF EXISTS chaindrain.contract_fingerprint CASCADE;
CREATE TABLE chaindrain.contract_fingerprint (
    entity_id                   uuid PRIMARY KEY REFERENCES chaindrain.identity(entity_id) ON DELETE CASCADE,
    primary_contract_address    text,
    implementation_address      text,
    proxy_pattern               text,    -- transparent / uups / beacon / none / eoa / n/a
    upgrade_authority_type      text,    -- eoa / contract / unknown
    admin_address               text,
    multisig_threshold          int,
    timelock_delay_hours        numeric,
    compiler_version            text,
    verified_source             boolean,
    uses_assembly               boolean,
    external_call_count         int,
    audits_tier                 int,
    audit_firms                 text[],
    last_audit_date             date,
    audit_links                 text,
    bug_bounty_program          text,
    bug_bounty_max_payout_usd   numeric,
    bug_bounty_immunefi_url     text,
    bug_bounty_launch_date      date,
    bug_bounty_updated_date     date,
    bug_bounty_kyc_required     boolean,
    created_at                  timestamptz DEFAULT now()
);
CREATE INDEX idx_cf_proxy        ON chaindrain.contract_fingerprint(proxy_pattern);
CREATE INDEX idx_cf_upgrade_auth ON chaindrain.contract_fingerprint(upgrade_authority_type);
CREATE INDEX idx_cf_audits_tier  ON chaindrain.contract_fingerprint(audits_tier);
CREATE INDEX idx_cf_admin_addr   ON chaindrain.contract_fingerprint(admin_address);
CREATE INDEX idx_cf_contract     ON chaindrain.contract_fingerprint(primary_contract_address);

-- =========================================================================
-- TABLE 3: dependency_fingerprint (§3.3 MVP partial)
-- =========================================================================
DROP TABLE IF EXISTS chaindrain.dependency_fingerprint CASCADE;
CREATE TABLE chaindrain.dependency_fingerprint (
    entity_id                   uuid PRIMARY KEY REFERENCES chaindrain.identity(entity_id) ON DELETE CASCADE,
    oracle_providers            text[],
    oracle_confidence           text,   -- HIGH / MEDIUM / INFERRED / UNKNOWN / n/a
    bridge_dependencies         text[],
    bridge_confidence           text,
    stablecoin_dependencies     text[],
    stablecoin_confidence       text,
    dvn_configuration           text,
    dvn_confidence              text,
    dependency_sources          text,
    created_at                  timestamptz DEFAULT now()
);
CREATE INDEX idx_dep_oracles  ON chaindrain.dependency_fingerprint USING GIN(oracle_providers);
CREATE INDEX idx_dep_bridges  ON chaindrain.dependency_fingerprint USING GIN(bridge_dependencies);
CREATE INDEX idx_dep_stables  ON chaindrain.dependency_fingerprint USING GIN(stablecoin_dependencies);
CREATE INDEX idx_dep_dvn      ON chaindrain.dependency_fingerprint(dvn_configuration);

-- =========================================================================
-- TABLE 4: tier_state (§3.6 computed)
-- =========================================================================
DROP TABLE IF EXISTS chaindrain.tier_state CASCADE;
CREATE TABLE chaindrain.tier_state (
    entity_id           uuid PRIMARY KEY REFERENCES chaindrain.identity(entity_id) ON DELETE CASCADE,
    risk_score          numeric NOT NULL,
    risk_tier           text NOT NULL,   -- critical / high / medium / low
    coverage_tier       text NOT NULL,   -- core / monitored / archive / excluded
    tvl_factor          numeric,
    mutability_factor   numeric,
    audit_factor        numeric,
    bounty_factor       numeric,
    blast_radius_usd    numeric,
    state               text DEFAULT 'active',  -- active / degraded / paused / exploited / wound_down
    last_state_change   timestamptz DEFAULT now(),
    computed_at         timestamptz DEFAULT now()
);
CREATE INDEX idx_ts_risk_tier    ON chaindrain.tier_state(risk_tier);
CREATE INDEX idx_ts_coverage     ON chaindrain.tier_state(coverage_tier);
CREATE INDEX idx_ts_risk_score   ON chaindrain.tier_state(risk_score DESC);
CREATE INDEX idx_ts_state        ON chaindrain.tier_state(state);

-- =========================================================================
-- VIEW: mvp_master — drop-in joined view for dashboard queries
-- =========================================================================
CREATE OR REPLACE VIEW chaindrain.mvp_master AS
SELECT
    i.entity_id, i.name, i.website, i.sector, i.chain_deployments, i.tvl_usd,
    i.launch_date, i.is_immutable, i.is_permissionless, i.defillama_slug, i.coingecko_id,
    cf.primary_contract_address, cf.implementation_address, cf.proxy_pattern,
    cf.upgrade_authority_type, cf.admin_address, cf.multisig_threshold,
    cf.timelock_delay_hours, cf.compiler_version, cf.verified_source, cf.uses_assembly,
    cf.external_call_count, cf.audits_tier, cf.audit_firms, cf.last_audit_date,
    cf.audit_links, cf.bug_bounty_program, cf.bug_bounty_max_payout_usd,
    cf.bug_bounty_immunefi_url,
    df.oracle_providers, df.oracle_confidence,
    df.bridge_dependencies, df.bridge_confidence,
    df.stablecoin_dependencies, df.stablecoin_confidence,
    df.dvn_configuration, df.dvn_confidence, df.dependency_sources,
    ts.risk_score, ts.risk_tier, ts.coverage_tier,
    ts.tvl_factor, ts.mutability_factor, ts.audit_factor, ts.bounty_factor,
    ts.blast_radius_usd, ts.state, ts.last_state_change
FROM chaindrain.identity i
LEFT JOIN chaindrain.contract_fingerprint cf USING (entity_id)
LEFT JOIN chaindrain.dependency_fingerprint df USING (entity_id)
LEFT JOIN chaindrain.tier_state ts USING (entity_id);

COMMENT ON SCHEMA chaindrain IS 'Chaindrain MVP threat detection layer — built 2026-05-16. §3.1 Identity + §3.2 Contract Fingerprint + §3.3 Dependency Fingerprint (MVP partial) + §3.6 Tier & State (computed). Isolated from public.* schema. Source-of-truth file: chaindrain_mvp_master.xlsx.';
COMMENT ON TABLE chaindrain.identity IS '875 entities — Phase 1 identity dataset. entity_id is deterministic UUID5(namespace, slug+|+domain).';
COMMENT ON TABLE chaindrain.contract_fingerprint IS '875 rows. 215 have primary_contract_address. 23 confirmed proxies (13 transparent + 10 UUPS). 18 contract-controlled admins = highest-priority Phase 1b targets.';
COMMENT ON TABLE chaindrain.dependency_fingerprint IS '§3.3 MVP partial. 116 with oracle data, 82 with stablecoin data, 12 with DVN config. Confidence levels: HIGH=DefiLlama explicit, MEDIUM=hardcoded mapping, INFERRED=sector default.';
COMMENT ON TABLE chaindrain.tier_state IS '§3.6 computed. risk_score = 0.4·tvl + 0.3·mutability + 0.2·audit + 0.1·bounty. 141 core-tier, 24 monitored, 178 archive, 532 excluded.';
