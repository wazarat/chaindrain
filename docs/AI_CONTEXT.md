# AI_CONTEXT — Chaindrain

**Last updated:** 2026-05-16 — Phase 0 of the MVP rebuild complete.
**Purpose:** Single source of truth for an AI assistant starting a new chat. Read this first, then `DECISIONS.md`, then `CHANGELOG_DEV.md`.

---

## 1. What Chaindrain is (post-pivot)

A **predictive threat-detection engine for crypto protocols**. Three legs:

1. **SCORE** — show 875 entities ranked by `risk_score`, filterable by tier/sector/oracle/bridge/stablecoin/chain.
2. **DETECT** — a worker that polls 5 free signal sources and writes alerts when a watched dependency degrades (oracle deviation, stablecoin depeg, bridge pause, admin-key tx, TVL drop).
3. **FAN OUT** — given an alert on dependency D, surface every entity that depends on D, ordered by `blast_radius_usd`. The actual product differentiator.

Single-tenant, IP-allowlisted on Vercel. No auth in v1.

The MVP follows the spec at [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) and [chaindrain_export/data/mvp_scope_spec.md](../../../Downloads/chaindrain_export/data/mvp_scope_spec.md).

---

## 2. Repo layout

```
chaindrain/
├── apps/
│   ├── web/          # legacy Next.js (frozen, will be removed in Phase 1 once apps/mvp is up)
│   └── mvp/          # NEW: target rebuild lives here (created in Phase 1)
├── packages/
│   └── shared-types/ # legacy TS types — kept until apps/web is removed
├── supabase/
│   └── migrations/   # 12 legacy + 3 Phase 0 migrations (drop legacy, create chaindrain.*, grants)
├── scripts/
│   ├── load_seed.mjs # Phase 0 canonical loader (875 rows × 4 tables from entities_final.json)
│   └── rls_audit.sql # legacy reference, no live use
└── docs/             # ← you are here
```

`pnpm-workspace.yaml` lists `apps/web` + `packages/*`. Will add `apps/mvp` in Phase 1.

---

## 3. Live infrastructure

| Service | Where | Notes |
|---|---|---|
| **Supabase project** | `uftbynydcmzfggltyjao.supabase.co` (us-east-1) | Postgres 17.6. `chaindrain.*` schema with 875×4 = 3,500 rows. Legacy `public.*` dropped 2026-05-16. |
| **GitHub** | `github.com/wazarat/chaindrain` | Pushed from `wazarat@outlook.com` via `GIT_AUTHOR_EMAIL` env per commit. |
| **Vercel (web, legacy)** | `chaindrain.vercel.app` | Frozen — legacy Next.js. Decommission scheduled in a Phase 6 cleanup. |
| **Vercel (mvp)** | `chaindrain-mvp.vercel.app` | TBD (Phase 1) — Root Directory `apps/mvp`, no auth, single-tenant. |
| ~~chaindrain-api.fly.dev~~ | — | **Destroyed 2026-05-16.** FastAPI dropped from new stack. |
| ~~chaindrain-agent.fly.dev~~ | — | **Destroyed 2026-05-16.** Comet/Python agent dropped from new stack. |
| ~~cron-trigger Edge Function~~ | — | Removed. Vercel Cron replaces this in Phase 3 + Phase 5. |

Supabase MCP is wired to this project; the assistant can run SQL, list migrations, get advisors, etc. directly.

---

## 4. Database state (Supabase)

`chaindrain` schema (isolated from `public.*`):

| Table | Rows | Purpose |
|---|---|---|
| `chaindrain.identity` | 875 | Entity name, sector, chains, TVL, slugs, launch date |
| `chaindrain.contract_fingerprint` | 875 | Proxy pattern, admin, audits, bug bounty, compiler |
| `chaindrain.dependency_fingerprint` | 875 | Oracle / bridge / stablecoin / DVN dependencies + confidence flags |
| `chaindrain.tier_state` | 875 | risk_score, risk_tier, coverage_tier, blast_radius_usd, state |
| `chaindrain.mvp_master` (view) | 875 | All four tables joined on `entity_id` |

GIN indexes on `chain_deployments`, `oracle_providers`, `bridge_dependencies`, `stablecoin_dependencies` for fast array filters.

`anon` and `authenticated` have `SELECT`; `service_role` has all privileges. `public.*` is empty (no user tables).

**Top 5 by risk_score** (verification spot-check):
1. RealT — 0.8532 — critical
2. Arbitrum Bridge — 0.8074 — critical
3. Binance — 0.8032 — critical
4. Binance (Validator Operations) — 0.8032 — critical
5. Binance (Binance On-Ramp) — 0.8032 — critical

(The original mvp_master.xlsx had these as a single "Binance (Wallet/DEX/Exchange)" row at 0.803; our seed preserves the JSON-source granularity.)

**Coverage tier distribution:** core 142 · monitored 24 · archive 178 · excluded 532 (one extra core vs the README's 141 because of the 7 regenerated UUIDs).

---

## 5. Pending manual user step

**Expose `chaindrain` schema in Supabase API settings.** Required only if any client wants to read via `supabase-js` over PostgREST. The MVP server-renders all data via Drizzle/postgres so this is **optional**. To enable: Supabase Dashboard → Project Settings → API → "Exposed schemas" → add `chaindrain` next to `public`.

---

## 6. Migrations (in apply order)

```
20250101000000_init_extensions_and_enums.sql       legacy — extensions only kept (vector, pg_trgm, pg_net)
20250101000100_profiles.sql                        legacy — superseded
20250101000200_sectors_companies.sql               legacy — superseded
20250101000300_events.sql                          legacy — superseded
20250101000400_watchlists_notifications.sql        legacy — superseded
20250101000500_triggers_signals.sql                legacy — superseded
20250101000600_threat_matrix.sql                   legacy — superseded
20250101000700_search.sql                          legacy — superseded
20250101000800_cron.sql                            legacy — superseded
20250101000900_rls_audit_fn.sql                    legacy — superseded
20250101001000_harden_security.sql                 legacy — superseded
20250101001100_cron_trigger_config.sql             legacy — superseded
20260516000000_drop_legacy_public.sql              Phase 0 — drop everything in public.*
20260516000100_chaindrain_schema.sql               Phase 0 — chaindrain.* tables + view + GIN indexes
20260516000200_chaindrain_grants.sql               Phase 0 — anon/authenticated SELECT, service_role ALL
```

Migrations are append-only (per `DECISIONS.md` §8). Earlier files are kept for historical accuracy even though their objects are now dropped.

---

## 7. Local dev

`apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://uftbynydcmzfggltyjao.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<legacy anon key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
DATABASE_URL=postgresql://postgres.uftbynydcmzfggltyjao:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres
DATABASE_URL_SESSION=postgresql://postgres.uftbynydcmzfggltyjao:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
```

Reload the seed (idempotent — TRUNCATEs first):
```bash
node scripts/load_seed.mjs
```

---

## 8. Where work paused

**Phase 0 closed.** Legacy decommissioned, `chaindrain.*` schema with 875 entities loaded, top-5 risk scores verified.

**Next session: Phase 1 — Bootstrap apps/mvp.**

1. `pnpm create next-app@latest mvp` inside `apps/`. Pin `next@15` stable (not RC). TypeScript + Tailwind + App Router + src dir.
2. Add deps: `@supabase/supabase-js drizzle-orm postgres zod resend` and dev deps `drizzle-kit @types/pg tsx`.
3. Add `apps/mvp` to `pnpm-workspace.yaml`.
4. Create `lib/supabase/{server,client}.ts` and `drizzle.config.ts` with `schemaFilter: ['chaindrain']`.
5. Run `pnpm dlx drizzle-kit introspect` against `DATABASE_URL_SESSION`.
6. `app/api/health/route.ts`: `select count(*) from chaindrain.identity` → `{ ok: true, count: 875 }`.
7. Create new Vercel project `chaindrain-mvp.vercel.app`, Root Directory `apps/mvp`, set 4 env vars.

See [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) "PHASE 1" for the canonical instructions.

After Phase 1 ships green, Phases 2–5 are: SCORE leg dashboard → DETECT leg pollers → FAN OUT contagion view → Daily Resend digest.

**Out of scope for v1 (do not let Cursor expand into):** auth, multi-tenant, charts beyond Recharts, Slack/Discord, LLM reasoning, alert replay, custom UI design system.
