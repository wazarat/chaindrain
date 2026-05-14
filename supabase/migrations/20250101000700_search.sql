-- =====================================================================
-- Hybrid search: pgvector cosine + Postgres FTS (tsv).
-- search_events(q text, q_embedding vector(1536), limit, sector, evidence_class, severity, since)
-- Returns rows ordered by blended score.
-- =====================================================================

create or replace function public.search_events(
  p_query text default null,
  p_embedding vector(1536) default null,
  p_limit int default 50,
  p_sector_id uuid default null,
  p_subsector_id uuid default null,
  p_evidence_class public.evidence_class default null,
  p_severity public.severity default null,
  p_since timestamptz default null
)
returns table (
  id uuid,
  title text,
  summary text,
  evidence_class public.evidence_class,
  severity public.severity,
  status public.event_status,
  occurred_at timestamptz,
  detected_at timestamptz,
  primary_company_id uuid,
  score real
)
language sql
stable
as $$
  with filtered as (
    select e.*
    from public.events e
    left join public.companies c on c.id = e.primary_company_id
    left join public.subsectors s on s.id = c.subsector_id
    where (p_evidence_class is null or e.evidence_class = p_evidence_class)
      and (p_severity is null or e.severity >= p_severity)
      and (p_since is null or e.detected_at >= p_since)
      and (p_subsector_id is null or c.subsector_id = p_subsector_id)
      and (p_sector_id is null or s.sector_id = p_sector_id)
      and e.status <> 'retracted'
  ),
  scored as (
    select
      f.*,
      case
        when p_query is null or p_query = '' then 0.0
        else ts_rank_cd(f.tsv, websearch_to_tsquery('english', p_query))
      end as fts_score,
      case
        when p_embedding is null then 0.0
        else 1.0 - (f.embedding <=> p_embedding)
      end as vec_score
    from filtered f
  )
  select
    id, title, summary, evidence_class, severity, status,
    occurred_at, detected_at, primary_company_id,
    -- blended score: 60% vector, 40% FTS when both present, else whichever is non-zero
    (
      case
        when p_query is not null and p_embedding is not null then 0.4 * fts_score + 0.6 * vec_score
        when p_query is not null then fts_score
        when p_embedding is not null then vec_score
        else 0.0
      end
    )::real as score
  from scored
  order by score desc, detected_at desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.search_events(text, vector, int, uuid, uuid, public.evidence_class, public.severity, timestamptz)
  to anon, authenticated;
