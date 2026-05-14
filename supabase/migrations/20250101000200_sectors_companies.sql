-- =====================================================================
-- sectors, subsectors, companies + public read RLS.
-- =====================================================================

create table if not exists public.sectors (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.subsectors (
  id uuid primary key default uuid_generate_v4(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (sector_id, slug)
);

create index if not exists subsectors_sector_id_idx on public.subsectors(sector_id);

create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  subsector_id uuid references public.subsectors(id) on delete set null,
  slug text not null unique,
  name text not null,
  website text,
  chains text[] not null default '{}',
  tags text[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_subsector_id_idx on public.companies(subsector_id);
create index if not exists companies_chains_gin on public.companies using gin (chains);
create index if not exists companies_tags_gin on public.companies using gin (tags);
create index if not exists companies_name_trgm on public.companies using gin (name gin_trgm_ops);

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.tg_set_updated_at();

-- RLS: public read, admin write.
alter table public.sectors enable row level security;
alter table public.subsectors enable row level security;
alter table public.companies enable row level security;

drop policy if exists sectors_read_all on public.sectors;
create policy sectors_read_all on public.sectors for select using (true);
drop policy if exists sectors_admin_write on public.sectors;
create policy sectors_admin_write on public.sectors for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists subsectors_read_all on public.subsectors;
create policy subsectors_read_all on public.subsectors for select using (true);
drop policy if exists subsectors_admin_write on public.subsectors;
create policy subsectors_admin_write on public.subsectors for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists companies_read_all on public.companies;
create policy companies_read_all on public.companies for select using (true);
drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies for all
  using (public.is_admin()) with check (public.is_admin());
