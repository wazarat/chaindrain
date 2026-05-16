-- chaindrain MVP rebuild — Phase 0
-- Drop the legacy public.* schema (events / companies / sectors / profiles / watchlists / etc.)
-- in preparation for the chaindrain.* schema rebuild.
-- Extensions (vector, pg_trgm, pg_net) are kept; their functions are not user-defined.
-- auth.* is left alone (Supabase managed).

-- 1. Unschedule legacy pg_cron jobs.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chaindrain_daily_agent') then
    perform cron.unschedule('chaindrain_daily_agent');
  end if;
  if exists (select 1 from cron.job where jobname = 'chaindrain_refresh_matrix') then
    perform cron.unschedule('chaindrain_refresh_matrix');
  end if;
end $$;

-- 2. Drop materialized view + view.
drop materialized view if exists public.mv_threat_matrix cascade;
drop view if exists public.v_threat_components cascade;

-- 3. Drop tables in FK-safe order (children → parents).
drop table if exists public.notifications cascade;
drop table if exists public.watchlists cascade;
drop table if exists public.event_companies cascade;
drop table if exists public.event_sources cascade;
drop table if exists public.events cascade;
drop table if exists public.sector_signals cascade;
drop table if exists public.companies cascade;
drop table if exists public.subsectors cascade;
drop table if exists public.sectors cascade;
drop table if exists public.profiles cascade;
drop table if exists public.agent_runs cascade;

-- 4. Drop user-defined functions (keep extension functions intact).
drop function if exists public.admin_grant(text) cascade;
drop function if exists public.is_admin(uuid) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.refresh_threat_matrix() cascade;
drop function if exists public.detect_sector_signal() cascade;
drop function if exists public.detect_sector_signal(uuid, integer, integer) cascade;
drop function if exists public.search_events(text, vector, int, float) cascade;
drop function if exists public.search_events(text, vector, int) cascade;
drop function if exists public.search_events(text, vector(1536), int, float) cascade;
drop function if exists public.search_events(text, vector(1536), int) cascade;
drop function if exists public.rls_audit() cascade;
drop function if exists public.event_subsector_id(uuid) cascade;
drop function if exists public.tg_events_after_insert() cascade;
drop function if exists public.tg_fanout_watched_company_event() cascade;
drop function if exists public.tg_events_tsv() cascade;
drop function if exists public.tg_set_updated_at() cascade;

-- 5. Drop legacy enums (created in 20250101000000_init_extensions_and_enums).
drop type if exists public.evidence_class cascade;
drop type if exists public.event_severity cascade;
drop type if exists public.event_status cascade;
