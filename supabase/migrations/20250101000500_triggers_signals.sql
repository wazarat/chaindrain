-- =====================================================================
-- Postgres triggers:
--   1. on event_companies insert -> fan-out notifications to watchers
--   2. detect_sector_signal(subsector_id, threshold)
--   3. on events insert -> auto-call detector for the event's subsector
-- =====================================================================

-- ---------- helper: subsector for an event ----------
create or replace function public.event_subsector_id(p_event_id uuid)
returns uuid
language sql
stable
as $$
  select c.subsector_id
  from public.events e
  join public.companies c on c.id = e.primary_company_id
  where e.id = p_event_id
  limit 1;
$$;

-- ---------- 1. fan-out notifications to watchers ----------
create or replace function public.tg_fanout_watched_company_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, event_id, kind)
  select w.user_id, new.event_id, 'watched_company_event'
  from public.watchlists w
  where w.company_id = new.company_id
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_fanout_watched_company_event on public.event_companies;
create trigger trg_fanout_watched_company_event
  after insert on public.event_companies
  for each row execute function public.tg_fanout_watched_company_event();

-- ---------- 2. detect_sector_signal ----------
-- Returns the id of the inserted sector_signal, or null if threshold not crossed.
create or replace function public.detect_sector_signal(
  p_subsector_id uuid,
  p_threshold int default 3,
  p_window_hours int default 168 -- 7 days
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_max_severity public.severity;
  v_signal_id uuid;
  v_window_start timestamptz := now() - make_interval(hours => p_window_hours);
  v_window_end timestamptz := now();
begin
  select count(*)::int,
         max(e.severity)
    into v_count, v_max_severity
  from public.events e
  join public.companies c on c.id = e.primary_company_id
  where c.subsector_id = p_subsector_id
    and e.severity in ('medium', 'high', 'critical')
    and e.detected_at >= v_window_start;

  if coalesce(v_count, 0) < p_threshold then
    return null;
  end if;

  -- Avoid duplicate within 24h
  if exists (
    select 1 from public.sector_signals
    where subsector_id = p_subsector_id
      and created_at > now() - interval '24 hours'
  ) then
    return null;
  end if;

  insert into public.sector_signals (subsector_id, window_start, window_end, severity, rationale, event_count)
  values (
    p_subsector_id,
    v_window_start,
    v_window_end,
    coalesce(v_max_severity, 'medium'),
    format('%s qualifying events in subsector in last %s hours', v_count, p_window_hours),
    v_count
  )
  returning id into v_signal_id;

  -- Fan-out: every user with at least one company in this subsector on their watchlist.
  insert into public.notifications (user_id, sector_signal_id, kind)
  select distinct w.user_id, v_signal_id, 'sector_signal'
  from public.watchlists w
  join public.companies c on c.id = w.company_id
  where c.subsector_id = p_subsector_id;

  return v_signal_id;
end;
$$;

-- ---------- 3. on event insert -> attempt detection for that subsector ----------
create or replace function public.tg_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subsector uuid;
begin
  v_subsector := public.event_subsector_id(new.id);
  if v_subsector is not null then
    perform public.detect_sector_signal(v_subsector);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_events_after_insert on public.events;
create trigger trg_events_after_insert
  after insert on public.events
  for each row execute function public.tg_events_after_insert();
