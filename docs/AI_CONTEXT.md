# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — **Phase 2 DONE ✓ (locally)**. SCORE leg dashboard renders; `/api/entities?riskTiers=critical` returns 59 rows with RealT (`risk_score=0.8532`) at top. `pnpm build` clean. Ready for production push + Phase 3 (DETECT leg).

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
│   └── mvp/        # Phase 1+2 — Next.js 16.2.6, dashboard renders, prod build clean
│       ├── src/app/layout.tsx, globals.css, page.tsx, favicon.ico   ← Phase 2 — server-rendered SCORE dashboard
│       ├── src/app/api/health/route.ts   ← Phase 1 — Drizzle count, returns { ok: true, count }
│       ├── src/app/api/entities/route.ts                ← Phase 2 — paginated, zod-validated query params
│       ├── src/app/api/entities/[entity_id]/route.ts    ← Phase 2 — single mvp_master row, zod-validated UUID
│       ├── src/components/{kpi-cards,filter-bar,multi-select,entities-table,entity-drawer}.tsx  ← Phase 2 UI
│       ├── src/lib/supabase/{server,client}.ts   ← service-role + anon clients on `chaindrain` schema
│       ├── src/lib/db/{index,queries,schema,relations}.ts + meta/   ← queries.ts is the ONLY SQL surface; routes import from it
│       ├── src/lib/api/schemas.ts                       ← Phase 2 — entitiesQuerySchema + entityIdParamsSchema (zod)
│       ├── src/lib/{utils,url-state}.ts                 ← Phase 2 — formatters / risk-tier classes / URL search-string helpers
│       ├── drizzle.config.ts   ← schemaFilter ['chaindrain'], uses DATABASE_URL_SESSION
│       ├── .env.local (gitignored) + .env.local.example
│       ├── package.json     ← @chaindrain/mvp; drizzle-orm ^0.45.2, drizzle-kit ^0.31.10, @radix-ui/react-dialog ^1.1.15, lucide-react ^0.435.0, clsx ^2.1.1
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
| **Vercel (legacy web)** | `chaindrain.vercel.app` | Frozen rollback parachute. Last build (post-Phase-1 push) was green. `chaindrain.xyz` custom domain may be migrated off in Phase 1 wrap (user-driven). Decommission in Phase 6. |
| **Vercel (mvp)** | `chaindrain-mvp.vercel.app` | LIVE (Phase 1 close, 2026-05-16). Root Directory `apps/mvp`, "Include source files outside Root Directory" ON. 4 env vars set (no service-role yet). `/api/health` → `{ok:true,count:875}` in 166ms. |
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

### Phase 3 — DETECT leg (5 pollers + alerts table)
New migration `20260517000000_alerts.sql` defining `chaindrain.alert(alert_id uuid pk, detected_at timestamptz, signal_type text, severity text, dependency_key text, dependency_field text, raw_signal jsonb, fanout_count int, fanout_tvl_usd numeric)` + 2 indexes. 5 pure poller fns under `src/lib/pollers/`: stablecoin-depeg (CoinGecko), oracle-deviation (Chainlink RPC + Pyth Hermes), bridge-pause (LayerZero RPC + Wormholescan + Axelar), admin-tx (Etherscan free, top 100 entities, sequential 250ms sleep), tvl-drop (DefiLlama). Orchestrator at `src/workers/poll-signals.ts` + `src/app/api/cron/poll/route.ts`. `vercel.json` cron `*/5 * * * *`. Vitest unit tests per poller. **Acceptance:** synthetic USDC=0.97 → critical alert, `fanout_count > 50`. Need `ETHERSCAN_API_KEY` (free, 5 req/s) + `CRON_SECRET` env vars.

### Phase 4 — FAN OUT leg (the differentiator)
`/alerts` index (last 7 days, sortable by severity/fanout_tvl_usd/detected_at) + `/alerts/[alert_id]` contagion view: header (signal_type/severity/dependency_key/raw_signal JSON) + affected entities table (ordered by `blast_radius_usd DESC`) + similar-exposure panel (Method B query from `mvp_scope_spec.md` §5.2). All <200ms via the GIN indexes already in place.

### Phase 5 — Daily digest
`src/app/api/cron/digest/route.ts` runs `0 9 * * *` daily via Vercel Cron. Resend SDK, plain HTML, subject `Chaindrain Daily — N critical / M high alerts`, 3 lines per alert. Env: `RESEND_API_KEY`, `DIGEST_RECIPIENTS` (comma-separated). Tag `v0.1.0` when all 6 done-criteria boxes from CURSOR_PROMPT.md are green.

---

## 8. Where the chat paused (handoff to Phase 3)

**Phase 2 fully closed locally.** Dashboard at `/` renders all 875 entities with sortable table + filter bar + KPI cards + Radix drawer. `pnpm typecheck`, `pnpm lint`, and `pnpm build` are all clean. Acceptance: `riskTiers=critical` → 59 rows, RealT top (`risk_score=0.8532`). Phase 2 commit pending push to `main`; once pushed, Vercel will auto-deploy `chaindrain-mvp.vercel.app` and a manual smoke against the live `/?riskTiers=critical` URL is the final close-out for the user.

**One trap from Phase 1 still relevant** (see DECISIONS §18): if `pnpm install` ever hangs with no progress for minutes, the cause is almost certainly that a sandboxed run wrote a fresh `.pnpm-store/v3/` in-repo, and `.claude/settings.local.json` files inside packages have the macOS `com.apple.provenance` xattr blocking `copyfile`. Recipe: `xattr -rd com.apple.provenance node_modules .pnpm-store && rm -rf .pnpm-store apps/*/node_modules node_modules pnpm-lock.yaml`, then re-install with `required_permissions: ["all"]` so pnpm can write to the global `~/Library/pnpm/store` (which the root `.npmrc` is already pinned to).

**Phase 2 design notes worth carrying forward:**
- The Drizzle introspect output flattens Postgres `text[]` columns on the `mvp_master` view to plain `text()`. Don't trust the generated view types for arrays — use raw `sql` (postgres-js) tagged templates from `src/lib/db/queries.ts`. `chain_deployments`, `oracle_providers`, `bridge_dependencies`, `stablecoin_dependencies`, and `audit_firms` all come back as JS arrays at runtime via postgres-js's native array decoding.
- React 19's new lint rule `react-hooks/set-state-in-effect` blocks naive `useEffect(() => setX(prop))` patterns. We adopted two workarounds: (a) **key-based remount** for the entity drawer — `<DrawerInner key={entityId} />` resets local state without touching effects, and (b) the **"adjust state during render"** pattern in `filter-bar.tsx` — `if (lastUrlSearch !== current.search) { setLastUrlSearch(current.search); setSearchInput(current.search); }`. Keep both patterns when adding more URL-driven inputs in Phase 3 forms.

**To start Phase 3:** open a fresh chat and read this file → DECISIONS → CHANGELOG_DEV → §7 Phase 3. Spec lives in `~/Downloads/chaindrain_export/CURSOR_PROMPT.md` "PHASE 3". First step is the `chaindrain.alert` migration + 5 pollers + `vercel.json` cron. Need a free Etherscan API key + a generated `CRON_SECRET` env var before that phase ships.

**Commit using the standard env-var trick** so the hook strips the Cursor trailer:
```bash
GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat \
GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat \
git commit -m "phase 2: ..."
```
