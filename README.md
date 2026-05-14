# Chaindrain

Exploit intelligence and threat-matrix dashboard for crypto/web3 protocols.

## Stack

- **Web:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui — Vercel
- **API:** FastAPI (Python 3.12) + Pydantic v2 — Fly.io
- **Agent worker:** Python 3.12 — Fly.io, driven by Perplexity Comet + Playwright fallback
- **DB / Auth:** Supabase (Postgres 16 + RLS + Auth + Realtime + pgvector)
- **Vector store:** Supabase `pgvector` (1536-dim, cosine)

## Repo Layout

```
chaindrain/
  apps/
    web/                # Next.js 15
    api/                # FastAPI
    agent/              # Comet worker
  packages/
    shared-types/       # generated TS types from Pydantic
  supabase/
    migrations/
    functions/cron-trigger/
  scripts/
    import_companies.py
    rls_audit.sql
  .github/workflows/
```

## Quickstart

```bash
# install JS deps
pnpm install

# bootstrap python envs (each app has its own)
cd apps/api && uv sync && cd ../..
cd apps/agent && uv sync && cd ../..

# env
cp .env.example .env.local

# run web
pnpm dev:web

# run api
cd apps/api && uv run uvicorn app.main:app --reload --port 8000

# run agent locally
cd apps/agent && uv run python -m app.run_daily --dry-run
```

## Day-by-day status

See `/Users/wazarat/.windsurf/plans/chaindrain-3day-build-417218.md` for the full plan and KPI gates.

## Deployments

- **Web:** Vercel project, apex `chaindrain.xyz`
- **API:** Fly.io app `chaindrain-api`
- **Agent:** Fly.io app `chaindrain-agent`
- **DB:** Supabase prod project

## License

Proprietary — all rights reserved.
