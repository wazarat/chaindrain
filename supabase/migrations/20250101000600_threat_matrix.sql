-- =====================================================================
-- Threat matrix materialized view.
-- Score per (subsector, evidence_class) over a rolling 30-day window:
--   score = 0.5 * recency_decay + 0.3 * severity_sum + 0.2 * unique_companies
-- All three components are min-max normalized to [0, 1] within the view.
-- =====================================================================

create or replace view public.v_threat_components as
with base as (
  select
    c.subsector_id,
    e.evidence_class,
    e.id as event_id,
    e.detected_at,
    e.severity,
    coalesce(e.primary_company_id, ec.company_id) as company_id
  from public.events e
  left join public.companies c on c.id = e.primary_company_id
  left join lateral (
    select company_id from public.event_companies ec
    where ec.event_id = e.id
    limit 1
  ) ec on true
  where e.detected_at >= now() - interval '30 days'
    and e.status <> 'retracted'
    and c.subsector_id is not null
),
sev_weight as (
  select event_id, subsector_id, evidence_class, company_id,
         case severity
           when 'critical' then 5
           when 'high' then 4
           when 'medium' then 3
           when 'low' then 2
           when 'info' then 1
         end::int as sev_w,
         -- recency: 1.0 today, ~0 at 30 days
         greatest(0.0, 1.0 - extract(epoch from (now() - detected_at)) / (30 * 86400.0)) as recency_w
  from base
)
select
  subsector_id,
  evidence_class,
  count(distinct event_id) as event_count,
  count(distinct company_id) as unique_companies,
  sum(sev_w) as severity_sum,
  sum(recency_w) as recency_sum
from sev_weight
group by subsector_id, evidence_class;

create materialized view if not exists public.mv_threat_matrix as
with norm as (
  select
    subsector_id,
    evidence_class,
    event_count,
    unique_companies,
    severity_sum,
    recency_sum,
    -- normalize across whole matrix
    nullif(max(recency_sum) over (), 0) as max_recency,
    nullif(max(severity_sum) over (), 0) as max_severity,
    nullif(max(unique_companies) over (), 0) as max_unique
  from public.v_threat_components
)
select
  subsector_id,
  evidence_class,
  event_count,
  unique_companies,
  severity_sum,
  recency_sum,
  round(
    (0.5 * coalesce(recency_sum / max_recency, 0)
     + 0.3 * coalesce(severity_sum::numeric / max_severity, 0)
     + 0.2 * coalesce(unique_companies::numeric / max_unique, 0))::numeric,
    4
  ) as score
from norm;

create unique index if not exists mv_threat_matrix_pk
  on public.mv_threat_matrix (subsector_id, evidence_class);

create or replace function public.refresh_threat_matrix()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_threat_matrix;
exception when feature_not_supported then
  -- first refresh cannot be concurrent
  refresh materialized view public.mv_threat_matrix;
end;
$$;

-- Grant select to anon/authenticated; RLS does not apply to mat views directly,
-- but Supabase exposes views via PostgREST and the grant is what controls access.
grant select on public.mv_threat_matrix to anon, authenticated;
grant select on public.v_threat_components to anon, authenticated;
