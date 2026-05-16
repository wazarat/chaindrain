# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — Phase 1 done locally (`apps/mvp` installed, Drizzle introspected, `/api/health` → `{ ok: true, count: 875 }`). Pending: Vercel project + prod smoke test.

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
│   └── mvp/        # Phase 1 — Next.js 16.2.6, installed, /api/health green locally
│       ├── src/app/{layout,page}.tsx, globals.css, favicon.ico   ← scaffold defaults
│       ├── src/app/api/health/route.ts   ← Phase 1 — Drizzle count, returns { ok: true, count }
│       ├── src/lib/supabase/{server,client}.ts   ← service-role + anon clients on `chaindrain` schema
│       ├── src/lib/db/{index,queries,schema,relations}.ts + meta/   ← Drizzle pg client + introspect output
│       ├── drizzle.config.ts   ← schemaFilter ['chaindrain'], uses DATABASE_URL_SESSION
│       ├── .env.local (gitignored) + .env.local.example
│       ├── package.json     ← @chaindrain/mvp; drizzle-orm ^0.45.2, drizzle-kit ^0.31.10 (bumped from plan's 0.36/0.30)
│       ├── tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs
│       └── public/
├── packages/shared-types/  # legacy TS types, kept until apps/web is removed
├── supabase/migrations/
│   ├── 20250101000000_init_extensions_and_enums.sql              legacy (extensions kept)
│   ├── 20250101000100…001100 (11 more)                            legacy, all DROPped by next entry
│   ├── 20260516000000_drop_legacy_public.sql                      Phase 0 — drops legacy public.*
│   ├── 20260516000100_chaindrain_schema.sql                       Phase 0 — chaindrain.* tables + view
│   └── 20260516000200_chaindrain_grants.sql                       Phase 0 — anon SELECT, service_role ALL
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
| **Vercel (legacy web)** | `chaindrain.vercel.app` | Frozen, untouched. Rollback parachute. Decommission in Phase 6. |
| **Vercel (mvp)** | TBD (`chaindrain-mvp.vercel.app`) | NOT YET CREATED. Phase 1 will need a new project, Root Directory `apps/mvp`. |
| ~~chaindrain-api.fly.dev~~ | — | **Destroyed 2026-05-16** (`flyctl apps destroy`). |
| ~~chaindrain-agent.fly.dev~~ | — | **Destroyed 2026-05-16**. |
| ~~Edge Function `cron-trigger`~~ | — | Removed from repo; Vercel Cron will replace. |

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

### Phase 1 — DONE LOCALLY ✓ (commit pending; Vercel manual step + prod smoke test outstanding)
**Steps 1–9 complete (local):**
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

**Pending (next):**
10. **Vercel project** — *manual user step*: create `chaindrain-mvp` Vercel project, Root Directory `apps/mvp`, "Include source files outside Root Directory" ON, set 4 env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DATABASE_URL_SESSION` — no `SUPABASE_SERVICE_ROLE_KEY` yet, no `NEXT_PUBLIC_API_BASE_URL`).
11. **Production smoke test** — `curl https://chaindrain-mvp.vercel.app/api/health` → `count: 875`.
12. **Commit + push** with subject `phase 1: apps/mvp deps + drizzle introspect + /api/health → 875` (commit first so Vercel has code to deploy from; prod smoke test happens after the user wires up step 10).

### Phase 2 — SCORE leg (the dashboard at `/`)
Per [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) "PHASE 2". KPI cards (4) + filter bar (sector/risk_tier/coverage_tier/oracle/chain/bridge) + sortable HTML table over `mvp_master` (50/page, default `risk_score DESC NULLS LAST`) + Radix `<Dialog>` row-click drawer. Routes: `GET /api/entities` (paginated, zod-validated), `GET /api/entities/[entity_id]`. **All SQL through `src/lib/db/queries.ts`** — no inline SQL in route handlers. Acceptance: `risk_tier=critical` → 59 rows, RealT top.

### Phase 3 — DETECT leg (5 pollers + alerts table)
New migration `20260517000000_alerts.sql` defining `chaindrain.alert(alert_id uuid pk, detected_at timestamptz, signal_type text, severity text, dependency_key text, dependency_field text, raw_signal jsonb, fanout_count int, fanout_tvl_usd numeric)` + 2 indexes. 5 pure poller fns under `src/lib/pollers/`: stablecoin-depeg (CoinGecko), oracle-deviation (Chainlink RPC + Pyth Hermes), bridge-pause (LayerZero RPC + Wormholescan + Axelar), admin-tx (Etherscan free, top 100 entities, sequential 250ms sleep), tvl-drop (DefiLlama). Orchestrator at `src/workers/poll-signals.ts` + `src/app/api/cron/poll/route.ts`. `vercel.json` cron `*/5 * * * *`. Vitest unit tests per poller. **Acceptance:** synthetic USDC=0.97 → critical alert, `fanout_count > 50`. Need `ETHERSCAN_API_KEY` (free, 5 req/s) + `CRON_SECRET` env vars.

### Phase 4 — FAN OUT leg (the differentiator)
`/alerts` index (last 7 days, sortable by severity/fanout_tvl_usd/detected_at) + `/alerts/[alert_id]` contagion view: header (signal_type/severity/dependency_key/raw_signal JSON) + affected entities table (ordered by `blast_radius_usd DESC`) + similar-exposure panel (Method B query from `mvp_scope_spec.md` §5.2). All <200ms via the GIN indexes already in place.

### Phase 5 — Daily digest
`src/app/api/cron/digest/route.ts` runs `0 9 * * *` daily via Vercel Cron. Resend SDK, plain HTML, subject `Chaindrain Daily — N critical / M high alerts`, 3 lines per alert. Env: `RESEND_API_KEY`, `DIGEST_RECIPIENTS` (comma-separated). Tag `v0.1.0` when all 6 done-criteria boxes from CURSOR_PROMPT.md are green.

---

## 8. Where the chat paused (handoff)

**Phase 1 steps 1–9 complete locally; commit + push pending; steps 10–11 (Vercel) pending user action.**

**Why the prior session's `pnpm install` stalled at >7 min:** the repo had an in-repo `.pnpm-store/v3` left over from a previous sandboxed run. That store contained `.claude/settings.local.json` files inside extracted packages (artifacts of a previous agent that wrote settings into package dirs). Those files carry the macOS `com.apple.provenance` extended attribute, which TCC uses to refuse `copyfile` operations. `pnpm install` repeatedly tries to copy packages out of the local store into `node_modules`, gets `EPERM` on every retry, and never makes progress. **Fix that's in the repo now:** root `.npmrc` pins `store-dir=~/Library/pnpm/store`, so pnpm uses the global macOS store path (`~/Library/pnpm/store/v10`) which has no provenance pollution. The bad `.pnpm-store/` directory and the dangling `apps/web/node_modules/` symlinks were both deleted as part of Phase 1. See DECISIONS §18.

**To resume:** commit + push Phase 1 (see step 12 in §7), then have the user create the `chaindrain-mvp` Vercel project (step 10), then `curl https://chaindrain-mvp.vercel.app/api/health` for prod smoke (step 11). After prod is green, move to Phase 2.

**Commit using the standard env-var trick** so the hook strips the Cursor trailer:
```bash
GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat \
GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat \
git commit -m "phase 1: ..."
```
