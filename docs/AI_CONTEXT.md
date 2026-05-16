# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — **Phase 3 DONE ✓ (locally + initial prod deploy failed, then fixed)**. DETECT leg: `chaindrain.alert` table live; 5 pollers under `src/lib/pollers/`; `/api/cron/poll` protected by `CRON_SECRET` Bearer auth. **The 5-min cadence runs from GitHub Actions (`.github/workflows/cron-poll.yml`), NOT Vercel Cron** — Vercel Hobby plan rejects sub-daily schedules at deploy time, which broke the first Phase 3 push (`fee1948`); fix shipped in the follow-up commit (see DECISIONS §23). `pnpm typecheck/lint/build/test` (29 tests) all clean. Live E2E synthetic smoke: USDC=0.97 → critical alert, `fanout_count=70`, `fanout_tvl_usd=$39.5B` (cleaned up). Ready for Phase 4 (FAN OUT leg). Phase 2 prod also smoke-verified live: `GET /api/entities?riskTiers=critical&pageSize=1` returns `total=59`, top=RealT (0.8532) in 213ms.

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
│       ├── src/components/{kpi-cards,filter-bar,multi-select,entities-table,entity-drawer}.tsx  ← Phase 2 UI
│       ├── src/lib/pollers/{types,stablecoin-depeg,oracle-deviation,bridge-pause,admin-tx,tvl-drop}.ts   ← Phase 3 — 5 pure poller fns + shared types
│       ├── src/lib/pollers/*.test.ts                    ← Phase 3 — vitest unit tests (29 cases, all green)
│       ├── src/workers/poll-signals.ts                  ← Phase 3 — orchestrator; tsx-runnable via `pnpm poll`; also called from cron route
│       ├── src/lib/supabase/{server,client}.ts   ← service-role + anon clients on `chaindrain` schema
│       ├── src/lib/db/{index,queries,schema,relations}.ts + meta/   ← queries.ts is the ONLY SQL surface; routes import from it
│       ├── src/lib/api/schemas.ts                       ← Phase 2 — entitiesQuerySchema + entityIdParamsSchema (zod)
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

### Phase 4 — FAN OUT leg (the differentiator)
`/alerts` index (last 7 days, sortable by severity/fanout_tvl_usd/detected_at) + `/alerts/[alert_id]` contagion view: header (signal_type/severity/dependency_key/raw_signal JSON) + affected entities table (ordered by `blast_radius_usd DESC`) + similar-exposure panel (Method B query from `mvp_scope_spec.md` §5.2). All <200ms via the GIN indexes already in place.

### Phase 5 — Daily digest
`src/app/api/cron/digest/route.ts` runs `0 9 * * *` daily via Vercel Cron. Resend SDK, plain HTML, subject `Chaindrain Daily — N critical / M high alerts`, 3 lines per alert. Env: `RESEND_API_KEY`, `DIGEST_RECIPIENTS` (comma-separated). Tag `v0.1.0` when all 6 done-criteria boxes from CURSOR_PROMPT.md are green.

---

## 8. Where the chat paused (handoff to Phase 4)

**Phase 3 fully closed locally + initial deploy failed and was fixed.** Migration applied to prod Supabase, Drizzle re-introspected, 5 pollers + orchestrator + cron route + vitest tests all green. End-to-end acceptance proven via one-off live smoke (USDC=0.97 → critical alert with `fanout_count=70, fanout_tvl_usd=$39.5B`, persisted + readback + cleanup).

**Deploy fix shipped in commit after `fee1948`:** the first Phase 3 push failed because `apps/mvp/vercel.json` declared a `*/5 * * * *` cron and the Vercel project is on the **Hobby plan**, which only allows daily crons (error: "Hobby accounts are limited to daily cron jobs"). Resolution:
- Deleted `apps/mvp/vercel.json` (Phase 5's `0 9 * * *` digest will recreate it — that schedule is Hobby-compatible).
- Added `.github/workflows/cron-poll.yml` — GitHub Actions cron at `*/5 * * * *` that curls `https://chaindrain-mvp.vercel.app/api/cron/poll` with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`. Public repo = free Actions minutes. See DECISIONS §23.
- Refactored `.github/workflows/ci.yml`: dropped dead `api-lint`, `agent-lint` jobs (target dirs deleted in Phase 0) and the noisy `web-lint-typecheck` (apps/web is frozen). Added a real `mvp` job running `lint + typecheck + test` so red CI = real Phase 3 regression.

**User actions required after this commit:**
1. **Add `CRON_SECRET` to GitHub repo secrets** (Settings → Secrets and variables → Actions → New repository secret, name `CRON_SECRET`, value `ebb216acc57724d8a9c29be22d9669e5b964707b318d176530cda535dec80846`). Without it, the workflow exits 1 with `CRON_SECRET repo secret is not set`.
2. **Add `CRON_SECRET` to Vercel `chaindrain-mvp` env vars** (Production + Preview + Development) — same value. Without it, the route returns 500 `cron_secret_not_configured`.
3. **Confirm `ETHERSCAN_API_KEY` is set in Vercel Preview as well as Production** (user said Production is set).
4. **Set Ignored Build Step on both Vercel projects** so future pushes only build the affected project (see §9 below).
5. **First cron fire** will happen within ~5–15 min of the workflow being merged (GitHub Actions cron has up-to-15-min jitter). Verify via Actions tab → `cron-poll-signals` runs, plus SQL probe: `SELECT signal_type, severity, dependency_key, fanout_count, fanout_tvl_usd, detected_at FROM chaindrain.alert ORDER BY detected_at DESC LIMIT 20;`. If all pollers degrade gracefully (no alerts produced), the row count stays 0 and the route still returns 200 — normal for a quiet 5-min window.
6. Manual smoke: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://chaindrain-mvp.vercel.app/api/cron/poll` should return `{ ok: true, summary: { ... per-poller outcomes ... } }`. Or trigger the workflow from the Actions tab via `workflow_dispatch`.

**Out of scope for Phase 3 (intentionally deferred, refuse if asked):** an `/alerts` UI surface (that's Phase 4), email/Slack/Discord notifications (Phase 5), additional pollers, alert replay, LLM reasoning. Alert dedup is also deferred — if a signal stays in the bad state for an hour, the cron will emit 12 alerts. We'll revisit in Phase 4 once the UI exposes the noise.

**Two traps from earlier phases still relevant:**
- **pnpm store-dir** (DECISIONS §18): if `pnpm install` ever hangs with no progress for minutes, run `xattr -rd com.apple.provenance node_modules .pnpm-store && rm -rf .pnpm-store apps/*/node_modules node_modules pnpm-lock.yaml`, then re-install with `required_permissions: ["all"]`. The root `.npmrc` already pins `store-dir=~/Library/pnpm/store`. Hit again briefly this session — confirmed the recipe still works.
- **React 19's `react-hooks/set-state-in-effect`** (Phase 2 design notes): use key-based remount (e.g. `<DrawerInner key={entityId} />`) or the "adjust state during render" pattern for URL-driven inputs. Carry forward into Phase 4 alert detail components.

**Phase 3 design notes worth carrying forward:**
- **Pure poller pattern:** each poller exposes a *pure classifier* (e.g. `classifyStablecoinPrices`, `classifyOracleDeviations`, `classifyBridgeReadings`, `classifyAdminTx`, `classifyTvlDrops`) for unit tests, and an *I/O wrapper* (`pollX(ctx, deps)`) that wires fetch/RPC. Tests cover the classifier with synthetic inputs; the wrapper is integration-tested through the live cron. Don't add tests that mock viem — use the classifier seam.
- **Fanout abstraction:** `DependencyField` is now a union over array columns (`stablecoin_dependencies` / `oracle_providers` / `bridge_dependencies` / `chain_deployments`) AND scalar columns (`admin_address` / `defillama_slug`). The `ARRAY_DEPENDENCY_FIELDS` constant in `src/lib/pollers/types.ts` is the runtime branch — `computeFanout` uses `&&` for arrays and `=` for scalars. When Phase 4 adds the contagion view, reuse `computeFanout` (it's already the canonical query) and ride the GIN indexes that already exist on the array columns.
- **Orchestrator atomicity:** `runPollers` does *per-alert* writes (compute fanout → insertAlert), not a single transaction. If the DB drops mid-run, you get a partial alert set, not zero. This matches the spec's "persist alert + fanout numbers atomically" requirement at the row level. Don't wrap in a transaction in Phase 4 unless you have a concrete reason.
- **postgres-js jsonb writes:** explicit `JSON.stringify` + `::jsonb` cast in `insertAlert`. `sql.json(...)` from postgres-js has a strict `JSONValue` type that's incompatible with our `Record<string, unknown>` raw_signal shape. The stringify+cast path is cleaner and type-safe.

**To start Phase 4:** open a fresh chat and read this file → DECISIONS → CHANGELOG_DEV → §7 Phase 4. Spec lives in `~/Downloads/chaindrain_export/CURSOR_PROMPT.md` "PHASE 4". First step is `app/alerts/page.tsx` (7-day index, sortable by severity / fanout_tvl_usd / detected_at) + `app/alerts/[alert_id]/page.tsx` (header + affected entities table ordered by `blast_radius_usd DESC` + similar-exposure panel via the spec's Method B query). All queries through `src/lib/db/queries.ts`; reuse `computeFanout` for the affected table; add a new `getSimilarExposure(dependency_field, dependency_key, limit)` for the Method B panel.

**Commit using the standard env-var trick** so the hook strips the Cursor trailer:
```bash
GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat \
GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat \
git commit -m "phase 3: ..."
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
