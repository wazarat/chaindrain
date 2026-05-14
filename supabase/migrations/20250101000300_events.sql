-- =====================================================================
-- events, event_sources, event_companies + tsv + embedding.
-- =====================================================================

create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  summary text not null,
  evidence_class public.evidence_class not null,
  severity public.severity not null default 'info',
  status public.event_status not null default 'unverified',
  occurred_at timestamptz,
  detected_at timestamptz not null default now(),
  primary_company_id uuid references public.companies(id) on delete set null,
  embedding vector(1536),
  tsv tsvector,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_evidence_class_idx on public.events(evidence_class);
create index if not exists events_severity_idx on public.events(severity);
create index if not exists events_status_idx on public.events(status);
create index if not exists events_detected_at_desc_idx on public.events(detected_at desc);
create index if not exists events_occurred_at_desc_idx on public.events(occurred_at desc nulls last);
create index if not exists events_primary_company_idx on public.events(primary_company_id);
create index if not exists events_tsv_idx on public.events using gin (tsv);
-- Vector index added in a later migration once row count justifies it.

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.tg_set_updated_at();

-- Auto-maintain tsv from title + summary
create or replace function public.tg_events_tsv()
returns trigger
language plpgsql
as $$
begin
  new.tsv := setweight(to_tsvector('english', coalesce(new.title, '')), 'A')
          || setweight(to_tsvector('english', coalesce(new.summary, '')), 'B');
  return new;
end;
$$;

drop trigger if exists trg_events_tsv on public.events;
create trigger trg_events_tsv
  before insert or update of title, summary on public.events
  for each row execute function public.tg_events_tsv();

-- ---------------- event_sources ----------------
create table if not exists public.event_sources (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  url text not null,
  source_type text not null default 'web',
  captured_at timestamptz not null default now(),
  snapshot_path text,
  meta jsonb not null default '{}'::jsonb,
  unique (event_id, url)
);

create index if not exists event_sources_event_idx on public.event_sources(event_id);

-- ---------------- event_companies ----------------
create table if not exists public.event_companies (
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.company_event_role not null default 'related',
  created_at timestamptz not null default now(),
  primary key (event_id, company_id, role)
);

create index if not exists event_companies_company_idx on public.event_companies(company_id);
create index if not exists event_companies_event_idx on public.event_companies(event_id);

-- ---------------- RLS: public read, admin/service write ----------------
alter table public.events enable row level security;
alter table public.event_sources enable row level security;
alter table public.event_companies enable row level security;

drop policy if exists events_read_all on public.events;
create policy events_read_all on public.events for select using (true);
drop policy if exists events_admin_write on public.events;
create policy events_admin_write on public.events for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_sources_read_all on public.event_sources;
create policy event_sources_read_all on public.event_sources for select using (true);
drop policy if exists event_sources_admin_write on public.event_sources;
create policy event_sources_admin_write on public.event_sources for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_companies_read_all on public.event_companies;
create policy event_companies_read_all on public.event_companies for select using (true);
drop policy if exists event_companies_admin_write on public.event_companies;
create policy event_companies_admin_write on public.event_companies for all
  using (public.is_admin()) with check (public.is_admin());
