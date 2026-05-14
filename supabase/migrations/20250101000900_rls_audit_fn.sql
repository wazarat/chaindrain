-- =====================================================================
-- RLS audit function. Returns rows for any RLS misconfiguration we care
-- about. Zero rows = pass. Run via:
--   select * from public.rls_audit();
-- =====================================================================

create or replace function public.rls_audit()
returns table (
  table_name text,
  issue text
)
language plpgsql
set search_path = public
as $$
begin
  -- 1. Every public table must have RLS enabled.
  return query
  select format('%I.%I', n.nspname, c.relname)::text as table_name,
         'RLS disabled'::text as issue
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname = 'public'
    and c.relname not in ('schema_migrations', 'alembic_version')
    and not c.relrowsecurity;

  -- 2. Every public table must have at least one policy.
  return query
  select format('%I.%I', n.nspname, c.relname)::text,
         'No policies defined'::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname = 'public'
    and c.relrowsecurity
    and not exists (
      select 1 from pg_policy p where p.polrelid = c.oid
    );

  -- 3. notifications and watchlists must NOT have a public read policy.
  return query
  select format('public.%I', p.polrelid::regclass)::text,
         format('over-permissive policy %s on sensitive table', p.polname)::text
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('notifications', 'watchlists')
    and p.polcmd in ('r', '*') -- select or all
    and p.polqual::text ilike '%true%'
    and p.polqual::text not ilike '%auth.uid()%';
end;
$$;
