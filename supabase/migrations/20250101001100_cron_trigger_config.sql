-- =====================================================================
-- Day 3: reconfigure the daily cron job to invoke the cron-trigger Edge
-- Function directly, without dependence on unset Postgres GUCs.
--
-- The cron-trigger function is deployed with verify_jwt=false, so no
-- Authorization header is required. The function URL is hardcoded to the
-- chaindrain project; any fork will need to update this migration before
-- applying it to their own Supabase project.
-- =====================================================================

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
      url := 'https://uftbynydcmzfggltyjao.supabase.co/functions/v1/cron-trigger',
      headers := jsonb_build_object('content-type', 'application/json'),
      body := jsonb_build_object('trigger', 'pg_cron', 'at', now())
    );
  $$
);
