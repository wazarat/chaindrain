-- =====================================================================
-- Security hardening pass.
--
-- 1. Revoke EXECUTE on privileged SECURITY DEFINER functions from
--    anon/authenticated. Triggers continue to fire because they run as
--    the table owner. is_admin stays public-callable because RLS
--    policies reference it.
-- 2. Pin search_path on every function we own (mitigates search_path
--    based privilege escalation).
-- 3. Force v_threat_components to run with the QUERIER's RLS instead of
--    the view owner's privileges (Postgres 15+).
-- =====================================================================

-- 1. Lock down RPC surface
revoke execute on function public.admin_grant(text)               from anon, authenticated, public;
revoke execute on function public.detect_sector_signal(uuid, int, int) from anon, authenticated, public;
revoke execute on function public.handle_new_user()               from anon, authenticated, public;
revoke execute on function public.tg_events_after_insert()        from anon, authenticated, public;
revoke execute on function public.tg_fanout_watched_company_event() from anon, authenticated, public;
revoke execute on function public.refresh_threat_matrix()         from anon, public;
-- keep refresh_threat_matrix callable by authenticated; admin-check happens at API layer
grant execute on function public.refresh_threat_matrix()           to authenticated;

-- 2. Pin search_path
alter function public.tg_set_updated_at()                          set search_path = public;
alter function public.tg_events_tsv()                              set search_path = public;
alter function public.event_subsector_id(uuid)                     set search_path = public;
alter function public.search_events(text, vector, int, uuid, uuid, public.evidence_class, public.severity, timestamptz)
  set search_path = public;
alter function public.rls_audit()                                  set search_path = public;

-- 3. Tighten threat-components view
alter view public.v_threat_components set (security_invoker = on);
