# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — **Phase 4 DONE ✓ (locally)**. FAN OUT leg: `/alerts` index (7-day default, sortable by `severity` / `fanout_tvl_usd` / `fanout_count` / `detected_at`, with `signal_type` + `severity` + time-window filters) + `/alerts/[alert_id]` contagion view (alert header with raw_signal JSON + affected entities table ordered by `blast_radius_usd DESC` + Method B similar-exposure panel). All Phase 4 queries through `src/lib/db/queries.ts`: `listAlerts`, `getAlertById`, `getAffectedEntities`, `getSimilarExposure` (parameterized on `dependency_field` + `similarVia` — see DECISIONS §24). `getKpiSummary` now joins `chaindrain.alert` so the dashboard's 4th KPI card surfaces "Alerts (24h)" with a link to `/alerts`. Cross-page `<SiteHeader>` with active-tab nav. `pnpm typecheck/lint/build/test` (29 tests) all clean. Live E2E smoke (4 synthetic alerts seeded then cleaned up): Chainlink contagion page (90 affected entities + 10 Method B similar) renders in **198ms application-code** — under the 200ms spec budget. Ready for Phase 5 (daily digest via Resend). Phase 3 prod deploy still requires the user to set `CRON_SECRET` in Vercel before the GitHub Actions cron produces real alerts (see §8).

> **Read order for a new AI session:** this file → [DECISIONS.md](DECISIONS.md) → [CHANGELOG_DEV.md](CHANGELOG_DEV.md) → the active plan at `~/.cursor/plans/chaindrain_mvp_rebuild_5bcd46dc.plan.md`.

---

## 0. Critical user preferences

- **All commits must be authored by `wazarat <wazarat@outlook.com>`.** Never `cursoragent@cursor.com`. The Cursor agent runtime auto-injects a `Co-authored-by: Cursor <cursoragent@cursor.com>` trailer; **a `commit-msg` hook at `.git/hooks/commit-msg` strips it on every commit.** Do not remove that hook. Pass `GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat` as env vars on every `git commit` since the global `user.email` is `wazarat@users.noreply.github.com` (and we cannot modify git config — safety rule).
- **Push to `github.com/wazarat/chaindrain`** after each phase. Show diffs before moving on.
- **Do not edit the active plan file** at `~/.cursor/plans/chaindrain_mvp_rebuild_5bcd46dc.plan.md`. It's append-only.
- **Don't add code comments** unless the user asks (DECISIONS §9). Don't add narrative comments to the docs/CHANGELOG; only factual log entries.

---

## 1. What Chaindrain is (post-pivot, 2026-05-16)

A **predictive threat-detection engine for crypto protocols.** Three legs from [chaindrain_export/data/mvp_scope_spec.md](../../../Downloads/chaindrain_export/data/mvp_scope_spec.md):

1. **SCORE** — show 875 entities ranked by `risk_score`, filterable by tier/sector/oracle/bridge/stablecoin/chain.
2. **DETECT** — a worker that polls 5 free signal sources and writes alerts when a watched dependency degrades.
3. **FAN OUT** — given an alert on dependency D, surface every entity that depends on D, ordered by `blast_radius_usd`. The actual product differentiator.

Single-tenant, IP-allowlisted on Vercel. **No auth in v1.**

---

## 2. Stack lock — do not deviate

- Next.js **16.2.6 stable** (the scaffolder gave 16; the plan said "15 stable" but 16 is the current stable major and App Router is unchanged) + TypeScript + Tailwind v4 (`@tailwindcss/postcss`).
- `@supabase/supabase-js` for any client-side reads (but most data fetches are server-side).
- **Drizzle ORM + drizzle-kit** for typed queries and schema introspection. `postgres` (`postgres-js`) as the underlying driver — Vercel Edge-compatible.
- **Vercel** for web + cron (5-min `*/5` poll, daily `0 9` digest).
- **Resend** for the daily digest email (free tier 100/day).
- React **19.2.4** (came with Next 16 scaffold).

**Out of scope for v1, refuse if asked:** auth, multi-tenant, charts beyond Recharts, Slack/Discord, LLM reasoning, alert replay, custom UI design system. Reference: [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) "What to NOT build in v1".

---

## 3. Repo layout (current state)

```
chaindrain/
├── apps/
│   ├── web/        # legacy Next.js 15.0.0-rc.0 — frozen, will be removed in a Phase 6 cleanup
│   └── mvp/        # Phase 1+2+3 — Next.js 16.2.6, dashboard renders, prod build clean
│       ├── src/app/layout.tsx, globals.css, page.tsx, favicon.ico   ← Phase 2 — server-rendered SCORE dashboard
│       ├── src/app/api/health/route.ts   ← Phase 1 — Drizzle count, returns { ok: true, count }
│       ├── src/app/api/entities/route.ts                ← Phase 2 — paginated, zod-validated query params
│       ├── src/app/api/entities/[entity_id]/route.ts    ← Phase 2 — single mvp_master row, zod-validated UUID
│       ├── src/app/api/cron/poll/route.ts               ← Phase 3 — Bearer CRON_SECRET, calls runPollers()
│       ├── src/app/alerts/page.tsx                      ← Phase 4 — alerts index, 7-day default, sortable + filterable
│       ├── src/app/alerts/[alert_id]/page.tsx           ← Phase 4 — contagion view (header + affected + similar exposure)
│       ├── src/components/{kpi-cards,filter-bar,multi-select,entities-table,entity-drawer,site-header}.tsx  ← Phase 2 UI + Phase 4 SiteHeader nav
│       ├── src/components/{alerts-filter-bar,alerts-table,alert-header,affected-entities-table,similar-exposure-panel}.tsx  ← Phase 4 UI
│       ├── src/lib/pollers/{types,stablecoin-depeg,oracle-deviation,bridge-pause,admin-tx,tvl-drop}.ts   ← Phase 3 — 5 pure poller fns + shared types
│       ├── src/lib/pollers/*.test.ts                    ← Phase 3 — vitest unit tests (29 cases, all green)
│       ├── src/workers/poll-signals.ts                  ← Phase 3 — orchestrator; tsx-runnable via `pnpm poll`; also called from cron route
│       ├── src/lib/supabase/{server,client}.ts   ← service-role + anon clients on `chaindrain` schema
│       ├── src/lib/db/{index,queries,schema,relations}.ts + meta/   ← queries.ts is the ONLY SQL surface; routes import from it
│       ├── src/lib/api/schemas.ts                       ← Phase 2/4 — entitiesQuerySchema + entityIdParamsSchema + alertsQuerySchema + alertIdParamsSchema (zod)
│       ├── src/lib/{utils,url-state}.ts                 ← Phase 2 — formatters / risk-tier classes / URL search-string helpers
│       ├── drizzle.config.ts   ← schemaFilter ['chaindrain'], uses DATABASE_URL_SESSION
│       ├── vitest.config.ts   ← Phase 3 — `pool: "forks"`, includes src/**/*.test.ts
│       ├── .env.local (gitignored) + .env.local.example   ← Phase 3 added CRON_SECRET + ETHERSCAN_API_KEY
│       ├── package.json     ← @chaindrain/mvp; drizzle-orm ^0.45.2, drizzle-kit ^0.31.10, @radix-ui/react-dialog ^1.1.15, lucide-react ^0.435.0, clsx ^2.1.1, viem ^2.49.3, vitest ^4.1.6
│       ├── tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs
│       └── public/
├── packages/shared-types/  # legacy TS types, kept until apps/web is removed
├── supabase/migrations/
│   ├── 20250101000000_init_extensions_and_enums.sql              legacy (extensions kept)
│   ├── 20250101000100…001100 (11 more)                            legacy, all DROPped by next entry
│   ├── 20260516000000_drop_legacy_public.sql                      Phase 0 — drops legacy public.*
│   ├── 20260516000100_chaindrain_schema.sql                       Phase 0 — chaindrain.* tables + view
│   ├── 20260516000200_chaindrain_grants.sql                       Phase 0 — anon SELECT, service_role ALL
│   └── 20260517000000_alerts.sql                                  Phase 3 — chaindrain.alert + 2 indexes + 2 CHECK constraints + grants
├── scripts/
│   ├── load_seed.mjs        ← canonical 875-row JSON loader (idempotent, runs in 1.5s)
│   ├── package.json + package-lock.json + node_modules/   ← outside the pnpm workspace
│   └── rls_audit.sql        ← legacy reference, no live use
├── docs/                    ← AI_CONTEXT, CHANGELOG_DEV, DECISIONS (this file)
├── pnpm-workspace.yaml      ← packages: apps/web, apps/mvp, packages/*
├── pnpm-lock.yaml           ← regenerated 2026-05-16 in Phase 1
├── .npmrc                   ← Phase 1 — pins `store-dir=~/Library/pnpm/store` to avoid an in-repo `.pnpm-store/` re-poisoning bug (see CHANGELOG 2026-05-16 PM #3)
├── .env.example             ← rewritten 2026-05-16 for the new stack
├── .git/hooks/commit-msg    ← strips Cursor co-author trailer (DO NOT REMOVE)
└── ~/Downloads/chaindrain_export/   ← OUTSIDE the repo: source of truth for the dataset
```

The `chaindrain_export/` bundle (in `~/Downloads/`) is the input dataset. Key files:
- `data/entities_final.json` — 875 entities, 53 fields each (canonical loader source)
- `data/mvp_master.xlsx` — human-readable mirror with Data Dictionary + Risk Methodology tabs
- `data/mvp_scope_spec.md` — the strategic doc that defines Score/Detect/Fan Out
- `sql/01_schema.sql` — DDL (already copied into `supabase/migrations/20260516000100_…sql`)
- `sql/02_seed.sql` — 3,500 INSERTs **but has 7 PK collisions** (do NOT use as a migration; use `scripts/load_seed.mjs` instead)
- `CURSOR_PROMPT.md` — phased build instructions for Cursor (the canonical phase spec)

---

## 4. Live infrastructure

| Service | URL | Status |
|---|---|---|
| **Supabase project** | `uftbynydcmzfggltyjao.supabase.co` (us-east-1, Postgres 17.6) | ACTIVE_HEALTHY. `chaindrain.*` schema with 875×4=3,500 rows. `public.*` empty. |
| **GitHub** | `github.com/wazarat/chaindrain` | `main` is `fa7e795` (Phase 0 close). Remote is HTTPS; pushes work. |
| **Vercel (legacy web)** | `chaindrain.vercel.app` | Frozen rollback parachute. Root Directory `apps/web`. Builds on every push to `main` unless an **Ignored Build Step** is set (see §9). Decommission in Phase 6. |
| **Vercel (mvp)** | `chaindrain-mvp.vercel.app` | LIVE since Phase 1. Root Directory `apps/mvp`, "Include source files outside Root Directory" ON. Phase 3 first push (`fee1948`) **failed** at validation because `vercel.json` had a sub-daily cron and the account is on Hobby; cron strategy moved to GitHub Actions (see DECISIONS §23). |
| ~~chaindrain-api.fly.dev~~ | — | **Destroyed 2026-05-16** (`flyctl apps destroy`). |
| ~~chaindrain-agent.fly.dev~~ | — | **Destroyed 2026-05-16**. |
| ~~Edge Function `cron-trigger`~~ | — | Removed from repo. Replaced by GitHub Actions `.github/workflows/cron-poll.yml` (every 5 min → curls the Vercel route). |

**Supabase MCP** is wired (`plugin-supabase-supabase`). Auth survives across sessions but if a tool call returns an auth error, run `plugin-supabase-supabase-mcp_auth` first. Project ref: `uftbynydcmzfggltyjao`.

---

## 5. Database state — `chaindrain` schema (verified, 2026-05-16)

| Table | Rows | Purpose |
|---|---|---|
| `chaindrain.identity` | 875 | name, sector, chain_deployments[], tvl_usd, defillama_slug, coingecko_id, launch_date |
| `chaindrain.contract_fingerprint` | 875 | proxy_pattern, upgrade_authority_type, admin_address, audits_tier, audit_firms[], bug_bounty_max_payout_usd, etc. |
| `chaindrain.dependency_fingerprint` | 875 | oracle_providers[], bridge_dependencies[], stablecoin_dependencies[], dvn_configuration + per-field `*_confidence` flags |
| `chaindrain.tier_state` | 875 | risk_score, risk_tier (critical/high/medium/low), coverage_tier (core/monitored/archive/excluded), blast_radius_usd, state |
| `chaindrain.mvp_master` (view) | 875 | All four joined on `entity_id` |
| `chaindrain.alert` | 0 (live) | Phase 3 — alert_id pk, detected_at, signal_type (CHECK), severity (CHECK), dependency_key, dependency_field, raw_signal jsonb, fanout_count, fanout_tvl_usd. Indexes: idx_alert_detected (detected_at DESC), idx_alert_severity ((severity, detected_at DESC)). |

**Indexes (already created):** GIN on `chain_deployments`, `oracle_providers`, `bridge_dependencies`, `stablecoin_dependencies`. B-tree on `sector`, `tvl_usd DESC NULLS LAST`, `defillama_slug`, `proxy_pattern`, `upgrade_authority_type`, `audits_tier`, `admin_address`, `primary_contract_address`, `dvn_configuration`, `risk_tier`, `coverage_tier`, `risk_score DESC`, `state`.

**Privileges:** `anon` + `authenticated` have `SELECT`; `service_role` has `ALL`. `ALTER DEFAULT PRIVILEGES` set so any future tables in `chaindrain` inherit the same.

**Top 5 by risk_score (verification):**
1. RealT — 0.8532 — critical
2. Arbitrum Bridge — 0.8074 — critical
3. Binance — 0.8032 — critical
4. Binance (Validator Operations) — 0.8032 — critical
5. Binance (Binance On-Ramp) — 0.8032 — critical

(The expected spec said RealT 0.853 / Arbitrum Bridge 0.807 / Binance 0.803 — matches to 3 decimal places. ✓)

**Pending manual user step:** Expose `chaindrain` schema in Supabase Dashboard → Project Settings → API → "Exposed schemas". Currently PostgREST returns `PGRST106 Invalid schema: chaindrain`. Optional — the MVP server-renders all data via Drizzle/postgres, so PostgREST exposure is only needed if you want client-side `supabase-js` reads to work.

---

## 6. Local dev environment

`apps/web/.env.local` (gitignored, contains the live secrets — read this for connection details):
```
NEXT_PUBLIC_SUPABASE_URL=https://uftbynydcmzfggltyjao.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<legacy anon JWT, embedded in repo>
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
DATABASE_URL=postgresql://postgres.uftbynydcmzfggltyjao:Aliali-572345@aws-1-us-east-1.pooler.supabase.com:6543/postgres
DATABASE_URL_SESSION=postgresql://postgres.uftbynydcmzfggltyjao:Aliali-572345@aws-1-us-east-1.pooler.supabase.com:5432/postgres
```

**Pooler hostname is `aws-1-us-east-1.pooler.supabase.com` (not `aws-0-…`). The `aws-0-…` host returns "Tenant or user not found" for this project.** Port 5432 = session mode (use for `drizzle-kit introspect`); port 6543 = transaction mode (use for runtime).

**Reload the seed:**
```bash
node scripts/load_seed.mjs
```
Idempotent — `TRUNCATE chaindrain.identity RESTART IDENTITY CASCADE` first. Run time: ~1.5s.

---

## 7. Phase status

### Phase 0 — DONE ✓ (commit `fa7e795` on `main`)
- Fly apps destroyed, repo pruned (apps/api/, apps/agent/, supabase/functions/cron-trigger/, legacy importer scripts, data/companies/).
- Migrations `20260516000000…200` applied to live Supabase.
- 875 entities loaded via `scripts/load_seed.mjs` (the bundled `02_seed.sql` is broken — see DECISIONS §15).
- `commit-msg` hook installed to strip Cursor co-author trailer. **Force-pushed clean Phase 0.**

### Phase 1 — DONE ✓ (commit `20c635b`, prod smoke green 2026-05-16 14:57 UTC)
**All 12 steps complete:**
1. `pnpm install` ran from repo root in 6.5s after clearing the polluted in-repo `.pnpm-store/` (see §8 + DECISIONS §18). 401 packages, 542 resolved.
2. `apps/mvp/src/lib/supabase/server.ts` — service-role client, `{ db: { schema: 'chaindrain' } }`, throws clean errors if `SUPABASE_SERVICE_ROLE_KEY` missing.
3. `apps/mvp/src/lib/supabase/client.ts` — anon browser client, same schema.
4. `apps/mvp/drizzle.config.ts` — `schemaFilter: ['chaindrain']`, output `src/lib/db/`, reads `DATABASE_URL_SESSION` (5432 session-mode pooler).
5. `pnpm db:introspect` succeeded: 4 tables, 60 cols, 17 indexes, 3 FKs, 1 view → `src/lib/db/schema.ts` + `relations.ts` + `0000_magical_the_hunter.sql` + `meta/`.
6. `apps/mvp/src/lib/db/queries.ts` stub: `countIdentities()` only (Phase 2 fills in the rest). Also added `src/lib/db/index.ts` — singleton `postgres` client (`prepare: false`, `max: 5`) + Drizzle wrapper.
7. `apps/mvp/src/app/api/health/route.ts` — `runtime: nodejs`, `dynamic: force-dynamic`, returns `{ ok: true, count }` or `{ ok: false, error }` on failure.
8. `.env.local` (gitignored) + `.env.local.example` (committed). `SUPABASE_SERVICE_ROLE_KEY` left blank — `/api/health` uses Drizzle/postgres over `DATABASE_URL` (postgres-superuser via pooler), no service-role needed.
9. Local smoke test ✓ — `pnpm dev` on port 3010 → `curl http://localhost:3010/api/health` → `{"ok":true,"count":875}` in 2.7s. `pnpm typecheck` clean. Scaffold defaults (`AGENTS.md`, `CLAUDE.md`, `README.md`) deleted.

**Two non-spec bumps vs the plan, both forced:**
- `drizzle-orm` `^0.36.4` → `^0.45.2` and `drizzle-kit` `^0.30.1` → `^0.31.10`. The 0.30.x drizzle-kit imports `drizzle-orm/gel-core`, a subpath only exported from `drizzle-orm` >= 0.37. Latest pair installed via `pnpm add … @latest`.
- A repo-root `.npmrc` was added pinning `store-dir=~/Library/pnpm/store` + `auto-install-peers=true` + `strict-peer-dependencies=false`. Without `store-dir`, pnpm falls back to an in-repo `.pnpm-store/v3` when the sandbox blocks writes to the default global store, which is where the original `pnpm install` hang came from.

10. Vercel project `chaindrain-mvp` created by user. Root Directory `apps/mvp`, "Include files outside Root Directory" ON, 4 env vars set (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DATABASE_URL_SESSION`). Build green on first try.
11. Prod smoke: `curl https://chaindrain-mvp.vercel.app/api/health` → `HTTP/2 200 {"ok":true,"count":875}` in 166ms (edge `yul1` → `iad1`, `x-vercel-cache: MISS`).
12. Commit `20c635b` pushed to `main` with author `wazarat <wazarat@outlook.com>` (no Cursor trailer — `commit-msg` hook worked).

**Pending (user, low-priority, can happen any time):**
- Move `chaindrain.xyz` custom domain from the legacy `chaindrain` Vercel project to `chaindrain-mvp`. User said they'd do this manually and notify. When done, this AI_CONTEXT row should be updated (§4 above) and the legacy project's "rollback parachute" status reaffirmed.

### Phase 2 — SCORE leg — DONE ✓ (locally, 2026-05-16)
**The dashboard at `/`.** All Phase 2 acceptance criteria met locally; `pnpm build` clean.
- 4 KPI cards (critical count, high count, total TVL, total blast radius) sourced from `getKpiSummary()`.
- Filter bar with multi-select on sector, risk_tier, coverage_tier, oracle_provider, chain, bridge + free-text name search. State lives in URL `searchParams`; filter changes use `router.push` inside a `useTransition`.
- Sortable HTML table over `chaindrain.mvp_master`, 50/page default, default sort `risk_score DESC NULLS LAST`, name as secondary key. Sort fields: `risk_score`, `tvl_usd`, `blast_radius_usd`, `name`, `sector`, `risk_tier`, `coverage_tier`. Pagination prev/next at the bottom.
- Row click → Radix `<Dialog>` drawer (right-side slide-in, `max-w-2xl`) showing all 48 fields from `mvp_master` grouped into Identity / Contract Fingerprint / Audits & Bounties / Dependencies / Risk Factors. Drawer fetches from `/api/entities/[entity_id]` keyed on the row id; component is keyed on entity_id so state resets cleanly per open.
- Routes: `GET /api/entities` (paginated, zod-validated query params via `entitiesQuerySchema`), `GET /api/entities/[entity_id]` (zod UUID validation). Both `runtime: 'nodejs'`, `dynamic: 'force-dynamic'`.
- **All SQL through `src/lib/db/queries.ts`** — `getKpiSummary`, `getFilterOptions`, `getEntities`, `getEntityById`. Route handlers contain no SQL strings. Filters use Postgres array operators (`= ANY(...)` for scalar columns, `&&` overlap for `oracle_providers` / `chain_deployments` / `bridge_dependencies`).
- **Acceptance verified:** `riskTiers=critical` → 59 rows, RealT first (`risk_score=0.8532`). Default unfiltered view shows 875 entities. Sector="Tokenized Real-World Assets" → 28 rows. Multi-filter (`oracles=Chainlink&riskTiers=critical&sort=tvl_usd`) → 13 rows, Binance Validator Operations top. Invalid query params → 400 with structured zod issue list.
- New deps added in this phase: `@radix-ui/react-dialog ^1.1.15`, `lucide-react ^0.435.0`, `clsx ^2.1.1`. No `tailwind-merge` needed — Tailwind v4 + clsx is sufficient.

### Phase 3 — DETECT leg — DONE ✓ (locally, 2026-05-16)
Migration `20260517000000_alerts.sql` applied (alert_id pk + indexes + CHECK constraints for signal_type/severity + grants). Drizzle re-introspect lifted the table into `src/lib/db/schema.ts` (5 tables / 69 cols now). 5 pure poller fns at `src/lib/pollers/`:
- `stablecoin-depeg.ts` — CoinGecko `/simple/price` for 7 stables (USDC/USDT/DAI/FDUSD/USDS/USDe/USD0); thresholds 0.005 → high, 0.02 → critical. Exposes pure `classifyStablecoinPrices` for tests.
- `oracle-deviation.ts` — viem Chainlink ETH/BTC/LINK feeds via `https://eth.llamarpc.com` (overridable via `ETH_RPC_URL`) + Pyth Hermes `/v2/updates/price/latest` for the same pairs + CoinGecko as the reference. Thresholds 0.01 medium, 0.05 high. Exposes `classifyOracleDeviations(input)`.
- `bridge-pause.ts` — LayerZero V2 EndpointV2 (`0x1a44…728c`) `paused()` via viem (graceful null on revert) + Wormholescan `/v1/heartbeats` (alerts when distinct active guardians < 13) + Axelarscan `/getChainMaintainers` (alert per chain with maintainers < 3). All → severity=critical. Exposes `classifyBridgeReadings`.
- `admin-tx.ts` — top 100 entities by risk_score (UUID + admin_address + upgrade_authority_type) sourced via `getTopAdminWatchEntities()`, Etherscan `txlist` (5 req/s, 250ms sleep between calls). Filters txs ≥ now − 5min. Severity=high for EOA/Multisig, medium otherwise. Dependency_field=`admin_address` (scalar). Skips with `console.warn` when `ETHERSCAN_API_KEY` missing.
- `tvl-drop.ts` — DefiLlama `/protocols`, joins on `defillama_slug` from `getWatchedDefillamaSlugs()`; thresholds `change_1d ≤ -20%` → high, `≤ -40%` → critical. Dependency_field=`defillama_slug` (scalar).

Orchestrator `src/workers/poll-signals.ts` (`pnpm poll`, tsx-runnable): fetches admin watchlist + slugs once, runs all 5 pollers via `Promise.allSettled`, per-poller try/catch (`console.error({ pollster, error })`), computes fanout via `computeFanout(dependency_field, dependency_key)` (uses GIN `&&` for array fields, scalar `=` for `admin_address`/`defillama_slug`), persists each alert atomically with `insertAlert`. Returns `PollRunSummary` (started_at, finished_at, elapsed_ms, per-poller outcomes, persisted alerts).

`src/app/api/cron/poll/route.ts` (`runtime: nodejs`, `dynamic: force-dynamic`, `maxDuration: 60`): rejects with 500 `cron_secret_not_configured` if `CRON_SECRET` unset; 401 `unauthorized` on missing/wrong Bearer; else runs the orchestrator and returns `{ ok: true, summary }`. Accepts both GET and POST (the GitHub Actions cron sends POST).

**Schedule**: `.github/workflows/cron-poll.yml` — GitHub Actions cron at `*/5 * * * *` (note: GitHub may throttle to ~10–15 min under load; spec compliance is "regular execution", not exact 5-min cadence). The workflow `curl`s `https://chaindrain-mvp.vercel.app/api/cron/poll` with `Authorization: Bearer ${{ secrets.CRON_SECRET }}` and fails the run on non-200. `workflow_dispatch` is enabled for ad-hoc manual triggers (optional `target_url` input for preview deployments). No `apps/mvp/vercel.json` cron — Vercel Hobby plan rejects sub-daily schedules.

Vitest setup: `vitest.config.ts` `pool: "forks"`, includes `src/**/*.test.ts`. 5 test files, **29 tests, all passing**. Headline test: synthetic USDC=0.97 → 1 critical alert with `dependency_key='USDC'`, `dependency_field='stablecoin_dependencies'`. Live E2E smoke (one-off script, then deleted) proved end-to-end pipeline: classifier → `computeFanout` → `insertAlert` → readback → cleanup. Live USDC fanout = **70 entities, $39.5B blast radius** (spec's `> 50` requirement satisfied).

`apps/mvp/.env.local.example` now documents `CRON_SECRET=` (generate with `openssl rand -hex 32`), `ETHERSCAN_API_KEY=` (free at etherscan.io/myapikey), optional `ETH_RPC_URL=` override.

### Phase 4 — FAN OUT leg — DONE ✓ (locally, 2026-05-16)
**The differentiator.** Phase 4 ships two pages plus 4 new queries + 5 new UI components + a navigation header used by both pages.

- **Queries** (`src/lib/db/queries.ts`): `listAlerts({ windowDays, signalTypes?, severities?, sortField, sortDirection, page, pageSize })` with severity sort via `CASE` expression (`sql.unsafe(...)`); `getAlertById(alertId)`; `getAffectedEntities(field, key, { limit })` reuses the `computeFanout` GIN-friendly predicate and orders by `blast_radius_usd DESC NULLS LAST`; `getSimilarExposure(field, key, { similarVia?, limit })` implements Method B over a CTE pipeline (`affected → exposure → exposure_arr`) and uses `IN (SELECT ...)` to count overlap members per candidate. `defaultSimilarVia(field)` returns `oracle_providers` for everything except oracle alerts, which default to `stablecoin_dependencies` so the dimensions don't collapse. `getKpiSummary()` now runs the entity aggregate + a 24h alert count in `Promise.all`.
- **Pages**: `/alerts` (server, `runtime: nodejs`, `dynamic: force-dynamic`) with `alertsQuerySchema` zod parsing, `<AlertsFilterBar>` (3-window segmented control + signal-type + severity multi-selects, URL-driven state inside `useTransition` like the SCORE filter bar), `<AlertsTable>` (sortable headers, relative-time + absolute-time per row, dependency chip + field label, blast radius compact-USD, pagination). `/alerts/[alert_id]` parses the UUID via `alertIdParamsSchema` and 404s on a bad/missing id; the page header is `<AlertHeader>` (severity pill, signal label, dependency_key + field, detected_at, fanout count + blast radius stat strip, raw_signal JSON viewer); affected table is `<AffectedEntitiesTable>` (matching dependency chip highlighted red); similar-exposure panel is `<SimilarExposurePanel>` (amber overlap chips, overlap_score bold). Footer surfaces the `similarVia` axis so users see which dimension drove the similar set.
- **Schema/utils**: `src/lib/utils.ts` adds `severityClass`, `signalTypeLabel`, `dependencyFieldLabel`, `formatDateTime`, `formatRelativeTime`. `src/lib/api/schemas.ts` adds `SIGNAL_TYPES`, `SEVERITIES`, `ALERT_SORT_FIELDS`, `alertsQuerySchema`, `alertIdParamsSchema`. `src/components/site-header.tsx` is the new cross-page nav (active tab pill).
- **Dashboard wiring**: 4th KPI card swapped from "Total blast radius" to "Alerts (24h)" with critical-count sub-text and a link to `/alerts`. The dashboard's inline header was replaced with `<SiteHeader active="dashboard" />` so the same nav is on every page.
- **Acceptance (live, smoke-verified on 2026-05-16)**: seeded 4 synthetic alerts directly into `chaindrain.alert` via Supabase MCP (USDC depeg / Chainlink deviation / LayerZero pause / aave TVL drop, all tagged `raw_signal.source='phase4-smoke'`), curled the dev server on :3010, then deleted. Per-page timings: `/alerts` warm = 130ms application-code; `/alerts/[Chainlink]` (90 affected + 10 Method-B similar) = **198ms application-code** — at the 200ms spec budget. `/alerts/[USDC]` rendered 70 affected entities top-5 = Ether.fi Cash / JustLend / BlackRock BUIDL / Securitize / Ondo (matches `blast_radius DESC` ground truth). Method B for `USDC` over `oracle_providers` returned Ether.fi / Ethena (USDe) / Usual Money (overlap=2 each, Chainlink+Pyth or Chainlink+RedStone). Method B for `Chainlink` over `stablecoin_dependencies` returned Curve Finance (overlap=5), Pendle / JustLend / Jupiter (overlap=3). Bad UUID and unknown UUID both 404 (17ms / 68ms).
- **Out of Phase 4 scope (deferred per spec, refuse if asked)**: alert acknowledge/triage UI, alert dedup, email/Slack/Discord (Phase 5+), Forta/incident-ledger ingestion (post-MVP), historical-alert replay/backtesting. Alert dedup is still deferred — if a poller produces the same `(signal_type, dependency_key)` 12 times an hour, the `/alerts` UI will show 12 rows in the window. Phase 4 explicitly puts that noise in the open so we can decide on a dedup policy when real signal arrives.

### Phase 5 — Daily digest
`src/app/api/cron/digest/route.ts` runs `0 9 * * *` daily via Vercel Cron. Resend SDK, plain HTML, subject `Chaindrain Daily — N critical / M high alerts`, 3 lines per alert. Env: `RESEND_API_KEY`, `DIGEST_RECIPIENTS` (comma-separated). Tag `v0.1.0` when all 6 done-criteria boxes from CURSOR_PROMPT.md are green.

---

## 8. Where the chat paused (handoff to Phase 5)

**Phase 4 fully closed locally.** `/alerts` index + `/alerts/[alert_id]` contagion view + Method B similar-exposure panel + KPI rewire + cross-page nav. `pnpm typecheck/lint/build/test` all clean. End-to-end smoke proven on the live DB: 4 synthetic alerts seeded → all pages render → contagion warm ≤ 200ms application-code → synthetic alerts deleted (so the prod `chaindrain.alert` table is back to 0 rows).

**Phase 3 still has open prod-config gaps (carried over from the previous handoff). The Phase 4 commit does not change any of this:**
1. **`CRON_SECRET` not set in Vercel `chaindrain-mvp` env vars** (Production + Preview + Development). Value to use: `ebb216acc57724d8a9c29be22d9669e5b964707b318d176530cda535dec80846` (matches `apps/mvp/.env.local` and the value the user should put in GitHub repo secrets). Without it, `POST /api/cron/poll` returns 500 `cron_secret_not_configured` and the cron never produces alerts. **Verified at the start of the Phase 4 session via `curl -X POST https://chaindrain-mvp.vercel.app/api/cron/poll` → 500.**
2. **`CRON_SECRET` not set in GitHub repo secrets** (Settings → Secrets and variables → Actions → New repository secret, name `CRON_SECRET`, same value). Without it, the workflow exits 1.
3. **Confirm `ETHERSCAN_API_KEY` is set in Vercel Preview as well as Production.**
4. **Set Ignored Build Step on both Vercel projects** so pushes touching `apps/web/` don't fire `chaindrain-mvp` builds and vice versa (see §9 below).
5. **First successful cron fire** will produce rows in `chaindrain.alert`, which will then populate the new `/alerts` page on prod automatically. Until then, `/alerts` will render "No alerts in the last 7 days." and the dashboard KPI will show "0 alerts (24h)" — both empty-states are handled correctly.

**Quick prod-demo of Phase 4 without waiting for the cron:** if the user wants to see the live `/alerts` UI populated immediately after the Phase 4 deploy, seed synthetic alerts directly into prod Supabase via the MCP. The exact SQL used in the Phase 4 smoke was:

```sql
INSERT INTO chaindrain.alert (alert_id, detected_at, signal_type, severity, dependency_key, dependency_field, raw_signal, fanout_count, fanout_tvl_usd)
SELECT '00000000-0000-4000-a000-000000000001'::uuid, now() - interval '2 minutes', 'stablecoin_depeg', 'critical', 'USDC', 'stablecoin_dependencies',
       '{"source":"phase4-demo","price":0.97,"deviation":0.03}'::jsonb,
       COUNT(*)::int, COALESCE(SUM(blast_radius_usd),0)::numeric
FROM chaindrain.mvp_master WHERE stablecoin_dependencies && ARRAY['USDC']::text[];
-- Repeat with different uuids/signal_types/dependency_keys for variety. Clean up with:
-- DELETE FROM chaindrain.alert WHERE raw_signal->>'source' LIKE 'phase4-%';
```

**Two traps from earlier phases still relevant:**
- **pnpm store-dir** (DECISIONS §18): if `pnpm install` ever hangs with no progress for minutes, run `xattr -rd com.apple.provenance node_modules .pnpm-store && rm -rf .pnpm-store apps/*/node_modules node_modules pnpm-lock.yaml`, then re-install with `required_permissions: ["all"]`. The root `.npmrc` already pins `store-dir=~/Library/pnpm/store`.
- **React 19's `react-hooks/set-state-in-effect`** (Phase 2 design notes): use key-based remount (e.g. `<DrawerInner key={entityId} />`) or the "adjust state during render" pattern for URL-driven inputs. Phase 4's `<AlertsFilterBar>` uses URL-as-source-of-truth so it sidesteps the rule entirely — no local state for filters.

**Phase 4 design notes worth carrying forward:**
- **Method B parameterization** (DECISIONS §24): `getSimilarExposure(field, key, { similarVia?, limit })` accepts a `similarVia` discriminator that must be a different array axis than the alert's `dependency_field`. `defaultSimilarVia(field)` returns `oracle_providers` for everything except oracle alerts (which default to `stablecoin_dependencies`). The CTE pipeline (`affected → exposure → exposure_arr`) hits the GIN indexes on the array columns and stays under 200ms for any single-key alert. Reuse this seam for any future contagion-related queries.
- **Severity sort via `sql.unsafe(CASE ...)`**: postgres-js single-arg `sql(identifier)` only handles identifier quoting, not arbitrary expressions. The `severity` sort relies on a CASE expression that maps `critical → 0`, `high → 1`, etc. so `ORDER BY severity ASC` semantically means "critical first". The whitelist in `ALERT_SORTABLE` is the only injection guard — if you add a new sort field, add it to `ALERT_SORTABLE` and `ALERT_SORT_FIELDS` (zod enum) in lockstep.
- **`AffectedEntityRow` extends `EntityRow` with `defillama_slug` + `admin_address`** so scalar-key alerts (`admin_tx`, `tvl_drop`) can render the matching-dependency chip without an extra fetch. The `<AffectedEntitiesTable>` collects matching members via a small `collectMatchingMembers` helper that branches on array vs scalar via the `ARRAY_FIELD_TO_COLUMN` table — keep this synchronized with `ARRAY_DEPENDENCY_FIELDS` if a new dependency_field ever appears.
- **`<SiteHeader>` is the canonical nav** for every full-page route. Phase 5's digest preview page (if it exists) should reuse it. Future routes should pass `active={'dashboard'|'alerts'|...}` and a `legSubtitle` (e.g. `"DIGEST · MVP"`).
- **KPI: `getKpiSummary` now hits two tables.** It's still one round-trip (`Promise.all`) so the dashboard cost is unchanged in p95. If you ever need to split, the queries are obviously separable.

**To start Phase 5:** open a fresh chat and read this file → DECISIONS → CHANGELOG_DEV → §7 Phase 5. Spec lives in `~/Downloads/chaindrain_export/CURSOR_PROMPT.md` "PHASE 5". Build `src/app/api/cron/digest/route.ts` (runs `0 9 * * *` daily — Vercel Hobby allows daily crons, so this *does* go in `apps/mvp/vercel.json` re-created with only the daily entry; the 5-min poll stays on GitHub Actions per DECISIONS §23). Pull last-24h alerts via `listAlerts({ windowDays: 1, sortField: 'severity', sortDirection: 'asc' })`; for each critical, fetch top-5 affected via `getAffectedEntities(field, key, { limit: 5 })`. Email body is plain HTML, no images. Subject: `Chaindrain Daily — N critical / M high alerts`. Env: `RESEND_API_KEY`, `DIGEST_RECIPIENTS` (comma-separated). Optional: an unsubscribe link is overkill for a single-tenant tool — refuse if it comes up.

**Commit using the standard env-var trick** so the hook strips the Cursor trailer:
```bash
GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat \
GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat \
git commit -m "phase 4: ..."
```

---

## 9. Vercel project routing & deploy ops

Two Vercel projects share the `wazarat/chaindrain` GitHub repo:

| Project | Vercel URL | Root Directory | Purpose |
|---|---|---|---|
| `chaindrain-mvp` | `chaindrain-mvp.vercel.app` | `apps/mvp` | **The product.** Pushes touching `apps/mvp/` (or shared workspace files) should rebuild here. |
| `chaindrain` (legacy) | `chaindrain.vercel.app` | `apps/web` | Frozen rollback parachute. Should only rebuild if someone touches `apps/web/`. |

By default Vercel rebuilds **both** projects on every push to `main`. Without an Ignored Build Step set, you get:
- Wasted Hobby build minutes on the legacy project.
- Both projects' deploy statuses flooding the GitHub commit checks (caused user confusion during the Phase 3 push).

**Fix (do once in the Vercel dashboard per project):**

For `chaindrain-mvp` → Settings → Git → Ignored Build Step → "Custom":
```bash
bash -c 'git diff HEAD^ HEAD --quiet -- apps/mvp packages pnpm-lock.yaml pnpm-workspace.yaml .npmrc supabase/migrations'
```

For `chaindrain` (legacy) → Settings → Git → Ignored Build Step → "Custom":
```bash
bash -c 'git diff HEAD^ HEAD --quiet -- apps/web'
```

**Semantics:** `git diff --quiet` exits 0 if no diff, 1 if there is one. Vercel's contract is "exit 0 = skip build, non-zero = build" — so the command above means *"if any file in the listed paths changed, build; otherwise skip."*

**Caveats:**
- `HEAD^` doesn't exist on the first commit of a branch. Vercel runs Ignored Build Step from a shallow clone with depth=2, so it works for normal pushes. For branch-create events, Vercel always builds (safe default).
- If you ever resurrect `apps/api/` or `apps/agent/` they need their own Vercel project or you'll need to add them to the mvp project's path list.
- Don't put the Ignored Build Step in `vercel.json` — it's a project-scoped setting only.

**Diagnosing future deploy weirdness** — fastest path:
```bash
# 1. Are deployments actually being attempted?
curl -sS "https://api.github.com/repos/wazarat/chaindrain/commits/<sha>/statuses" \
  | python3 -c "import json,sys; [print(s['context'], s['state'], s.get('target_url','')) for s in json.load(sys.stdin)]"

# 2. Is the new route on prod?
curl -sS -i https://chaindrain-mvp.vercel.app/api/<new-route> | head -5
```
If status shows `Vercel – chaindrain-mvp` as `failure`, follow the `target_url` (it'll be a `vercel.link/...` shortlink) to the build log. Hobby-plan plan-validation errors (like the sub-daily cron limit) surface during the build step, not at runtime.
