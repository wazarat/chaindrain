# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-15 PM #2 (Day 3 — agent live on Fly, trigger path verified end-to-end, daily cron scheduled).
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
| **FastAPI** | `chaindrain-api.fly.dev` | 2× shared-cpu-1x 512 MB in `iad`. Healthcheck `GET /healthz`. Deployed via CLI from `apps/api/` (not the GitHub integration — see DECISIONS §10). |
| **Comet agent** | `chaindrain-agent.fly.dev` | 2× shared-cpu-1x 1024 MB in `iad`, auto-stop. HMAC-verified `POST /run` endpoint; runs `run_daily.run()` in BackgroundTask. Image ~612 MB (Playwright + Chromium baked in). Deployed via CLI from `apps/agent/`. |
| **`cron-trigger` Edge Function** | `…supabase.co/functions/v1/cron-trigger` | Deployed via MCP, `verify_jwt=false`. Daily 13:00 UTC fire via `pg_cron` job `chaindrain_daily_agent`. Function secrets `AGENT_RUN_URL` + `AGENT_HMAC_SECRET` must be set in Supabase dashboard. |

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
20250101000800_cron.sql                        (pg_cron jobs for refresh — original cron-trigger schedule depended on unset GUCs)
20250101000900_rls_audit_fn.sql                (rls_audit())
20250101001000_harden_security.sql             (revoke EXECUTE, pin search_path, security_invoker view)
20250101001100_cron_trigger_config.sql         (NEW Day 3: rewrite chaindrain_daily_agent to call cron-trigger Edge Function directly, no auth header)
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
AGENT_HMAC_SECRET=               # required for /agent/* routes; share with apps/agent if running locally
ALLOWED_ORIGINS=http://localhost:3000
```

Prod Fly secrets on `chaindrain-api` (`flyctl secrets list --app chaindrain-api`): the same set above with real values, plus `ALLOWED_ORIGINS=https://chaindrain.vercel.app`.

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
- **`chaindrain-api.fly.dev` is live** (Day 2). Production needs `NEXT_PUBLIC_API_BASE_URL=https://chaindrain-api.fly.dev` set in the Vercel dashboard (Production env) and a redeploy before authenticated reads (`/me`, `/watchlists`, `/admin/events`) work over the wire.

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

## 9b. Day 2 KPI gate — status

| KPI | Status |
|---|---|
| `chaindrain-api` deployed | ✓ (Fly, 2× machines, `iad`) |
| Synthetic HMAC event lands via `/agent/events` | ✓ (event `bfafcafb-589b-4c6e-b9e5-f57bd6510432`, status auto-promoted to `corroborated`) |
| Threat matrix shows ≥1 non-zero cell after refresh | ✓ (`liquid-staking-tokens` × `operational_compromise`, score 1.0) |
| Admin triage UI lists pending events with Confirm/Retract | ✓ (user-confirmed smoke test on prod, Day 3 session) |
| `/me` round-trip works over HTTP from prod | ✓ (implicit — `/admin/events` triage hits the API with bearer token successfully) |

## 9c. Day 3 KPI gate — status

| KPI | Status |
|---|---|
| `chaindrain-agent` deployed to Fly | ✓ (`chaindrain-agent.fly.dev`, 2× shared-cpu-1x 1024 MB, `iad`, image 612 MB) |
| Agent `/run` HMAC-verifies + parses JSON body (`dry_run`, `limit_sources`) | ✓ (Phase A fixes: `run_daily.run()` callable; `server.py` reads body; smoke-tested via curl with `dry_run=true,limit_sources=1` → 200 + 23 dry-run findings from rekt-news) |
| Trigger path end-to-end: `/admin` UI → API admin → HMAC sign → agent `/run` → BackgroundTask | ✓ (user clicked "Run agent now"; API forwarded HMAC-signed body; agent returned `{"status":"scheduled","dry_run":false,"limit_sources":null}`) |
| `agent_runs` row inserted by live run | ✓ (rows `0bceb2fb…` at 17:24:31Z and `14753d41…` at 17:26:20Z, status=`running` → terminal) |
| `ALLOWED_ORIGIN_REGEX` wired (Vercel preview deploys can call API) | ✓ (code in `apps/api/app/{config,main}.py`; Fly secret set to `https://chaindrain-git-.*\.vercel\.app`) |
| `cron-trigger` Edge Function deployed | ✓ (v1, `verify_jwt=false`, ACTIVE) |
| `pg_cron` schedule fires daily at 13:00 UTC | ✓ (job `chaindrain_daily_agent` rewritten via migration `20250101001100_cron_trigger_config.sql` to call function URL directly, no auth header) |
| Edge Function secrets `AGENT_RUN_URL` + `AGENT_HMAC_SECRET` set | ⏳ Pending user — must be set in Supabase dashboard before first scheduled fire works |
| Service-role key rotated | ⏳ End-of-session cleanup (Phase J) |
| Sentry DSNs wired | ⊘ Skipped (no DSNs provided this session) |

**Catalog-coverage caveat:** the first real run produced 23 raw findings from rekt-news but 0 events inserted because their protocol names (Wasabi, KelpDAO, Drift, Hyperbridge, …) don't match our 499-company crypto-infra catalog. This is expected; rekt.news covers DeFi protocols, not infrastructure. Source curation / catalog expansion is a Day 4+ tuning task.

---

## 10. Where work paused at end of last session

**Day 3 is closed.** All four required Day 3 goals achieved: agent deployed, trigger path verified end-to-end (`/admin` button → `agent_runs` row), Edge Function deployed, daily cron scheduled. `ALLOWED_ORIGIN_REGEX` added (optional goal #5).

**Open follow-ups for the next session:**
1. **Set Edge Function secrets in Supabase dashboard.** Function `cron-trigger` needs `AGENT_RUN_URL=https://chaindrain-agent.fly.dev/run` and `AGENT_HMAC_SECRET=<same as Fly>`. Until these are set the daily 13:00 UTC fire will 500. Project Settings → Edge Functions → Secrets.
2. **Rotate Supabase service-role key + AGENT_HMAC_SECRET.** Both have transited the Cascade transcript / `~/.zsh_history` multiple times. Steps in DECISIONS §10 / the original Day 3 plan §J. Rotate, re-set on both Fly apps via `flyctl secrets set --stdin`, scrub `~/.zsh_history`.
3. **Wire Sentry DSNs.** `apps/api/app/main.py:_init_sentry` and `apps/agent/app/server.py:_init_sentry` already read `SENTRY_DSN_API` / `SENTRY_DSN_AGENT` respectively. Just `flyctl secrets set` once DSNs are provisioned.
4. **Catalog vs source coverage.** The 23 rekt-news findings from the first live run all dropped at the classifier because protocol names don't match our 499-company catalog. Either add DeFi protocols to the catalog or curate sources to be infra-focused. Day 4+ tuning.

**Day 4+ candidates:** broader source curation, notification fan-out testing, Sentry, Coordinator UI polish, prod observability dashboards.
