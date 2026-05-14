-- =====================================================================
-- 20250101000000_init_extensions_and_enums.sql
-- Enables extensions and creates canonical enums used across the schema.
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- Evidence classification taxonomy
do $$ begin
  create type public.evidence_class as enum (
    'protocol_exploit',
    'operational_compromise',
    'market_event',
    'regulatory',
    'governance',
    'disclosure',
    'other'
  );
exception when duplicate_object then null; end $$;

-- Severity ladder
do $$ begin
  create type public.severity as enum ('info', 'low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

-- Event status lifecycle
do $$ begin
  create type public.event_status as enum (
    'unverified',
    'corroborated',
    'confirmed',
    'retracted'
  );
exception when duplicate_object then null; end $$;

-- Notification kind
do $$ begin
  create type public.notification_kind as enum (
    'watched_company_event',
    'sector_signal',
    'system'
  );
exception when duplicate_object then null; end $$;

-- Role of a company in an event
do $$ begin
  create type public.company_event_role as enum (
    'victim',
    'attacker',
    'vendor',
    'oracle',
    'related'
  );
exception when duplicate_object then null; end $$;

-- Profile role
do $$ begin
  create type public.profile_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;
