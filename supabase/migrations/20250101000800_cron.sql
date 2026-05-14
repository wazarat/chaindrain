-- =====================================================================
-- pg_cron schedule for the daily Comet run.
-- The cron job calls the Edge Function, which in turn POSTs to the agent.
-- Set the request URL via:
--   alter database postgres set "app.settings.cron_trigger_url" = 'https://YOUR_PROJECT.supabase.co/functions/v1/cron-trigger';
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop and recreate so re-running the migration is idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chaindrain_daily_agent') then
    perform cron.unschedule('chaindrain_daily_agent');
  end if;
end $$;

select cron.schedule(
  'chaindrain_daily_agent',
  '0 13 * * *', -- 13:00 UTC daily
  $$
    select net.http_post(
      url := current_setting('app.settings.cron_trigger_url', true),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'authorization', 'Bearer ' || current_setting('app.settings.cron_function_key', true)
      ),
      body := jsonb_build_object('trigger', 'pg_cron', 'at', now())
    );
  $$
);

-- Refresh the threat-matrix materialized view every 10 minutes.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chaindrain_refresh_matrix') then
    perform cron.unschedule('chaindrain_refresh_matrix');
  end if;
end $$;

select cron.schedule(
  'chaindrain_refresh_matrix',
  '*/10 * * * *',
  $$ select public.refresh_threat_matrix(); $$
);
