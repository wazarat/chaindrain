# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — **Phase 6 IN PROGRESS** (PM #11). Migration `20260601000000_exposure_graph.sql` applied to prod (4 new tables + 16 extended columns + grants), Drizzle re-introspected (366 lines, +9 tables), demo seeder helpers + fixtures + 24 predicates + AADAPT map + Layer 1 seeder code committed. **Layer 1 seeder NOT YET RUN — current row-by-row UPDATE pattern is too slow over the Supavisor pooler; needs rewrite to batched bulk UPSERTs in next chat.** All 4 new tables (`governance_fingerprint`, `reputation_signal`, `incident`, `similarity_pair`) currently EMPTY. Phase 5 still DONE ✓ on top of Phase 4 + 4.1. **Daily digest leg:** `/api/cron/digest` route (Bearer-auth via `CRON_SECRET`, mirrors `/api/cron/poll`), Vercel Cron at `0 9 * * *` via re-created `apps/mvp/vercel.json` (only entry — 5-min poll stays on GitHub Actions per DECISIONS §23), pure HTML+text renderer at `src/lib/email/digest.ts` with 11 new vitest cases covering subject format, 3-line-per-alert shape, critical top-5 expansion, XSS escaping, custom base URL, and zero-affected edge cases. Send-from defaults to `Chaindrain Alerts <onboarding@resend.dev>` (Resend free tier, no DNS); override via `RESEND_FROM`. Empty-window ticks return `{ ok: true, skipped: true, reason: "no_alerts" }` and do NOT send (manual `?force=1` bypasses). `pnpm typecheck/lint/build/test` (now **40 tests, +11 over phase 4.1**) all clean. **Phase 4 / 4.1 carried forward:** FAN OUT `/alerts` index + `/alerts/[alert_id]` contagion view + Method B similar exposure + KPI rewire + `<SiteHeader>` cross-page nav, all read-side queries cached via `unstable_cache` with `revalidateTag(CACHE_TAG_ALERTS|KPIS, "max")` invalidation from `/api/cron/poll` (DECISIONS §24, §25). **Production state (verified 2026-05-16 PM #9):** dashboard `/` 5/5 ✓ in 137-226 ms; all filter/sort URLs <250 ms; `chaindrain.alert` up to 3 real cron-fired alerts. **Branch URL `chaindrain-mvp-git-main-…vercel.app` is gated by Vercel Deployment Protection (SSO) by design — use `chaindrain.xyz` or `chaindrain-mvp.vercel.app`.** Next: tag `v0.1.0` once the user sets the Resend env vars in Vercel and the manual `curl -X POST` smoke returns a Resend `message_id` + the email lands in `waz@canhav.com`.

> **Read order for a new AI session:** this file → [DECISIONS.md](DECISIONS.md) → [CHANGELOG_DEV.md](CHANGELOG_DEV.md) (PM #11 entry first) → `~/Downloads/chaindrain_exposure_graph_scope.md` (Phase 6 spec) → the active Phase 6 plan at `~/.cursor/plans/exposure_graph_mvp_tab_10ed4956.plan.md`.

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
│       ├── src/app/api/cron/digest/route.ts             ← Phase 5 — Bearer CRON_SECRET, listAlerts(24h) → buildBuckets → Resend (skips on empty)
│       ├── src/app/alerts/page.tsx                      ← Phase 4 — alerts index, 7-day default, sortable + filterable
│       ├── src/app/alerts/[alert_id]/page.tsx           ← Phase 4 — contagion view (header + affected + similar exposure)
│       ├── src/components/{kpi-cards,filter-bar,multi-select,entities-table,entity-drawer,site-header}.tsx  ← Phase 2 UI + Phase 4 SiteHeader nav
│       ├── src/components/{alerts-filter-bar,alerts-table,alert-header,affected-entities-table,similar-exposure-panel}.tsx  ← Phase 4 UI
│       ├── src/lib/exposure/{predicates,aadapt_map}.ts        ← Phase 6 — 24 ROOT_CAUSE_PREDICATES + AADAPT tactic/technique maps
│       ├── scripts/lib/{demo_rand,demo_fixtures}.ts           ← Phase 6 — deterministic RNG + static pools / weighted distributions / 24-cause spec table
│       ├── scripts/seed_exposure_demo.ts                      ← Phase 6 — Layer 1 demo seeder (NOT YET RUN — needs batching rewrite)
│       ├── src/lib/pollers/{types,stablecoin-depeg,oracle-deviation,bridge-pause,admin-tx,tvl-drop}.ts   ← Phase 3 — 5 pure poller fns + shared types
│       ├── src/lib/pollers/*.test.ts                    ← Phase 3 — vitest unit tests (29 cases, all green)
│       ├── src/workers/poll-signals.ts                  ← Phase 3 — orchestrator; tsx-runnable via `pnpm poll`; also called from cron route
│       ├── src/lib/supabase/{server,client}.ts   ← service-role + anon clients on `chaindrain` schema
│       ├── src/lib/db/{index,queries,schema,relations}.ts + meta/   ← queries.ts is the ONLY SQL surface; routes import from it
│       ├── src/lib/email/digest.ts + digest.test.ts     ← Phase 5 — pure renderer (subject/html/text/counts) + 11 vitest cases
│       ├── src/lib/api/schemas.ts                       ← Phase 2/4 — entitiesQuerySchema + entityIdParamsSchema + alertsQuerySchema + alertIdParamsSchema (zod)
│       ├── src/lib/{utils,url-state}.ts                 ← Phase 2 — formatters / risk-tier classes / URL search-string helpers
│       ├── drizzle.config.ts   ← schemaFilter ['chaindrain'], uses DATABASE_URL_SESSION
│       ├── vitest.config.ts   ← Phase 3 — `pool: "forks"`, includes src/**/*.test.ts
│       ├── vercel.json   ← Phase 5 (re-created) — only entry is `{ path: "/api/cron/digest", schedule: "0 9 * * *" }`; 5-min poll stays on GitHub Actions
│       ├── .env.local (gitignored) + .env.local.example   ← Phase 3 added CRON_SECRET + ETHERSCAN_API_KEY; Phase 5 added RESEND_API_KEY + DIGEST_RECIPIENTS + optional RESEND_FROM + optional NEXT_PUBLIC_APP_BASE_URL
│       ├── package.json     ← @chaindrain/mvp; drizzle-orm ^0.45.2, drizzle-kit ^0.31.10, @radix-ui/react-dialog ^1.1.15, lucide-react ^0.435.0, clsx ^2.1.1, viem ^2.49.3, vitest ^4.1.6, resend ^4.0.1
│       ├── tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs
│       └── public/
├── packages/shared-types/  # legacy TS types, kept until apps/web is removed
├── supabase/migrations/
│   ├── 20250101000000_init_extensions_and_enums.sql              legacy (extensions kept)
│   ├── 20250101000100…001100 (11 more)                            legacy, all DROPped by next entry
│   ├── 20260516000000_drop_legacy_public.sql                      Phase 0 — drops legacy public.*
│   ├── 20260516000100_chaindrain_schema.sql                       Phase 0 — chaindrain.* tables + view
│   ├── 20260516000200_chaindrain_grants.sql                       Phase 0 — anon SELECT, service_role ALL
│   ├── 20260516010000_mvp_master_dedup.sql                        Phase 5.1 — chaindrain.mvp_master_dedup view (parens-suffix dedup → 772 rows)
│   ├── 20260517000000_alerts.sql                                  Phase 3 — chaindrain.alert + 2 indexes + 2 CHECK constraints + grants
│   └── 20260601000000_exposure_graph.sql                          Phase 6 — extends identity/contract_fingerprint/dependency_fingerprint with §3.1-§3.3 cols, adds governance_fingerprint + reputation_signal + incident + similarity_pair tables, 18 indexes, grants
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
| `chaindrain.alert` | 2 (live as of PM #8 first cron-fire; grows on every successful poll) | Phase 3 — alert_id pk, detected_at, signal_type (CHECK), severity (CHECK), dependency_key, dependency_field, raw_signal jsonb, fanout_count, fanout_tvl_usd. Indexes: idx_alert_detected (detected_at DESC), idx_alert_severity ((severity, detected_at DESC)). |
| `chaindrain.mvp_master_dedup` | 772 | **Canonical post-dedup universe.** View added in `20260516010000_mvp_master_dedup.sql` (Phase 5.1) — strips parens-suffix variants, groups by `(tvl_usd, risk_score, blast_radius_usd, first_word)`, keeps the row with shortest stripped name, unions array deps across the merged dupes. Every existing query in `apps/mvp/src/lib/db/queries.ts` already targets this view. |
| `chaindrain.governance_fingerprint` | **0** (Phase 6, PM #11) | New table — entity_id PK, governance_type, governance_token_address, treasury_size_usd, team_size_estimate, team_jurisdiction, incorporated_entity, is_anonymous_team, has_security_disclosure_policy, incident_response_sla_hours, data_confidence DEFAULT 'DEMO'. Awaits Layer 1 seeder run. |
| `chaindrain.reputation_signal` | **0** (Phase 6, PM #11) | New table — entity_id PK, github_repo_url, github_commit_velocity_30d, github_contributor_count, github_last_security_issue_date, twitter_handle, discord_invite, last_known_incident_date, kyt_screening_status, data_confidence DEFAULT 'DEMO'. |
| `chaindrain.incident` | **0** (Phase 6, PM #11) | The Incident Ledger — incident_id pk, victim_entity_ids uuid[] NOT NULL, event_date NOT NULL, root_cause NOT NULL (24 enum values), 16 other fields per scope §4.1, `data_confidence DEFAULT 'DEMO'`. 5 indexes (date DESC, root_cause, victims GIN, attribution, attack_layer). Awaits incident seeder. |
| `chaindrain.similarity_pair` | **0** (Phase 6, PM #11) | Top-25 dependency twins per source entity. Composite PK `(source_entity_id, target_entity_id)` + check `source <> target` + check `rank >= 1`. Method A weighted Jaccard, Method B incident-overlap, Method C SHA-256 64-dim fake-embedding cosine, ensemble = 0.3·A + 0.4·min(1,B/5) + 0.3·C. ~19,300 rows expected (772 × 25). Awaits similarity seeder. |

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

### Phase 5 — Daily digest — DONE ✓ (code shipped, 2026-05-16; first 09:00 UTC fire pending user env config in Vercel)
**The MVP's outbound signal.** Phase 5 ships the route + scheduler + renderer + 11 unit tests + env scaffold + docs.

- **Route** (`src/app/api/cron/digest/route.ts`, `runtime: nodejs`, `dynamic: force-dynamic`, `maxDuration: 60`, accepts GET + POST): 500 `cron_secret_not_configured` if `CRON_SECRET` unset; 401 `unauthorized` on missing/wrong Bearer; 500 `digest_not_configured` if `RESEND_API_KEY` or `DIGEST_RECIPIENTS` unset. Otherwise calls `listAlerts({ windowDays: 1, sortField: "severity", sortDirection: "asc", page: 1, pageSize: 200 })` (raw uncached — digest must see fresh truth), in `Promise.all` fetches `getAffectedEntities(field, key, { limit: 5 })` for every alert (per-alert try/catch so one DB error doesn't tank the whole digest), buckets by severity, renders, calls `resend.emails.send(...)`. Returns `{ ok, window_hours, counts, subject, recipients, message_id, from, elapsed_ms }`. **Empty 24h window → returns `{ ok: true, skipped: true, reason: "no_alerts" }` and does NOT send.** Manual `?force=1` query param bypasses the skip for testing. 502 `resend_send_failed` if Resend returns an error.
- **Schedule** (`apps/mvp/vercel.json`, re-created — empty since post-Phase-3 deletion): single `crons` entry `{ "path": "/api/cron/digest", "schedule": "0 9 * * *" }`. Vercel Hobby allows daily crons (the Phase 3 rejection was the `*/5` cadence). Vercel Cron automatically attaches `Authorization: Bearer ${CRON_SECRET}` when `CRON_SECRET` is a project env var — same path as the manual `curl` smoke. The 5-min DETECT cron stays on GitHub Actions per DECISIONS §23.
- **Renderer** (`src/lib/email/digest.ts`, pure / I/O-free): `renderDigestEmail({ windowHours, generatedAt, buckets, appBaseUrl? })` → `{ subject, html, text, counts }`. Subject is the spec verbatim: `Chaindrain Daily — N critical / M high alerts`. Per alert, 3-line shape (what happened / fanout / top affected). Critical alerts get an extra "Top 5 by blast radius" expansion. HTML is inline-styled, no images, no external assets, all dynamic strings HTML-escaped (see `escapeHtml`/`escapeAttr`). Per-alert link points at `${appBaseUrl}/alerts/${alert_id}` — `appBaseUrl` defaults to `https://www.chaindrain.xyz`, override via `NEXT_PUBLIC_APP_BASE_URL`.
- **Sender**: default `RESEND_FROM=Chaindrain Alerts <onboarding@resend.dev>` (Resend free-tier sender, no DNS verification required). Override to `alerts@chaindrain.xyz` once the chaindrain.xyz domain is verified in the Resend dashboard.
- **Tests** (`src/lib/email/digest.test.ts`): 11 vitest cases covering subject format (both populated + zero counts), empty-window body, 3-line shape per alert in text body, top-5 expansion for critical only, no top-5 for non-critical, HTML escaping of XSS-shaped names, custom `appBaseUrl` with trailing-slash normalization, singularization of `1 entity` vs `N entities`, and zero-affected-entities critical alert. Total suite: **40 tests (+11 over Phase 4.1's 29), all green**.
- **Env** (`apps/mvp/.env.local.example`): added `RESEND_API_KEY`, `DIGEST_RECIPIENTS`, optional `RESEND_FROM`, optional `NEXT_PUBLIC_APP_BASE_URL`. **Pending user action before v0.1.0 ship:**
  1. Generate a Resend API key at https://resend.com/api-keys.
  2. Set `RESEND_API_KEY` + `DIGEST_RECIPIENTS=waz@canhav.com` on Vercel project `chaindrain-mvp` (Production env). `RESEND_FROM` and `NEXT_PUBLIC_APP_BASE_URL` can stay unset (defaults are sensible).
  3. After redeploy, run the manual smoke:
     ```bash
     curl -sS --max-time 30 -X POST \
       -H "Authorization: Bearer $CRON_SECRET" \
       https://chaindrain-mvp.vercel.app/api/cron/digest | jq .
     ```
     Expect `{ ok: true, message_id: "<resend uuid>", counts: { critical, high, ... }, recipients: ["waz@canhav.com"], elapsed_ms }` (or `{ ok: true, skipped: true, reason: "no_alerts" }` if no alerts in the last 24h — append `?force=1` to bypass for a content smoke). Confirm email lands in `waz@canhav.com`.
  4. Verify Vercel dashboard → Settings → Cron Jobs shows the `0 9 * * *` schedule registered, with a next-run timestamp in the near future.

**Acceptance ties to the 6th MVP done-criterion ("Daily digest email sent on schedule with non-empty content").** Once all 6 are green, tag `v0.1.0` and stop building per CURSOR_PROMPT.md.

**Out of Phase 5 scope (refuse if asked):** Slack/Discord/webhook notifications (deferred), unsubscribe link (overkill for single-tenant), per-recipient personalization, Resend webhook event ingestion, charts/Recharts (spec says "stretch goal at most" — declined; not needed for plain HTML digest), Markdown-to-HTML library (3-line bodies don't need it), additional pollers (still capped at the 5 from Phase 3 per spec).

### Phase 6 — Exposure Graph (4th tab) — IN PROGRESS as of 2026-05-16 PM #11

**Spec source of truth:** `~/Downloads/chaindrain_exposure_graph_scope.md`. The referenced `chaindrain_threat_detection_roadmap.docx` is not on disk; the scope file declares itself authoritative.

**Universe:** the canonical 772 entities from `chaindrain.mvp_master_dedup` (parens-suffix dedup view added in Phase 5.1). Every Phase 6 query and seeder targets this view.

**Done in PM #11:**
- Migration `supabase/migrations/20260601000000_exposure_graph.sql` applied to prod via Supabase MCP. Adds 16 extended columns to existing tables, 4 new tables (`governance_fingerprint`, `reputation_signal`, `incident`, `similarity_pair`), 18 new indexes, and grants matching DECISIONS §14. Existing `mvp_master` and `mvp_master_dedup` views stay valid (they `SELECT` explicit columns, so adding columns to base tables doesn't invalidate them — confirmed by `mvp_master_dedup` still returning 772 post-migration).
- Drizzle re-introspect → `apps/mvp/src/lib/db/schema.ts` regenerated to 366 lines. The new Phase 6 tables AND the previously-missed `mvp_master_dedup` view both surfaced.
- `apps/mvp/scripts/lib/demo_rand.ts` — `seedFromEntityId` + `mulberry32` + `pick`/`pickN`/`weighted` + `intInRange` + `sha256Hex` + `deterministicAddress` + `deterministicTxHash` + `slugify` + `triangularDate` + `logNormalLoss`. All pure / deterministic / I/O-free.
- `apps/mvp/scripts/lib/demo_fixtures.ts` — every static pool, weighted distribution, and the `RootCause` 24-string-literal union + `ROOT_CAUSE_SPECS` table whose `count` fields sum to 356 (matches scope §4.1).
- `apps/mvp/src/lib/exposure/predicates.ts` — `ROOT_CAUSE_PREDICATES` with all 24 entries (one predicate function per root_cause, total over a typed `PredicateEntity` interface) + `matchingRootCauses(e)` runtime helper.
- `apps/mvp/src/lib/exposure/aadapt_map.ts` — `AADAPT_TACTIC_MAP` + `AADAPT_TECHNIQUE_MAP` keyed by root_cause; values prefixed `DEMO:AADAPT.…` so the UI renders the demo chip.
- `apps/mvp/scripts/seed_exposure_demo.ts` — Layer 1 seeder code. **Type-checks but NOT yet run successfully** (see "Pending" below).
- `apps/mvp/package.json` — added 4 scripts: `seed:exposure-layer1`, `seed:exposure-incidents`, `seed:exposure-similarity`, chained `seed:exposure`.

**Pending (priority for next chat):**
1. **Rewrite `seed_exposure_demo.ts` for batched bulk UPSERTs** before re-running. Current row-by-row UPDATE × 5 round-trips × 772 entities = ~3,860 round-trips over the Supavisor pooler — first run was killed at 226s. Switch to batches of ~100 with `INSERT … SELECT … FROM unnest($1::uuid[], …)` or the `sql(rows, ...cols)` builder pattern from `scripts/load_seed.mjs`. Per-column confidence gating logic (`CASE WHEN existing_confidence IN ('HIGH','MEDIUM','INFERRED') THEN existing ELSE EXCLUDED.x END`) MUST be preserved.
2. **Write + run `seed_incidents_demo.ts`** — 356 rows across 24 root_causes, victim selection conditioned on `ROOT_CAUSE_PREDICATES[rc]` (so Method B has signal). Triangular date density peaked at 2024-06. Backfill `reputation_signal.last_known_incident_date = MAX(event_date)` per victim.
3. **Write + run `seed_similarity.ts`** — Method A weighted Jaccard (10 attributes per scope §5.1), Method B vulnerability-class overlap, Method C deterministic SHA-256 64-dim fake-embedding cosine. Ensemble = `0.3·A + 0.4·min(1, B/5) + 0.3·C`. Persist top-25 per source (~19,300 rows).
4. **Query layer extensions** in `apps/mvp/src/lib/db/queries.ts` — `listExposureEntities`, `getExposureEntity`, `getThreatHistory`, `getPeerIncidents`, `getDependencyTwins`, `listIncidents`, `getIncidentById`, `getExposureKpis`. All wrapped in `unstable_cache` with new tag constants per DECISIONS §25.
5. **API routes** — `/api/exposure/twins/[entity_id]` and `/api/exposure/peers/[entity_id]`.
6. **UI primitives** — `<DemoChip />` (scope §6.4), `<DemoBanner />` (verbatim copy from scope §0), exposure panels, exposure-table, incidents-table.
7. **Pages** — `/exposure`, `/exposure/[entity_id]`, `/exposure/incidents`, `/exposure/incidents/[incident_id]`. All include `<SiteHeader active="exposure" />` + persistent demo banner.
8. **Site header** — widen `active` union to include `"exposure"` and add the Exposure Graph nav with the Hydra-Teal `Preview` pill.
9. **Methodology page** — append "Exposure Graph & Similarity Engine" section with Methods A/B/C, weights (0.3/0.4/0.3), worked example, "what is synthetic today" callout.
10. **Tests** — predicates (24), seeder determinism, Jaccard math, ensemble math.
11. **DECISIONS.md** — append §27 (universe = `mvp_master_dedup`, demo seeders confidence-gated, real data wins) + §28 (Method C deterministic SHA-256 fake-embedding upgrade path).

---

## 8. Where the chat paused (handoff to v0.1.0 tag)

**Phase 5 code shipped 2026-05-16 (commit pending in this push).** The MVP product surface is feature-complete: SCORE / DETECT / FAN OUT / DAILY DIGEST. Only the v0.1.0 ship gate remains: user sets `RESEND_API_KEY` + `DIGEST_RECIPIENTS=waz@canhav.com` in Vercel `chaindrain-mvp` Production env, redeploys, runs the manual `curl -X POST /api/cron/digest`, confirms `message_id` + email lands in `waz@canhav.com`, confirms `0 9 * * *` cron registered in Vercel dashboard → Cron Jobs. Then 6/6 done-criteria are green and `v0.1.0` ships per CURSOR_PROMPT.md.

**Phase 5 deliverables in this commit:** `apps/mvp/src/app/api/cron/digest/route.ts` (route + auth + listAlerts/getAffectedEntities + Resend), `apps/mvp/src/lib/email/digest.ts` (pure renderer), `apps/mvp/src/lib/email/digest.test.ts` (11 vitest cases), `apps/mvp/vercel.json` (re-created with only the daily cron entry), `apps/mvp/.env.local.example` (added RESEND_*), AI_CONTEXT + CHANGELOG_DEV + DECISIONS §26 updated. `pnpm typecheck/lint/build/test` (40 tests, +11 over Phase 4.1) all clean. Local smoke confirmed: no-auth → 401 unauthorized, wrong bearer → 401 unauthorized, right bearer + missing RESEND env → 500 `digest_not_configured` with explicit "RESEND_API_KEY is not set" message.

**Phase 4 / 4.1 carried forward (no changes this session):** FAN OUT `/alerts` index + `/alerts/[alert_id]` contagion view + Method B similar-exposure panel + KPI rewire + cross-page nav, all read-side queries `unstable_cache`-wrapped with `revalidateTag` invalidation from `/api/cron/poll`.

**Phase 4 end-to-end prod smoke 2026-05-16 PM #8:** pushed Phase 4 commit (`e6fbcbc`), `chaindrain-mvp` Vercel build green, user set `CRON_SECRET` to `e54a40ebde72b0115802784c9b2ea1d1a5b62881d8a64731b59ff66c6d27f00f` in both Vercel project (Production env, redeployed) and GitHub repo secrets, then manual `POST /api/cron/poll` with Bearer → `200` in 6.2s, persisting **2 real alerts** (Liquity V2 -24.55% / CEX.IO -21.03% — both DefiLlama TVL drops, high severity). Both visible on `/alerts` ("Showing 1–2 of 2 alerts (last 7 days)"); `/alerts/[liquity-v2-id]` renders the full contagion view in prod (3 affected Liquity entities + 10 Method-B similar via `oracle_providers`). Copy bug spotted + shipped same session: `affected-entities-table.tsx` `${count} entity${y/ies} depend` → `${count} entity depends | entities depend`.

**Phase 4.1 cache hotfix (PM #9, commit `444a444`):** dashboard `/` was 500-ing ~7 in 8 cold loads with the dark Next.js error page because Vercel Lambda freezes mid-result and orphans Supavisor sessions at `wait_event=ClientRead` for up to the 2-min statement_timeout. `pg_stat_activity` showed a 116s wedge on the dashboard's entities query; supporting log lines `canceling statement due to statement timeout` + `unexpected EOF on client connection with an open transaction` confirm the freeze-then-pool-starvation chain. **`postgres-js` pool tuning didn't help** — first attempt `fd54179` dropped `max: 5 → 1` and made `/api/health` start timing out at 8s+; reverted at `ed7de06`. **Real fix `444a444`** wraps every read-side query in `unstable_cache` (KPIs 30s, filter-options 1h, entities 30-60s, alerts list 30s, alert detail 5min, similar exposure 5min). Pages and the entity JSON routes import `*Cached` variants; cron, pollers, tests still call the raw functions. `/api/cron/poll` calls `revalidateTag(CACHE_TAG_ALERTS, "max")` + `revalidateTag(CACHE_TAG_KPIS, "max")` when any alert persists. **Post-deploy result:** 5/5 rapid `GET /` succeed in 137-226ms each (vs. 1/8 before); browser smoke showed full 875-entity dashboard with KPI card "Alerts (24h) 3" (count incremented from 2 via cron invalidation between deploys). All filter combinations cached separately so `/?riskTiers=critical`, `/?sectors=…`, etc. all hot-render in <250ms. See DECISIONS §25 for the `unstable_cache` vs. `'use cache'` directive decision.

**Two distinct "site doesn't load" complaints triaged in PM #9:**
- **`chaindrain-mvp-git-main-wazarats-projects.vercel.app/*`** → HTTP 401 + `_vercel_sso_nonce` cookie. **Vercel Deployment Protection on all non-production aliases.** Not a code issue. User opted to leave it on. The public production aliases (`https://www.chaindrain.xyz/`, `https://chaindrain-mvp.vercel.app/`) are NOT behind SSO and are the URLs to demo / smoke from.
- **`https://www.chaindrain.xyz/` 500-ing** → the cache hotfix above. Resolved.

**Phase 3 prod-config gaps that are now CLOSED in PM #8:**
1. ~~`CRON_SECRET` not set in Vercel `chaindrain-mvp`~~ → **DONE**. Set in Production env, redeployed. Value lives in `apps/mvp/.env.local` locally and as a GitHub repo secret remotely. (Older value `ebb216ac…0846` was a stale placeholder from a prior handoff doc; the current live value is `e54a40eb…f00f`.)
2. ~~`CRON_SECRET` not set in GitHub repo secrets~~ → **DONE**. Same value as Vercel; `cron-poll-signals` workflow uses it via `${{ secrets.CRON_SECRET }}`.
3. **First scheduled GitHub Actions cron run** — as of commit time the workflow had `total_count: 0` runs. GH-hosted scheduled crons typically lag 5–30 min on weekend load; manual `workflow_dispatch` from the GitHub UI confirms it immediately. The route side is already proven via the direct curl above, so this is just verifying the GH-runner path.

**Phase 3 gaps still open (cosmetic / nice-to-have, not blocking):**
4. **Confirm `ETHERSCAN_API_KEY` is set in Vercel Preview as well as Production.** (Production fine; preview only matters for branch deploys.)
5. **Set Ignored Build Step on both Vercel projects** so pushes touching `apps/web/` don't fire `chaindrain-mvp` builds and vice versa (see §9 below).

**Reproducing the prod cron-fire on demand:**
```bash
curl -sS --max-time 90 -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://chaindrain-mvp.vercel.app/api/cron/poll | jq .summary
```
Expect `ok: true`, `elapsed_ms ≈ 5–10s` (5 pollers via `Promise.allSettled`), per-poller `{ alerts_emitted, alerts_persisted, elapsed_ms }`, and a flat `alerts: []` array of any rows persisted on this tick. Pollers are idempotent at the SQL level (each emits a new alert row per signal observation — Phase 4 explicitly defers dedup).

**Two traps from earlier phases still relevant:**
- **pnpm store-dir** (DECISIONS §18): if `pnpm install` ever hangs with no progress for minutes, run `xattr -rd com.apple.provenance node_modules .pnpm-store && rm -rf .pnpm-store apps/*/node_modules node_modules pnpm-lock.yaml`, then re-install with `required_permissions: ["all"]`. The root `.npmrc` already pins `store-dir=~/Library/pnpm/store`.
- **React 19's `react-hooks/set-state-in-effect`** (Phase 2 design notes): use key-based remount (e.g. `<DrawerInner key={entityId} />`) or the "adjust state during render" pattern for URL-driven inputs. Phase 4's `<AlertsFilterBar>` uses URL-as-source-of-truth so it sidesteps the rule entirely — no local state for filters.

**Phase 4 design notes worth carrying forward:**
- **Method B parameterization** (DECISIONS §24): `getSimilarExposure(field, key, { similarVia?, limit })` accepts a `similarVia` discriminator that must be a different array axis than the alert's `dependency_field`. `defaultSimilarVia(field)` returns `oracle_providers` for everything except oracle alerts (which default to `stablecoin_dependencies`). The CTE pipeline (`affected → exposure → exposure_arr`) hits the GIN indexes on the array columns and stays under 200ms for any single-key alert. Reuse this seam for any future contagion-related queries.
- **Severity sort via `sql.unsafe(CASE ...)`**: postgres-js single-arg `sql(identifier)` only handles identifier quoting, not arbitrary expressions. The `severity` sort relies on a CASE expression that maps `critical → 0`, `high → 1`, etc. so `ORDER BY severity ASC` semantically means "critical first". The whitelist in `ALERT_SORTABLE` is the only injection guard — if you add a new sort field, add it to `ALERT_SORTABLE` and `ALERT_SORT_FIELDS` (zod enum) in lockstep.
- **`AffectedEntityRow` extends `EntityRow` with `defillama_slug` + `admin_address`** so scalar-key alerts (`admin_tx`, `tvl_drop`) can render the matching-dependency chip without an extra fetch. The `<AffectedEntitiesTable>` collects matching members via a small `collectMatchingMembers` helper that branches on array vs scalar via the `ARRAY_FIELD_TO_COLUMN` table — keep this synchronized with `ARRAY_DEPENDENCY_FIELDS` if a new dependency_field ever appears.
- **`<SiteHeader>` is the canonical nav** for every full-page route. Phase 5's digest preview page (if it exists) should reuse it. Future routes should pass `active={'dashboard'|'alerts'|...}` and a `legSubtitle` (e.g. `"DIGEST · MVP"`).
- **KPI: `getKpiSummary` now hits two tables.** It's still one round-trip (`Promise.all`) so the dashboard cost is unchanged in p95. If you ever need to split, the queries are obviously separable.

**To run the v0.1.0 ship gate after this push lands:**
1. In Vercel `chaindrain-mvp` → Settings → Environment Variables (Production), add `RESEND_API_KEY=re_...` and `DIGEST_RECIPIENTS=waz@canhav.com`. Optional: `RESEND_FROM=Chaindrain Alerts <alerts@chaindrain.xyz>` (only after verifying the domain in Resend dashboard); otherwise the default `onboarding@resend.dev` sender works with zero setup.
2. Redeploy `chaindrain-mvp` to pick up the new env vars.
3. Manual smoke:
   ```bash
   curl -sS --max-time 30 -X POST \
     -H "Authorization: Bearer $CRON_SECRET" \
     https://chaindrain-mvp.vercel.app/api/cron/digest | jq .
   ```
   Expect `{ ok: true, message_id: "<resend uuid>", subject: "Chaindrain Daily — ...", counts: {...}, recipients: ["waz@canhav.com"], from, elapsed_ms }` if there are alerts in the last 24h, OR `{ ok: true, skipped: true, reason: "no_alerts", counts: { total: 0, ... } }` if the window is empty (append `?force=1` to bypass for a content smoke).
4. Open `https://vercel.com/wazarats-projects/chaindrain-mvp/settings/cron-jobs` and confirm the `0 9 * * *` schedule for `/api/cron/digest` is registered with a next-run timestamp.
5. Tag `v0.1.0` after the email lands in `waz@canhav.com`:
   ```bash
   GIT_AUTHOR_EMAIL=wazarat@outlook.com GIT_AUTHOR_NAME=wazarat \
   GIT_COMMITTER_EMAIL=wazarat@outlook.com GIT_COMMITTER_NAME=wazarat \
   git tag -a v0.1.0 -m "v0.1.0 — MVP ship: SCORE / DETECT / FAN OUT / DAILY DIGEST"
   git push origin v0.1.0
   ```

**If `/api/cron/digest` returns `digest_failed` with a Resend message** (502 `resend_send_failed`), the most likely causes are: API key revoked, recipient not on the Resend allowlist when using `onboarding@resend.dev` with an unverified domain (Resend free tier only allows sending to your own verified test email from that sender — for production-grade, verify chaindrain.xyz in Resend and switch `RESEND_FROM`), or rate limit (100/day free; we're 1/day). Inspect Vercel function logs for the full Resend error object. The route preserves the original `error.message` + `error.name` in the JSON response for triage.

**If the daily cron fires but renders an empty body**, that's the spec's expected behavior when no alerts persisted in the prior 24h — the route returns `skipped: true` and does not send. To smoke a non-empty digest on demand: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://chaindrain-mvp.vercel.app/api/cron/digest?force=1"` will force a send even with zero alerts (you'll get a "No alerts in the last 24h" body to confirm formatting + DNS path).

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
