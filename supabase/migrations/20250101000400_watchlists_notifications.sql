-- =====================================================================
-- watchlists + notifications + sector_signals + per-user RLS.
-- =====================================================================

-- ---------------- watchlists ----------------
create table if not exists public.watchlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

create index if not exists watchlists_company_idx on public.watchlists(company_id);
create index if not exists watchlists_user_idx on public.watchlists(user_id);

alter table public.watchlists enable row level security;

drop policy if exists watchlists_self_read on public.watchlists;
create policy watchlists_self_read on public.watchlists
  for select using (auth.uid() = user_id);

drop policy if exists watchlists_self_write on public.watchlists;
create policy watchlists_self_write on public.watchlists
  for insert with check (auth.uid() = user_id);

drop policy if exists watchlists_self_delete on public.watchlists;
create policy watchlists_self_delete on public.watchlists
  for delete using (auth.uid() = user_id);

-- ---------------- sector_signals ----------------
create table if not exists public.sector_signals (
  id uuid primary key default uuid_generate_v4(),
  subsector_id uuid not null references public.subsectors(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  severity public.severity not null,
  rationale text not null,
  event_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sector_signals_subsector_idx on public.sector_signals(subsector_id);
create index if not exists sector_signals_created_at_desc on public.sector_signals(created_at desc);

alter table public.sector_signals enable row level security;

drop policy if exists sector_signals_read_all on public.sector_signals;
create policy sector_signals_read_all on public.sector_signals for select using (true);
drop policy if exists sector_signals_admin_write on public.sector_signals;
create policy sector_signals_admin_write on public.sector_signals for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- notifications ----------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  sector_signal_id uuid references public.sector_signals(id) on delete cascade,
  kind public.notification_kind not null default 'watched_company_event',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (event_id is not null or sector_signal_id is not null)
);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------- agent_runs ----------------
create table if not exists public.agent_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'running', -- running|success|partial|failed
  found_count integer not null default 0,
  cost_cents integer not null default 0,
  log_path text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists agent_runs_started_at_desc on public.agent_runs(started_at desc);

alter table public.agent_runs enable row level security;

drop policy if exists agent_runs_admin_read on public.agent_runs;
create policy agent_runs_admin_read on public.agent_runs for select using (public.is_admin());
drop policy if exists agent_runs_admin_write on public.agent_runs;
create policy agent_runs_admin_write on public.agent_runs for all
  using (public.is_admin()) with check (public.is_admin());
