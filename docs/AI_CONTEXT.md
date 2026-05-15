# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-15 (Day 1 KPI gate closed).
**Purpose:** Single source of truth for an AI assistant starting a new chat. Read this first, then `DECISIONS.md`, then `CHANGELOG_DEV.md`.

---

## 1. What Chaindrain is

A web/intelligence platform that tracks **crypto-infrastructure companies** organized into **7 sectors / 36 subsectors**, surfaces incidents/events ("evidence") against them, and renders a **threat matrix** (subsector × evidence_class). Users can sign up, watchlist companies, and receive notifications when events affect their watched companies. An autonomous **Comet agent** ingests events; admins triage them.

Day-1 scope (current): public landing, auth, catalog read endpoints, threat-matrix read, RLS-scoped per-user endpoints, FastAPI + Next.js working locally.

---

## 2. Repo layout (pnpm monorepo)

```
chaindrain/
├── apps/
│   ├── web/          # Next.js 15.0.0-rc.0, App Router, Tailwind, shadcn/ui
│   ├── api/          # FastAPI (Python 3.14, uv-managed)
│   └── agent/        # Comet ingestion worker (scaffold only)
├── packages/
│   └── shared-types/ # TS types shared between web and other JS code
├── supabase/
│   └── migrations/   # 11 SQL migrations (see §6)
├── scripts/          # Importers, RLS audit, seed generators
├── data/companies/   # 36 CSV files exported from Google Sheets
└── docs/             # ← you are here
```

Workspace root has `pnpm-workspace.yaml` listing `apps/web` + `packages/*`.
`packageManager: pnpm@9.0.0` is declared in root `package.json`.

---

## 3. Live infrastructure

| Service | Where | Notes |
|---|---|---|
| **Supabase project** | `uftbynydcmzfggltyjao.supabase.co` | All 11 migrations applied + seed + 499 companies imported |
| **GitHub** | `github.com/wazarat/chaindrain` | `main` is `7a85ca1` |
| **Vercel** | `chaindrain.vercel.app` | Web app, Root Directory must be `apps/web` (see §8) |
| **FastAPI** | not deployed | Runs locally on `:8000` |
| **Comet agent** | not deployed | Scaffold only |

Supabase MCP is wired to this project — the assistant can run SQL, list migrations, get advisors, etc. directly.

---

## 4. Database state (Supabase)

- **7 sectors**, **36 subsectors** seeded via `supabase/seed.sql` (already applied).
- **499 unique companies** imported from `data/companies/*.csv` via `scripts/import_from_google_sheets.py`. 526 raw rows → 27 dedup'd by slug → 499 inserted.
- All public tables have **RLS enabled** and at least one policy. `public.rls_audit()` returns 0 rows.
- **Security advisor**: 0 errors, 7 warnings (all intentional — see `DECISIONS.md` §3).

Company distribution:
| Sector | Count |
|---|---|
| Governance & Enterprise Framework | 134 |
| Advanced Compute & Integration | 92 |
| Data & Consensus Infrastructure | 78 |
| Monetary & Access Rails | 75 |
| DeFi Systems Architecture | 49 |
| Core Protocol Architecture | 43 |
| Rollup & Scaling Frameworks | 28 |

---

## 5. API architecture — three Supabase clients

`apps/api/app/supabase_client.py` exposes three clients picked **per route by access semantics**:

| Client | Key | RLS as | Use for |
|---|---|---|---|
| `public_client()` | anon | `anon` role | Public reads (catalog, events list, threat matrix, search) |
| `user_client(jwt)` | anon + per-request JWT | `auth.uid()` of that user | Per-user endpoints (`/me`, watchlists, notifications) |
| `admin_client()` | service-role | bypasses RLS | Admin/agent routes only; raises `503` if `SUPABASE_SERVICE_ROLE_KEY` is empty |

**Routers and which client they use:**
- `catalog.py` → `public_client`
- `events.py` → `public_client` for list/get; `admin_client` (gated by `require_admin`) for create/patch
- `search.py` → `public_client`
- `threat_matrix.py` → `public_client` for read; `admin_client` for `/refresh` (gated)
- `me.py` → `user_client(jwt)`
- `watchlists.py` → `user_client(jwt)`; `public_client` for the company-exists check
- `notifications.py` → `user_client(jwt)`
- `admin.py`, `agent.py` → `admin_client`

JWT verification in `apps/api/app/auth.py` uses **JWKS** (`/auth/v1/.well-known/jwks.json`). The Supabase project uses **ES256** asymmetric signing. `Settings.jwks_url` is auto-derived from `SUPABASE_URL` if not explicitly set.

---

## 6. Supabase migrations (in apply order)

```
20250101000000_init_extensions_and_enums.sql   (pgcrypto, uuid-ossp, vector, pg_trgm, pg_net, evidence_class/severity/status enums)
20250101000100_profiles.sql                    (profiles, handle_new_user trigger, is_admin, admin_grant)
20250101000200_sectors_companies.sql           (sectors, subsectors, companies)
20250101000300_events.sql                      (events, event_sources, event_companies, FTS, embedding column)
20250101000400_watchlists_notifications.sql    (watchlists, notifications)
20250101000500_triggers_signals.sql            (tg_events_after_insert, tg_fanout_watched_company_event, detect_sector_signal)
20250101000600_threat_matrix.sql               (mv_threat_matrix, v_threat_components, refresh_threat_matrix)
20250101000700_search.sql                      (search_events hybrid pgvector+FTS)
20250101000800_cron.sql                        (pg_cron jobs for refresh)
20250101000900_rls_audit_fn.sql                (NEW: rls_audit())
20250101001000_harden_security.sql             (NEW: revoke EXECUTE, pin search_path, security_invoker view)
```

Live Supabase has these applied with auto-generated timestamps (`20260514…`). Repo file versions are the canonical truth for fresh deploys.

---

## 7. Local dev — how to run

**Env files (gitignored, must be created locally):**

`apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://uftbynydcmzfggltyjao.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<long eyJ... legacy anon key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

`apps/api/.env`:
```
ENVIRONMENT=development
SUPABASE_URL=https://uftbynydcmzfggltyjao.supabase.co
SUPABASE_ANON_KEY=<same anon key>
SUPABASE_SERVICE_ROLE_KEY=        # optional in dev; admin/agent endpoints 503 if empty
ALLOWED_ORIGINS=http://localhost:3000
```

**Run:**
```bash
# API
cd apps/api && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# Web
pnpm --filter @chaindrain/web dev
```

**Verified working endpoints (last session):**
- `GET /healthz` → 200
- `GET /sectors` → 7 items
- `GET /companies?limit=N` → paginated
- `GET /threat-matrix` → cells=0 (no events yet), 36 subsectors, 7 evidence classes
- `GET /me` (no token) → 401 ✓
- Web `/`, `/login`, `/signup` → 200; `/dashboard` → 307 (correct redirect when unauthenticated)

---

## 8. Vercel deploy state

- Project: `chaindrain.vercel.app`
- **Root Directory** must be set to `apps/web` in Vercel dashboard (Settings → General).
- **"Include source files outside of the Root Directory"** checkbox must be ON (so `pnpm-workspace.yaml` and `packages/*` are visible at build time).
- Env vars set in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `NEXT_PUBLIC_API_BASE_URL` is empty for now (API not deployed).
- `apps/web/vercel.json` (current, simplified):
  ```json
  {
    "framework": "nextjs",
    "buildCommand": "pnpm --filter @chaindrain/web... build",
    "installCommand": "pnpm install --frozen-lockfile",
    "outputDirectory": ".next",
    "regions": ["iad1"]
  }
  ```
- **`7a85ca1` is live.** `chaindrain.vercel.app` renders the landing page. The simplified `vercel.json` (no `cd ../..`) was the fix.
- **API is not deployed.** `NEXT_PUBLIC_API_BASE_URL` in Vercel is empty, so the production web app cannot reach `/me`, `/watchlists`, etc. Authenticated reads from the live site need a deployed API (Fly/Railway/Render for FastAPI, or rewrite as Next.js Route Handlers using `@supabase/ssr`).

---

## 9. Day 1 KPI gate — status

| KPI | Status |
|---|---|
| All migrations applied | ✓ |
| ≥500 companies imported | ✓ (499 unique slugs) |
| RLS verified clean | ✓ (audit + advisor) |
| `/healthz` returns 200 | ✓ |
| Web preview loads | ✓ (Vercel green on `7a85ca1`) |
| Sign-up creates `profiles` row with `role='user'` | ✓ (validated DB-side via 2 independent signups; trigger fires synchronously) |
| Admin promotion path works | ✓ (`waz@canhav.com` flipped to `role='admin'` via `admin_grant`) |

**Caveat:** the signup → `/me` round-trip has only been validated at the DB layer. Validating it over HTTP from prod requires a deployed API.

---

## 10. Where work paused at end of last session

**Day 1 is closed.** The 2026-05-15 session confirmed Vercel green, validated `handle_new_user` end-to-end via two real signups, and granted the first admin (`waz@canhav.com`).

**The next session should pick up Day 2.** The most important blocking decision is **where the FastAPI runs in production** — without that, the live site can't exercise any authenticated path. Options on the table: deploy `apps/api` to Fly/Railway/Render, or rewrite the per-user routes as Next.js Route Handlers using `@supabase/ssr` and retire the FastAPI surface for those endpoints.

Day 2 KPIs from the project plan: Comet agent posts a synthetic HMAC-signed event → threat matrix shows ≥1 non-zero cell → admin triage UI works.
