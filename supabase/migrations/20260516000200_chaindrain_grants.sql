-- chaindrain MVP — Phase 0
-- Grant read access to the chaindrain schema for the anon role so the MVP
-- dashboard can render with the public anon key (single-tenant, read-only
-- per mvp_scope_spec.md). Writes go through the service-role on the server.

grant usage on schema chaindrain to anon, authenticated, service_role;
grant select on all tables in schema chaindrain to anon, authenticated;
grant all on all tables in schema chaindrain to service_role;

alter default privileges in schema chaindrain
  grant select on tables to anon, authenticated;
alter default privileges in schema chaindrain
  grant all on tables to service_role;
