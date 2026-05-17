-- Phase 6 — Exposure Graph: Layer 1 enrichment fields, Incident Ledger,
-- Governance + Reputation fingerprints, Similarity Engine.
-- See docs/AI_CONTEXT.md §7, ~/Downloads/chaindrain_exposure_graph_scope.md §2.
-- Migrations are append-only; do not edit prior files (DECISIONS §8).
-- Idempotent — every statement guards on IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Extend chaindrain.identity (Roadmap §3.1)
-- ---------------------------------------------------------------------------

ALTER TABLE chaindrain.identity
    ADD COLUMN IF NOT EXISTS subsector_tags        text[],
    ADD COLUMN IF NOT EXISTS website_canonical     text,
    ADD COLUMN IF NOT EXISTS is_immutable_bool     boolean,
    ADD COLUMN IF NOT EXISTS is_permissionless_bool boolean;

CREATE INDEX IF NOT EXISTS idx_identity_subsector_tags
    ON chaindrain.identity USING GIN (subsector_tags);

-- ---------------------------------------------------------------------------
-- 2. Extend chaindrain.contract_fingerprint (Roadmap §3.2)
-- ---------------------------------------------------------------------------

ALTER TABLE chaindrain.contract_fingerprint
    ADD COLUMN IF NOT EXISTS contract_addresses        text[],
    ADD COLUMN IF NOT EXISTS uses_assembly_bool        boolean,
    ADD COLUMN IF NOT EXISTS bug_bounty_program_enum   text;

-- ---------------------------------------------------------------------------
-- 3. Extend chaindrain.dependency_fingerprint with §3.3 deferred fields.
--    Each new column gets a sibling *_confidence column matching the existing
--    convention (HIGH / MEDIUM / INFERRED / UNKNOWN / DEMO).
-- ---------------------------------------------------------------------------

ALTER TABLE chaindrain.dependency_fingerprint
    ADD COLUMN IF NOT EXISTS lst_lrt_dependencies            text[],
    ADD COLUMN IF NOT EXISTS lst_lrt_confidence              text,
    ADD COLUMN IF NOT EXISTS dex_liquidity_venues            text[],
    ADD COLUMN IF NOT EXISTS dex_liquidity_venues_confidence text,
    ADD COLUMN IF NOT EXISTS cex_listings                    text[],
    ADD COLUMN IF NOT EXISTS cex_listings_confidence         text,
    ADD COLUMN IF NOT EXISTS custodian                       text,
    ADD COLUMN IF NOT EXISTS custodian_confidence            text,
    ADD COLUMN IF NOT EXISTS kms_provider                    text,
    ADD COLUMN IF NOT EXISTS kms_provider_confidence         text,
    ADD COLUMN IF NOT EXISTS rpc_provider_primary            text,
    ADD COLUMN IF NOT EXISTS rpc_provider_primary_confidence text,
    ADD COLUMN IF NOT EXISTS frontend_host                   text,
    ADD COLUMN IF NOT EXISTS frontend_host_confidence        text,
    ADD COLUMN IF NOT EXISTS npm_lockfile_sha                text,
    ADD COLUMN IF NOT EXISTS npm_lockfile_sha_confidence     text;

CREATE INDEX IF NOT EXISTS idx_dep_lst_lrt
    ON chaindrain.dependency_fingerprint USING GIN (lst_lrt_dependencies);
CREATE INDEX IF NOT EXISTS idx_dep_dex_venues
    ON chaindrain.dependency_fingerprint USING GIN (dex_liquidity_venues);
CREATE INDEX IF NOT EXISTS idx_dep_cex_listings
    ON chaindrain.dependency_fingerprint USING GIN (cex_listings);
CREATE INDEX IF NOT EXISTS idx_dep_kms_provider
    ON chaindrain.dependency_fingerprint (kms_provider);
CREATE INDEX IF NOT EXISTS idx_dep_frontend_host
    ON chaindrain.dependency_fingerprint (frontend_host);
CREATE INDEX IF NOT EXISTS idx_dep_rpc_provider
    ON chaindrain.dependency_fingerprint (rpc_provider_primary);

-- ---------------------------------------------------------------------------
-- 4. chaindrain.governance_fingerprint (Roadmap §3.4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chaindrain.governance_fingerprint (
    entity_id                       uuid PRIMARY KEY
                                    REFERENCES chaindrain.identity(entity_id)
                                    ON DELETE CASCADE,
    governance_type                 text,
    governance_token_address        text,
    treasury_size_usd               numeric,
    team_size_estimate              int,
    team_jurisdiction               text,
    incorporated_entity             text,
    is_anonymous_team               boolean,
    has_security_disclosure_policy  boolean,
    incident_response_sla_hours     int,
    data_confidence                 text DEFAULT 'DEMO',
    created_at                      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_type
    ON chaindrain.governance_fingerprint (governance_type);
CREATE INDEX IF NOT EXISTS idx_gov_jurisdiction
    ON chaindrain.governance_fingerprint (team_jurisdiction);
CREATE INDEX IF NOT EXISTS idx_gov_anonymous
    ON chaindrain.governance_fingerprint (is_anonymous_team);

-- ---------------------------------------------------------------------------
-- 5. chaindrain.reputation_signal (Roadmap §3.5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chaindrain.reputation_signal (
    entity_id                       uuid PRIMARY KEY
                                    REFERENCES chaindrain.identity(entity_id)
                                    ON DELETE CASCADE,
    github_repo_url                 text,
    github_commit_velocity_30d      int,
    github_contributor_count        int,
    github_last_security_issue_date date,
    twitter_handle                  text,
    discord_invite                  text,
    last_known_incident_date        date,
    kyt_screening_status            text,
    data_confidence                 text DEFAULT 'DEMO',
    created_at                      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rep_kyt_status
    ON chaindrain.reputation_signal (kyt_screening_status);
CREATE INDEX IF NOT EXISTS idx_rep_last_incident
    ON chaindrain.reputation_signal (last_known_incident_date DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 6. chaindrain.incident — the Incident Ledger (Roadmap §4.1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chaindrain.incident (
    incident_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    victim_entity_ids      uuid[] NOT NULL,
    event_date             date NOT NULL,
    disclosure_date        date,
    loss_amount_usd        numeric,
    funds_recovered_usd    numeric,
    actor_role             text,
    attack_strategy        text,
    aadapt_tactic_ids      text[],
    aadapt_technique_ids   text[],
    root_cause             text NOT NULL,
    secondary_root_causes  text[],
    attack_layer           text,
    flash_loan_used        boolean,
    attacker_address       text,
    attacker_attribution   text,
    audit_firm_at_time     text[],
    was_audited            boolean,
    bounty_program_at_time boolean,
    tx_hashes              text[],
    post_mortem_urls       text[],
    narrative_summary      text,
    data_confidence        text NOT NULL DEFAULT 'DEMO',
    created_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_date
    ON chaindrain.incident (event_date DESC);
CREATE INDEX IF NOT EXISTS idx_incident_root_cause
    ON chaindrain.incident (root_cause);
CREATE INDEX IF NOT EXISTS idx_incident_victims
    ON chaindrain.incident USING GIN (victim_entity_ids);
CREATE INDEX IF NOT EXISTS idx_incident_attribution
    ON chaindrain.incident (attacker_attribution);
CREATE INDEX IF NOT EXISTS idx_incident_attack_layer
    ON chaindrain.incident (attack_layer);

-- ---------------------------------------------------------------------------
-- 7. chaindrain.similarity_pair — top-25 dependency twins per source entity
--    (Roadmap §5.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chaindrain.similarity_pair (
    source_entity_id   uuid NOT NULL
                       REFERENCES chaindrain.identity(entity_id) ON DELETE CASCADE,
    target_entity_id   uuid NOT NULL
                       REFERENCES chaindrain.identity(entity_id) ON DELETE CASCADE,
    method_a_jaccard   numeric NOT NULL,
    method_b_overlap   int     NOT NULL DEFAULT 0,
    method_c_cosine    numeric NOT NULL,
    ensemble_score     numeric NOT NULL,
    shared_attributes  jsonb   NOT NULL DEFAULT '{}'::jsonb,
    rank               int     NOT NULL,
    computed_at        timestamptz DEFAULT now(),
    PRIMARY KEY (source_entity_id, target_entity_id),
    CONSTRAINT similarity_pair_no_self CHECK (source_entity_id <> target_entity_id),
    CONSTRAINT similarity_pair_rank_pos CHECK (rank >= 1)
);

CREATE INDEX IF NOT EXISTS idx_sim_source_rank
    ON chaindrain.similarity_pair (source_entity_id, rank);
CREATE INDEX IF NOT EXISTS idx_sim_ensemble
    ON chaindrain.similarity_pair (ensemble_score DESC);

-- ---------------------------------------------------------------------------
-- 8. Grants — match the existing chaindrain.* policy (DECISIONS §14)
-- ---------------------------------------------------------------------------

GRANT SELECT ON chaindrain.governance_fingerprint TO anon, authenticated;
GRANT ALL    ON chaindrain.governance_fingerprint TO service_role;

GRANT SELECT ON chaindrain.reputation_signal     TO anon, authenticated;
GRANT ALL    ON chaindrain.reputation_signal     TO service_role;

GRANT SELECT ON chaindrain.incident              TO anon, authenticated;
GRANT ALL    ON chaindrain.incident              TO service_role;

GRANT SELECT ON chaindrain.similarity_pair       TO anon, authenticated;
GRANT ALL    ON chaindrain.similarity_pair       TO service_role;
