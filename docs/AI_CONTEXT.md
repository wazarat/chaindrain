# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — Phase 1 partial (scaffold dropped in `apps/mvp`; deps NOT yet installed). Next chat picks up here.

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
│   └── mvp/        # NEW (Phase 1 in progress) — Next.js 16 scaffold dropped, deps NOT yet installed
│       ├── src/app/{layout,page}.tsx, globals.css, favicon.ico   ← scaffold defaults
│       ├── package.json     ← rewritten to @chaindrain/mvp with all needed deps listed
│       ├── tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs
│       ├── README.md, AGENTS.md, CLAUDE.md   ← scaffold defaults (safe to delete)
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

### Phase 1 — IN PROGRESS (uncommitted)
**Done:**
- `apps/mvp/` scaffolded via `pnpm dlx create-next-app@latest` with flags `--typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --no-turbopack --use-pnpm`.
- `apps/mvp/package.json` rewritten as `@chaindrain/mvp` with all target deps listed (NOT yet installed):
  - deps: `@supabase/supabase-js ^2.45.4`, `drizzle-orm ^0.36.4`, `next 16.2.6`, `postgres ^3.4.9`, `react 19.2.4`, `react-dom 19.2.4`, `resend ^4.0.1`, `zod ^3.23.8`
  - dev: `@tailwindcss/postcss ^4`, `@types/{node,react,react-dom}`, `drizzle-kit ^0.30.1`, `eslint ^9`, `eslint-config-next 16.2.6`, `tailwindcss ^4`, `tsx ^4.19.2`, `typescript ^5`
- `pnpm-workspace.yaml` updated to include `apps/mvp`.

**NOT done (next chat picks up here):**
1. **Install deps** — `pnpm install --filter @chaindrain/mvp` previously stalled (>7 min, no output). May be a network issue; try `pnpm install` (no filter) from repo root, or run unsandboxed (`required_permissions: ["all"]`).
2. **Write `apps/mvp/src/lib/supabase/server.ts`** — service-role client with `{ db: { schema: 'chaindrain' } }`. Pull `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env.
3. **Write `apps/mvp/src/lib/supabase/client.ts`** — browser anon client, same schema.
4. **Write `apps/mvp/drizzle.config.ts`** — `schemaFilter: ['chaindrain']`, output `src/lib/db/`, use `DATABASE_URL_SESSION` (port 5432, NOT 6543 — drizzle-kit needs session mode).
5. **Run `pnpm --filter @chaindrain/mvp db:introspect`** to generate `src/lib/db/schema.ts`. Sanity-check the output then commit it.
6. **Stub `apps/mvp/src/lib/db/queries.ts`** (Phase 2 fills in actual queries).
7. **Write `apps/mvp/src/app/api/health/route.ts`** — `SELECT count(*) FROM chaindrain.identity` via `postgres` client, return `{ ok: true, count: 875 }`.
8. **Write `apps/mvp/.env.local`** (gitignored) and `apps/mvp/.env.local.example` (committed). Vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (rotate before pasting), `DATABASE_URL`, `DATABASE_URL_SESSION`.
9. **Local smoke test** — `pnpm --filter @chaindrain/mvp dev`, then `curl http://localhost:3000/api/health` should return `{"ok":true,"count":875}`.
10. **Vercel project** — manual: create `chaindrain-mvp` Vercel project, Root Directory `apps/mvp`, "Include source files outside Root Directory" ON, set 4 env vars (no `NEXT_PUBLIC_API_BASE_URL` — it's gone).
11. **Production smoke test** — `curl https://chaindrain-mvp.vercel.app/api/health` → `count: 875`.
12. **Commit + push** with subject `phase 1: apps/mvp scaffolded, drizzle introspected, /api/health → 875`.

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

**Phase 1 step 1 (`pnpm install`) stalled** at >7 minutes with no output, no `node_modules` created in `apps/mvp/`. Killed the process.

**Working tree at handoff:**
```
 M pnpm-workspace.yaml
?? .cursor/                  ← editor settings, do NOT commit
?? apps/mvp/                 ← scaffold + rewritten package.json (uncommitted)
```
`scripts/`, `docs/`, supabase migrations, and the `.git/hooks/commit-msg` hook were all already pushed in Phase 0 (`fa7e795`).

**To resume:** start a fresh terminal and run `pnpm install` from the repo root with full network permissions. If it stalls again, common fixes: `pnpm store prune`, switch registries with `pnpm install --registry=https://registry.npmjs.org/`, or fall back to `npm install` inside `apps/mvp/` directly (the workspace is forgiving of a non-pnpm install in one app). Then proceed through steps 2–12 in §7 Phase 1.

**Then commit + push** Phase 1 with the standard env-var trick:
```bash
GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat \
GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat \
git commit -m "phase 1: ..."
```
The hook will auto-strip the Cursor trailer.
