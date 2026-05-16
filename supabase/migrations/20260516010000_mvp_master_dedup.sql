-- chaindrain.mvp_master_dedup — collapses duplicate-company rows.
--
-- Two rows belong to the same company iff:
--   (a) tvl_usd, risk_score, and COALESCE(blast_radius_usd, 0) are all equal AND
--   (b) the first word of the paren-stripped name matches.
-- Rows with NULL tvl_usd or NULL risk_score keep their own paren-stripped name
-- as the company key — they are not merged.
-- The canonical row of a group is the row with the shortest paren-stripped name
-- (alphabetical tiebreak); its scalar fields win, array fields are unioned.

CREATE OR REPLACE VIEW chaindrain.mvp_master_dedup AS
WITH base AS (
  SELECT m.*,
         TRIM(SPLIT_PART(m.name, ' (', 1)) AS stripped_name
  FROM chaindrain.mvp_master m
),
keyed AS (
  SELECT b.*,
         CASE
           WHEN b.tvl_usd IS NOT NULL AND b.risk_score IS NOT NULL THEN
             MIN(b.stripped_name) OVER (
               PARTITION BY b.tvl_usd,
                            b.risk_score,
                            COALESCE(b.blast_radius_usd, 0),
                            SPLIT_PART(b.stripped_name, ' ', 1)
             )
           ELSE b.stripped_name
         END AS company_key
  FROM base b
),
ranked AS (
  SELECT k.*,
         ROW_NUMBER() OVER (
           PARTITION BY k.company_key
           ORDER BY LENGTH(k.stripped_name), k.name
         ) AS rn
  FROM keyed k
)
SELECT
  r.entity_id,
  r.name,
  r.sector,
  r.tvl_usd,
  r.risk_score,
  r.risk_tier,
  r.coverage_tier,
  r.blast_radius_usd,
  r.state,
  r.website,
  r.launch_date,
  r.is_immutable,
  r.is_permissionless,
  r.defillama_slug,
  r.coingecko_id,
  r.primary_contract_address,
  r.implementation_address,
  r.proxy_pattern,
  r.upgrade_authority_type,
  r.admin_address,
  r.multisig_threshold,
  r.timelock_delay_hours,
  r.compiler_version,
  r.verified_source,
  r.uses_assembly,
  r.external_call_count,
  r.audits_tier,
  r.audit_firms,
  r.last_audit_date,
  r.audit_links,
  r.bug_bounty_program,
  r.bug_bounty_max_payout_usd,
  r.bug_bounty_immunefi_url,
  r.oracle_confidence,
  r.bridge_confidence,
  r.stablecoin_confidence,
  r.dvn_configuration,
  r.dvn_confidence,
  r.dependency_sources,
  r.tvl_factor,
  r.mutability_factor,
  r.audit_factor,
  r.bounty_factor,
  r.last_state_change,
  COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
     FROM keyed k2, unnest(k2.oracle_providers) AS x
     WHERE k2.company_key = r.company_key AND x IS NOT NULL),
    r.oracle_providers
  ) AS oracle_providers,
  COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
     FROM keyed k2, unnest(k2.bridge_dependencies) AS x
     WHERE k2.company_key = r.company_key AND x IS NOT NULL),
    r.bridge_dependencies
  ) AS bridge_dependencies,
  COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
     FROM keyed k2, unnest(k2.stablecoin_dependencies) AS x
     WHERE k2.company_key = r.company_key AND x IS NOT NULL),
    r.stablecoin_dependencies
  ) AS stablecoin_dependencies,
  COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
     FROM keyed k2, unnest(k2.chain_deployments) AS x
     WHERE k2.company_key = r.company_key AND x IS NOT NULL),
    r.chain_deployments
  ) AS chain_deployments,
  r.company_key
FROM ranked r
WHERE r.rn = 1;

GRANT SELECT ON chaindrain.mvp_master_dedup TO anon, authenticated, service_role;
