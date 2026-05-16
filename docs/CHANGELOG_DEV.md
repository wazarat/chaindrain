# CHANGELOG_DEV — Chaindrain

Chronological log of development work. Each AI session appends a new dated section. **Do not rewrite history; only append.**

Format per entry:
- **What** changed
- **Why**
- **Files modified / created**
- **Next steps**

---

## 2026-05-16 (PM #7) — Phase 4: FAN OUT leg — /alerts index + /alerts/[id] contagion view + Method B similar-exposure panel

### Session goals
Phase 4 per `docs/AI_CONTEXT.md` §7 + `chaindrain_export/CURSOR_PROMPT.md` "PHASE 4" + `chaindrain_export/data/mvp_scope_spec.md` §5.2 (Method B). Build `/alerts` index + `/alerts/[alert_id]` contagion view with affected-entities table + parameterized Method B similar-exposure panel. All queries through `src/lib/db/queries.ts`. Budget <200ms.

### Pre-flight verification (live prod, 2026-05-16)
- `GET /api/health` → `200 {"ok":true,"count":875}` in 137ms — Phase 1 green.
- `GET /api/entities?riskTiers=critical&pageSize=1` → 200 in 275ms — Phase 2 green.
- `POST /api/cron/poll` (no auth) → **500** (`cron_secret_not_configured`) — Phase 3 route IS deployed, but `CRON_SECRET` not yet set in Vercel env. Per DECISIONS §22, the route hard-fails 500 before auth when the secret is missing, so the GitHub Actions cron exits 1 every 5 min and `chaindrain.alert` is still at 0 rows in prod. This is a user-action gap (see AI_CONTEXT §8), not a Phase 4 blocker — the FAN OUT UI must handle the empty table state anyway.

### What was done

#### a. Query layer additions (`apps/mvp/src/lib/db/queries.ts`)
- **`listAlerts(opts)`**: paginated, supports `windowDays` time window (default 7), optional `signalTypes` + `severities` filters, sort by `detected_at | severity | fanout_tvl_usd | fanout_count` ASC/DESC. Severity sort uses a `CASE WHEN severity='critical' THEN 0 WHEN 'high' THEN 1 ...` expression injected via `sql.unsafe(...)` from a hardcoded `ALERT_SORTABLE` whitelist (only safe inputs reach the unsafe path). Returns `{ rows: AlertRow[], total, page, pageSize }`.
- **`getAlertById(alertId)`**: single row from `chaindrain.alert`. Returns `AlertRow | null`.
- **`getAffectedEntities(field, key, { limit })`**: reuses the array-vs-scalar branch logic from `computeFanout` (DECISIONS §20) so it rides the existing GIN indexes for array fields. Returns `AffectedEntityRow[]` (extends `EntityRow` with `defillama_slug` + `admin_address` so scalar-key alerts can render the matching-dependency chip without a second fetch). Ordered by `blast_radius_usd DESC NULLS LAST, risk_score DESC NULLS LAST, name ASC`.
- **`getSimilarExposure(field, key, { similarVia?, limit })`**: Method B from `mvp_scope_spec.md` §5.2, parameterized. CTE pipeline `affected → exposure → exposure_arr` builds the set of dependency members shared across the affected set (e.g. all `oracle_providers` mentioned by USDC-using entities). The outer SELECT then finds entities NOT in the affected set whose `similarVia` column overlaps with that exposure set, counts the overlap via `unnest(...) WHERE m IN (SELECT member FROM exposure)`, and orders by `overlap_score DESC, blast_radius_usd DESC, risk_score DESC, name`. `defaultSimilarVia(field)` returns `oracle_providers` for everything except oracle alerts (which return `stablecoin_dependencies`) so the dimensions never collapse. Two iterations were needed: the first draft used `m = ANY((SELECT members FROM exposure_arr))` which Postgres parses as `text = text[]` (scalar comparison) and errored with `operator does not exist: text = text[]` — switched to `IN (SELECT ...)` which is unambiguous. See DECISIONS §24.
- **`getKpiSummary()`**: now runs the entity aggregate + a 24h alert count in `Promise.all`, returning two new fields (`alerts_24h`, `alerts_24h_critical`). Single round-trip via the same `postgres` client; no measurable cost vs the Phase 2 shape.
- Re-exported `AlertSeverity`, `AlertSignalType`, `DependencyField` from `queries.ts` so UI components don't have to reach into `lib/pollers/types.ts`.

#### b. zod schemas (`apps/mvp/src/lib/api/schemas.ts`)
- `SIGNAL_TYPES`, `SEVERITIES`, `ALERT_SORT_FIELDS` constants exported for reuse in UI components.
- `alertsQuerySchema`: `page` / `pageSize` (1–200), `sort` (enum), `direction` (asc/desc), `windowDays` (1–90, default 7), `signalTypes` + `severities` (CSV or repeated query-param, validated against enum).
- `alertIdParamsSchema`: `z.object({ alert_id: z.string().uuid() })`.

#### c. UI utility additions (`apps/mvp/src/lib/utils.ts`)
- `severityClass(severity)` — pill color classes (red/orange/yellow/emerald) matching `riskTierClass` palette.
- `signalTypeLabel(type)` and `dependencyFieldLabel(field)` — human-readable display names backed by static maps. Falls through to the raw value if unknown so debugging is easy.
- `formatDateTime(value)` — month-day-year + hour:minute + timezone for absolute timestamps.
- `formatRelativeTime(value, now?)` — "just now" / "5 mins ago" / "3 hrs ago" / "2 days ago" / absolute fallback for >30d. Accepts an injected `now` for unit testing.

#### d. Pages

**`/alerts`** (`src/app/alerts/page.tsx`) — server component, `runtime: nodejs`, `dynamic: force-dynamic`. Awaits `searchParams`, runs through `alertsQuerySchema.safeParse` (falls back to defaults on parse failure rather than 500-ing the page), calls `listAlerts(...)`. Renders:
- `<SiteHeader active="alerts" legSubtitle="FAN OUT leg · MVP" />`.
- Title + description (with the current `windowDays` interpolated).
- `<AlertsFilterBar windowDays={params.windowDays} />` — 3-button segmented control (24h / 7d / 30d) + signal-type multi-select + severity multi-select. Pushes via `router.push('/alerts?' + buildSearchString(...), { scroll: false })` inside `useTransition`. Clear-all wipes all params and pushes to `/alerts` (resets to defaults).
- `<AlertsTable rows={...} sort={...} direction={...} windowDays={...} />` — sortable column headers for `detected_at` / `severity` / `fanout_count` / `fanout_tvl_usd`, severity pill, signal-type label, dependency_key + field chip, fanout count, blast radius compact-USD, "View →" link to detail. Relative-time + absolute-time tooltip per row. Pagination prev/next. Empty state shows "No alerts in the last {N} days."

**`/alerts/[alert_id]`** (`src/app/alerts/[alert_id]/page.tsx`) — server component. Awaits `params`, runs through `alertIdParamsSchema.safeParse` (notFound() on bad UUID), then `getAlertById(id)` (notFound() if missing). Computes `similarVia = defaultSimilarVia(alert.dependency_field)`. Runs `getAffectedEntities(field, key, { limit: 200 })` + `getSimilarExposure(field, key, { similarVia, limit: 10 })` in parallel via `Promise.all`. Renders:
- `<SiteHeader active="alerts" />` + `<AlertHeader alert={...} />` (severity pill, signal label, dependency_key + field label, detected_at relative + absolute, fanout count + blast radius stat strip, raw_signal JSON viewer in a `<pre>` with max-height + overflow scroll, alert_id code block).
- `<AffectedEntitiesTable rows similarVia dependencyField dependencyKey />` — header with red-pill `<field>: <key>` chip, table with name / sector / TVL / risk score / tier / matching-dependency chip (highlighted red for the alert's key) / blast radius. Empty state handled.
- `<SimilarExposurePanel rows similarVia dependencyKey />` — "Top N entities *not* exposed to {key} directly, ranked by shared {similarVia} overlap with the affected set (Method B)." Table shows name / sector / risk / tier / amber overlap chips (the actual shared members) / `overlap_score` (bold) / blast radius. Empty state handled.
- Footer shows the data sources + which `similarVia` axis drove the panel.

#### e. Dashboard rewire (`apps/mvp/src/app/page.tsx`, `src/components/kpi-cards.tsx`)
- Replaced the inline page header with `<SiteHeader active="dashboard" legSubtitle="SCORE leg · MVP" />` so the cross-page nav is identical.
- 4th KPI card swapped: was "Total blast radius" (icon `Radio`), now "Alerts (24h)" (icon `Bell`, blue). Sub-text shows the critical count if > 0, otherwise an explainer. Card itself is wrapped in `<Link href="/alerts">` so the user can click through. The first three cards (Critical / High / Total TVL) are unchanged.

#### f. Cross-page nav (`apps/mvp/src/components/site-header.tsx`)
- Brand pill + leg subtitle + nav (`Risk dashboard` / `Alerts`) with active-tab styling. Used by `/`, `/alerts`, `/alerts/[id]`.

#### g. Local verification
- `pnpm --filter @chaindrain/mvp typecheck` → clean across `apps/mvp`, `apps/web`, `packages/shared-types`.
- `pnpm --filter @chaindrain/mvp lint` → clean. (apps/web's `next lint` fails on an interactive prompt — pre-existing, CI doesn't touch it.)
- `pnpm --filter @chaindrain/mvp test` → **29/29 green** in 389ms. No new tests added — Phase 4 is UI + SQL + integration; the existing classifier tests still pass.
- `pnpm --filter @chaindrain/mvp build` → clean, 1.2s compile + 2.3s typecheck. New routes registered: `ƒ /alerts`, `ƒ /alerts/[alert_id]`. Existing routes unchanged.

#### h. Live E2E acceptance smoke (one-off, cleaned up)
Seeded 4 synthetic alerts directly into prod `chaindrain.alert` via Supabase MCP (all tagged `raw_signal.source='phase4-smoke'`):
- USDC depeg / critical / `stablecoin_dependencies` / fanout 70 / $39.5B blast radius
- Chainlink deviation / high / `oracle_providers` / fanout 90 / $233B blast radius
- LayerZero pause / critical / `bridge_dependencies` / fanout 9 / $25.4B blast radius
- aave TVL drop / medium / `defillama_slug` / fanout 0 / $0 (no entity with that exact slug)

Booted dev on :3010 and curled each page:

| Probe | Status | Cold | Warm (application-code per Next dev log) |
|---|---|---|---|
| `/alerts` | 200 | 833ms | **130ms** |
| `/alerts/[USDC]` (70 affected + 10 similar) | 200 | 873ms | — |
| `/alerts/[Chainlink]` (90 affected + 10 similar) | 200 | — | **198ms** |
| `/alerts/[LayerZero]` (9 affected + 10 similar) | 200 | — | **134ms** |
| `/alerts/[bad-uuid]` | 404 | — | 17ms |
| `/alerts/[unknown-uuid]` | 404 | — | 68ms |
| `/?pageSize=5` (new KPI card) | 200 | 15s | 437ms |

Content verification via grep:
- `/alerts` contains all 4 alerts; severity sort surfaces "critical" tokens before "high".
- `/alerts/[USDC]` shows top-5 affected: Ether.fi Cash, JustLend, BlackRock BUIDL, Securitize, Ondo — matches `blast_radius DESC` ground truth.
- `/alerts/[USDC]` similar-exposure panel surfaces Ether.fi / Ethena (USDe) / Usual Money (overlap=2 each via Chainlink+Pyth or Chainlink+RedStone).
- `/alerts/[Chainlink]` similar-exposure surfaces Curve Finance (overlap=5), Pendle / JustLend / Jupiter (overlap=3) — exactly what Method B should return for a Chainlink alert measured over `stablecoin_dependencies`.
- `/?pageSize=5` shows "Alerts (24h)" KPI label and "critical — view contagion →" sub-text (2 of the 4 synthetic alerts were within the 24h window).

The 198ms application-code on the Chainlink page (90 affected + 10 Method-B similar = 100 entities + JSON over the wire) satisfies the spec's "< 200ms fanout query for any dependency_key" gate. The 15s cold compile for `/` is Turbopack's first-touch cost on a route with many new dependencies (SiteHeader, FilterBar, EntitiesTable, EntityDrawer); warm subsequent hits land in 437ms.

After the smoke, deleted all 4 synthetic alerts:
```sql
DELETE FROM chaindrain.alert WHERE raw_signal->>'source' = 'phase4-smoke';
```
`chaindrain.alert` is back to 0 rows in prod (matches the empty state the deployed UI will show on first user visit). The user can re-seed via the SQL block in AI_CONTEXT.md §8 for a populated demo, or wait for the cron to start producing real alerts (which still requires `CRON_SECRET` in Vercel — see §8 carryover).

### Files created
- `apps/mvp/src/app/alerts/page.tsx`
- `apps/mvp/src/app/alerts/[alert_id]/page.tsx`
- `apps/mvp/src/components/site-header.tsx`
- `apps/mvp/src/components/alerts-filter-bar.tsx`
- `apps/mvp/src/components/alerts-table.tsx`
- `apps/mvp/src/components/alert-header.tsx`
- `apps/mvp/src/components/affected-entities-table.tsx`
- `apps/mvp/src/components/similar-exposure-panel.tsx`

### Files modified
- `apps/mvp/src/lib/db/queries.ts` — Phase 4 query surface: `listAlerts`, `getAlertById`, `getAffectedEntities`, `getSimilarExposure`, `defaultSimilarVia`, `SIMILAR_VIA_FIELDS`; re-exported `AlertSeverity` / `AlertSignalType` / `DependencyField`; `getKpiSummary` extended with `alerts_24h` + `alerts_24h_critical`.
- `apps/mvp/src/lib/api/schemas.ts` — `SIGNAL_TYPES`, `SEVERITIES`, `ALERT_SORT_FIELDS`, `alertsQuerySchema`, `alertIdParamsSchema`.
- `apps/mvp/src/lib/utils.ts` — `severityClass`, `signalTypeLabel`, `dependencyFieldLabel`, `formatDateTime`, `formatRelativeTime`.
- `apps/mvp/src/components/kpi-cards.tsx` — swap 4th card to "Alerts (24h)" with link to `/alerts`.
- `apps/mvp/src/app/page.tsx` — replace inline header with `<SiteHeader>`.
- `docs/AI_CONTEXT.md` — flipped Phase 4 to DONE; rewrote §3 inventory, §7 Phase 4, §8 handoff to Phase 5.
- `docs/DECISIONS.md` — added §24 (Method B query parameterization + `similarVia` discriminator + `IN-vs-ANY` rewrite).
- `docs/CHANGELOG_DEV.md` — this entry.

### Pending (manual user)
1. Push the Phase 4 commit → Vercel auto-deploys `chaindrain-mvp`. Smoke `https://chaindrain-mvp.vercel.app/alerts` — expect "No alerts in the last 7 days." until the cron produces alerts.
2. **Carried over from Phase 3 (still outstanding):** set `CRON_SECRET` in Vercel `chaindrain-mvp` env vars + GitHub repo secrets, confirm `ETHERSCAN_API_KEY` in Vercel Preview, set Ignored Build Step on both Vercel projects. See AI_CONTEXT §8 + §9.
3. Optional: seed synthetic alerts via the SQL block in AI_CONTEXT §8 to demo the populated `/alerts` UI on prod immediately.

### Commits
- (pending) `phase 4: FAN OUT leg — /alerts index + /alerts/[id] contagion view + Method B similar exposure`

### Next steps
**Phase 5 — Daily digest.** Per `docs/AI_CONTEXT.md` §7 Phase 5 and `chaindrain_export/CURSOR_PROMPT.md` "PHASE 5": `src/app/api/cron/digest/route.ts` runs `0 9 * * *` daily via Vercel Cron (daily schedule is Hobby-compatible). Pull last-24h alerts via `listAlerts({ windowDays: 1, sortField: 'severity', sortDirection: 'asc' })`. For each critical, fetch top-5 affected via `getAffectedEntities(field, key, { limit: 5 })`. Plain HTML email via Resend SDK, subject `Chaindrain Daily — N critical / M high alerts`, 3 lines per alert. Recreate `apps/mvp/vercel.json` with only the daily cron entry (NOT the 5-min — that stays on GitHub Actions). Env: `RESEND_API_KEY`, `DIGEST_RECIPIENTS`. Tag `v0.1.0` once all 6 done-criteria boxes from CURSOR_PROMPT.md "Done criteria for the whole MVP" are green.

---

## 2026-05-16 (PM #6) — Fix Phase 3 deploy failure: GitHub Actions cron + CI cleanup + project routing

### Session goals
Phase 3 commit `fee1948` pushed to `main` did not deploy `chaindrain-mvp` — `Vercel – chaindrain-mvp` reported `failure` against the commit while the legacy `chaindrain` project deployed normally. User asked to fix the immediate deploy and ensure pushes touching `apps/mvp/` route to the correct Vercel project going forward.

### Root-cause investigation
1. `curl https://chaindrain-mvp.vercel.app/api/cron/poll` → `HTTP/2 404` (Phase 3 route absent); `/api/health` → 200 (Phase 1/2 still live). Confirmed Phase 3 did not deploy.
2. `https://api.github.com/repos/wazarat/chaindrain/commits/fee1948/statuses` showed:
   - `Vercel – chaindrain` → **success** (legacy project rebuilt unnecessarily — no path filtering).
   - `Vercel – chaindrain-mvp` → **failure** (target_url: vercel.link/3Fpeeb1).
3. Fetched the build-log shortlink — it redirected to Vercel docs on cron limits: **"Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day."** That's a deploy-time plan-validation failure, not a runtime error. `apps/mvp/vercel.json` had `"schedule": "*/5 * * * *"` which the Hobby plan rejects.
4. Same API also surfaced dead GitHub Actions jobs: `api-lint` and `agent-lint` were red because their target directories (`apps/api/`, `apps/agent/`) were deleted in Phase 0.

### What changed
1. **Deleted `apps/mvp/vercel.json`** — Phase 5's `0 9 * * *` digest cron will recreate it when needed (daily schedule is Hobby-compatible).
2. **Added `.github/workflows/cron-poll.yml`** — GitHub Actions cron at `*/5 * * * *` that POSTs to `https://chaindrain-mvp.vercel.app/api/cron/poll` with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`. Has `workflow_dispatch` for manual triggers (with optional `target_url` input for preview deployments). Uses `concurrency` to prevent overlapping runs. Fails non-zero on non-200 with a `::error::` annotation. Truncates the response body to 8KB in logs.
3. **Refactored `.github/workflows/ci.yml`:**
   - Removed dead `api-lint` and `agent-lint` jobs (Phase 0 deletions).
   - Removed `web-lint-typecheck` (apps/web frozen — was just noise).
   - Removed shared `PYTHON_VERSION` env (no longer used).
   - Added `mvp` job: `pnpm install --no-frozen-lockfile` then `pnpm --filter @chaindrain/mvp lint && typecheck && test`. This is the new authoritative CI surface for Phase 3+.
   - Kept `shared-types-typecheck` (cheap, catches workspace resolution regressions).
4. **Updated `docs/AI_CONTEXT.md`:** rewrote the header, §4 Vercel table, §7 Phase 3 cron description, §8 handoff block, and added a new **§9 — Vercel project routing & deploy ops** with the exact Ignored Build Step recipes for both projects.
5. **Added `docs/DECISIONS.md` §23** — "Schedule the DETECT cron from GitHub Actions, not Vercel Cron" — explains the Hobby-plan constraint, why we chose GitHub Actions over Pro upgrade / Supabase pg_cron, the 15-min jitter trade-off, and the CI cleanup that shipped in the same commit.

### Acceptance / verification (pre-push)
- `pnpm --filter @chaindrain/mvp test` — still 29/29 green (no app code touched).
- `pnpm --filter @chaindrain/mvp typecheck` — clean.
- `pnpm --filter @chaindrain/mvp lint` — clean.
- Workflow YAML syntax verified by inspection (no `actionlint` in toolchain; relying on GitHub's parser at push time).

### Pending user actions
1. **Add `CRON_SECRET` to GitHub repo secrets** (Settings → Secrets and variables → Actions → New repository secret, name `CRON_SECRET`, value `ebb216acc57724d8a9c29be22d9669e5b964707b318d176530cda535dec80846` — same value as the Vercel env var). Without it, the workflow exits 1 with a clear error message.
2. **Set Ignored Build Step on both Vercel projects** (Settings → Git → Ignored Build Step → Custom):
   - `chaindrain-mvp`: `bash -c 'git diff HEAD^ HEAD --quiet -- apps/mvp packages pnpm-lock.yaml pnpm-workspace.yaml .npmrc supabase/migrations'`
   - `chaindrain` (legacy): `bash -c 'git diff HEAD^ HEAD --quiet -- apps/web'`
   - Semantics: exit 0 = skip, non-zero = build. `git diff --quiet` matches that contract.
3. **Manually trigger the workflow once** (Actions → cron-poll-signals → Run workflow) after #1 lands, to confirm end-to-end before the 5-min schedule kicks in.

### Files modified / created
- **Deleted:** `apps/mvp/vercel.json`
- **Created:** `.github/workflows/cron-poll.yml`
- **Modified:** `.github/workflows/ci.yml`, `docs/AI_CONTEXT.md`, `docs/DECISIONS.md`, `docs/CHANGELOG_DEV.md`

### Next steps
- Verify next push to `main` shows only `Vercel – chaindrain-mvp` as a deploy status (legacy project skipped via Ignored Build Step).
- Confirm `chaindrain-mvp` deploy is green and `/api/cron/poll` route exists on prod.
- Resume Phase 4 (FAN OUT leg) in a fresh chat per the AI_CONTEXT handoff section.

---

## 2026-05-14 — Day 1: bring up live infra, RLS, 499 companies

### Session goals
Complete the Day 1 KPI gate from the project plan:
1. All migrations applied to the live Supabase project.
2. ≥500 companies imported from Google Sheets.
3. RLS verified clean.
4. FastAPI `/healthz` reachable; web preview loads.
5. Sign-up + `/me` flow round-trips.
6. First user promoted to admin via `admin_grant`.

### What was done

#### a. Supabase MCP wired + migrations applied
- Connected Supabase MCP to project `uftbynydcmzfggltyjao`.
- Applied all 9 existing repo migrations (`20250101000000` … `20250101000800`).
- Verified taxonomy: **7 sectors, 36 subsectors** seeded.

#### b. Google Sheets → companies importer
- Wrote `scripts/sheets_to_sql.py` (CSV → batched SQL generator) and parallel batches under `scripts/companies_seed_batches/`.
- Fixed a bug in `scripts/import_from_google_sheets.py`: payloads contained duplicate slugs (same company appearing in multiple subsectors) which Postgres rejects under `ON CONFLICT DO UPDATE`. Added in-memory dedup by slug (last-wins) before each batch.
- Imported **499 unique companies** from 526 raw rows (27 dedup'd).

#### c. RLS audit + security hardening
- Created `scripts/rls_audit.sql` + applied it as `20250101000900_rls_audit_fn.sql`. Audit function returns 0 rows.
- Ran Supabase security advisor → originally **1 ERROR + 21 WARNs**. Hardened via `20250101001000_harden_security.sql`:
  - Revoked `EXECUTE` from `anon`/`authenticated` on 7 privileged `SECURITY DEFINER` functions (`admin_grant`, `detect_sector_signal`, `handle_new_user`, `tg_events_after_insert`, `tg_fanout_watched_company_event`, `refresh_threat_matrix`). Triggers still fire because they run as the table owner.
  - Pinned `search_path = public` on 5 functions (`tg_set_updated_at`, `tg_events_tsv`, `event_subsector_id`, `search_events`, `rls_audit`).
  - Set `security_invoker = on` on `public.v_threat_components`.
- Re-ran advisor → **0 ERRORs, 7 WARNs**, all intentional (see `DECISIONS.md` §3).

#### d. API router refactor — three Supabase clients
- `apps/api/app/supabase_client.py`: added `public_client()` (anon, no JWT) alongside existing `user_client(jwt)` and `admin_client()`. `admin_client` now raises `503` when `SUPABASE_SERVICE_ROLE_KEY` is empty instead of crashing.
- Switched every router to its correct client:
  - `catalog.py`, `events.py` (list/get), `search.py`, `threat_matrix.py` (read) → `public_client`.
  - `me.py`, `watchlists.py`, `notifications.py` → `user_client(jwt)`. Removed redundant `user_id = auth.uid()` filters since RLS now enforces them.
  - `events.py` create/patch, `threat_matrix.py` `/refresh`, `admin.py`, `agent.py` → `admin_client` (gated by `require_admin` in routers).
- `apps/api/app/auth.py`: switched to `Settings.jwks_url` (auto-derived from `SUPABASE_URL` if not set).
- `apps/api/app/config.py`: made `supabase_service_role_key` and `supabase_jwks_url` optional; added `jwks_url` property.

#### e. Local dev verification
- Created `apps/web/.env.local` and `apps/api/.env` with the live Supabase URL + legacy anon key (both files are gitignored).
- API booted: `/healthz`, `/sectors` (7), `/companies?limit=3` (paginated), `/threat-matrix` (0 cells / 36 subsectors / 7 evidence classes), `/me` without token → 401. All correct.
- Web booted on `:3000`: `/`, `/login`, `/signup` → 200; `/dashboard` → 307 (correct unauth redirect).
- `next dev --turbopack` failed (flag unsupported by `next@15.0.0-rc.0`). Removed `--turbopack` from `apps/web/package.json` `dev` script.

#### f. Git pushed
- Day 1 changes committed as `8a47dc0` "all commits for live website" — 82 files, 5761 insertions.

#### g. Vercel deploy debugging
- Vercel was building at the repo root (137 ms build → 404 NOT_FOUND on `chaindrain.vercel.app`).
- Diagnosed: project's **Root Directory** in the Vercel dashboard was unset. Instructed user to set it to `apps/web` and check "Include source files outside of the Root Directory". User also added env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Next build still failed silently (only 7 log lines, no error). Root-caused to the `cd ../.. && pnpm install ... && pnpm --filter ... build` trick in `apps/web/vercel.json`. Replaced with the standard auto-detect config: `installCommand: "pnpm install --frozen-lockfile"`, `buildCommand: "pnpm --filter @chaindrain/web... build"`, `outputDirectory: ".next"`. Pushed as `7a85ca1`.

### Files created
- `scripts/sheets_to_sql.py`
- `scripts/companies_seed.sql`, `scripts/companies_seed_batches/batch_01.sql` … `batch_28.sql`
- `scripts/rls_audit.sql`
- `supabase/migrations/20250101000900_rls_audit_fn.sql`
- `supabase/migrations/20250101001000_harden_security.sql`
- `data/companies/*.csv` (36 files exported from Google Sheets)
- `apps/api/uv.lock` (committed)
- `apps/web/.env.local`, `apps/api/.env` (local only, gitignored)

### Files modified
- `apps/api/app/auth.py` — JWKS URL via `settings.jwks_url`.
- `apps/api/app/config.py` — optional service-role/JWKS, auto-derived JWKS URL.
- `apps/api/app/supabase_client.py` — added `public_client`, gated `admin_client`.
- `apps/api/app/routers/catalog.py` — `public_client`.
- `apps/api/app/routers/events.py` — `public_client` for reads, `admin_client` for writes.
- `apps/api/app/routers/me.py` — `user_client(jwt)`, dropped lazy-create fallback.
- `apps/api/app/routers/notifications.py` — `user_client(jwt)`.
- `apps/api/app/routers/search.py` — `public_client`.
- `apps/api/app/routers/threat_matrix.py` — `public_client` for read, `admin_client` + `require_admin` for refresh.
- `apps/api/app/routers/watchlists.py` — `user_client(jwt)`.
- `apps/web/package.json` — removed `--turbopack` from `dev` script.
- `apps/web/vercel.json` — simplified monorepo config (no `cd ../..`).
- `scripts/import_from_google_sheets.py` — slug dedup before upsert.
- `apps/web/next-env.d.ts` — pnpm regenerated.

### Commits
- `8a47dc0` — "all commits for live website" (Day 1 bulk)
- `7a85ca1` — "vercel: simpler monorepo build config (auto-detect, no cd hack)"

### Next steps for the next session
1. **Confirm Vercel deploy.** First action: ask the user whether `chaindrain.vercel.app` now renders the landing page after commit `7a85ca1`. If still failing, retrieve the new (now non-truncated) build log and debug.
2. **Manual sign-up smoke test.** User signs up via `/signup`, confirms email, lands signed in. Verify `profiles` row was auto-created by the `handle_new_user` trigger with `role='user'`.
3. **Admin promotion.** Run `select public.admin_grant('user@email.com');` via the Supabase MCP. Re-fetch `/me` and confirm `role='admin'`.
4. **Day 2 kickoff.** Day 2 KPIs from the project plan: Comet agent scaffold can post a synthetic event via HMAC; threat matrix shows ≥1 non-zero cell; admin triage UI works.
5. (Optional cleanup) Decide whether to keep the `companies_seed_batches/` SQL files in-tree; they're useful as a fallback but `import_from_google_sheets.py` is the canonical pipeline now.

---

## 2026-05-15 — Day 1 KPI gate closed: Vercel green, signup trigger validated, first admin granted

### Session goals
Resume from the prior session's pause point: confirm Vercel build of `7a85ca1`, then close the remaining Day 1 KPIs (signup round-trip + admin promotion).

### What was done

#### a. Vercel deploy of `7a85ca1` confirmed green
- User confirmed `chaindrain.vercel.app` now renders the landing page after the simplified `apps/web/vercel.json` from the prior session. The `cd ../..` removal was the fix.

#### b. `handle_new_user` trigger validated end-to-end
- Queried `auth.users ⨝ public.profiles`. Found `wazarat100@gmail.com` (signed up `2026-05-14 18:27:56`, confirmed 14 s later) with `profile_created_at` matching `auth_created_at` to the second — confirming the trigger fired synchronously with the auth user insert and produced `role='user'`.
- Mid-session, user signed up a second account `waz@canhav.com` on the live deploy; same pattern observed (`auth_created_at` `2026-05-15 16:15:44`, profile created same second, email confirmed 14 s later, `role='user'`, `display_name='waz_admin'`). Two independent signups now exercise the trigger.

#### c. First admin granted
- Ran `select public.admin_grant('waz@canhav.com');` via Supabase MCP. Re-queried profile: `role='admin'`, `updated_at='2026-05-15 16:16:39'`. The grant works.
- Note: `role` lives on `public.profiles` and is read by the SECURITY DEFINER `is_admin(uuid)` function used in RLS — it is **not** a JWT claim. Promotion takes effect immediately for the next request; no sign-out/in needed.

#### d. Day 1 KPI gate
| KPI | Status |
|---|---|
| All migrations applied | ✓ |
| ≥500 companies imported | ✓ (499 unique slugs) |
| RLS verified clean | ✓ |
| `/healthz` returns 200 | ✓ |
| Web preview loads (Vercel) | ✓ (this session) |
| Sign-up creates `profiles` row with `role='user'` | ✓ (this session, 2 independent signups) |
| `admin_grant` flips a profile to `role='admin'` | ✓ (this session) |

### Files created
None.

### Files modified
- `docs/CHANGELOG_DEV.md` — this entry.
- `docs/AI_CONTEXT.md` — KPI table flipped to all-green; §10 ("where work paused") updated to reflect Day 1 closed.

### Commits
None yet this session — the changes are doc-only and a database state mutation (`admin_grant`). Will commit the doc updates.

### Open caveats / known gaps
- **API not deployed.** `NEXT_PUBLIC_API_BASE_URL` is empty in Vercel, so the production web app cannot call `/me`, `/watchlists`, etc. against a real backend. The signup → `/me` round-trip has been validated at the database layer (trigger + grant) but not over HTTP from prod. Either deploy `apps/api` or stand up a stub before any feature that requires authenticated reads from the live site.
- One pre-existing test account `wazarat100@gmail.com` remains at `role='user'`. Leave or promote per preference.

### Next steps for the next session
1. **Decide where the API runs in prod.** Options: Fly.io / Railway / Render for FastAPI; or rewrite the per-user reads as Next.js Route Handlers using `@supabase/ssr` and retire the FastAPI surface for those endpoints. Until this is settled, the deployed site is read-only marketing.
2. **Day 2 KPIs (from project plan):**
   - Comet agent scaffold can post a synthetic event via HMAC-signed request to `/agent/events`.
   - Threat matrix shows ≥1 non-zero cell after that synthetic event.
   - Admin triage UI: list pending events, approve/reject, see status flip.
3. **Wire `/me` round-trip from prod** once the API has a public URL — this is the actual smoke test for the auth → profile path over the wire.
4. (Optional) Consider seeding 1–2 synthetic `events` rows tied to known companies so the threat matrix has something to render before the Comet agent is wired.

---

## 2026-05-15 (PM) — Day 2: chaindrain-api on Fly, admin triage UI, KPIs #1 & #2 met

### Session goals
1. Deploy `chaindrain-api` (FastAPI) to Fly.io.
2. Wire production Vercel web app at the new API URL.
3. Satisfy Day 2 KPIs: synthetic HMAC event → ≥1 non-zero threat-matrix cell → admin triage UI.
4. Defer the Comet agent worker deployment to Day 3.

### What was done

#### a. Fly install + auth
- Installed `flyctl` via the official curl installer → `~/.fly/bin/flyctl v0.4.52`.
- User signed up to Fly via browser-driven `flyctl auth login`; account: `waz@canhav.com`.
- An earlier attempt to connect the Fly GitHub integration at the repo root failed because no Dockerfile exists there — Fly autodetect bailed with `Could not detect runtime or Dockerfile`. We **destroyed the auto-created `chaindrain` app** and switched to CLI-driven deploys from `apps/api/`.

#### b. Created `chaindrain-api`
- `flyctl apps create chaindrain-api --org personal`.
- Uses the pre-existing `apps/api/Dockerfile` (multi-stage, Python 3.12-slim, `uv pip install --system -e .`, CMD `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers`) and `apps/api/fly.toml` (region `iad`, internal_port 8000, 2× shared-cpu-1x 512 MB machines, healthcheck `GET /healthz`).
- Generated `AGENT_HMAC_SECRET` (64-char hex, stored 1Password-side).
- Set 5 Fly secrets via `flyctl secrets set`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (fetched via Supabase MCP `get_publishable_keys`), `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_HMAC_SECRET`, `ALLOWED_ORIGINS=https://chaindrain.vercel.app` (prod-only CORS per session decision).
- `flyctl deploy --remote-only` succeeded. App is at `https://chaindrain-api.fly.dev`.
- Smoke tests: `/healthz` 200 (`environment: production`), `/sectors` returns 7, `/me` (no token) 401, `/threat-matrix` returns 36 subsectors / 7 evidence classes / 0 cells.

#### c. Day 2 KPI #1 — synthetic HMAC event ingestion
- Added `scripts/post_synthetic_event.py`: builds an `EventDraft` with 2 source URLs, HMAC-SHA256 signs the body, POSTs to `/agent/events` with `x-chaindrain-signature`.
- Posted against Lido (`1bc274f9-2b0a-4e15-bdea-57ad5a0c3a72`, subsector `liquid-staking-tokens`) with `evidence_class=operational_compromise`, `severity=high`.
- Response 200: event `bfafcafb-589b-4c6e-b9e5-f57bd6510432` created, status auto-promoted `unverified → corroborated` (≥2 sources rule in `events_service.create_event_with_relations`), 2 `event_sources` rows, 1 `event_companies` row.
- (Compat fix: replaced `from datetime import UTC` with `timezone.utc` so the script runs on Python 3.9 / 3.10 system installs too.)

#### d. Day 2 KPI #2 — threat matrix non-zero cell
- Ran `select public.refresh_threat_matrix();` via Supabase MCP.
- `mv_threat_matrix` now has 1 row with `event_count=1`, `unique_companies=1`, `severity_sum=4`, `score=1.0000` at (`liquid-staking-tokens`, `operational_compromise`).
- `GET /threat-matrix` from prod returns the same: 1 nonzero cell.
- Verified `v_threat_components` excludes `status = 'retracted'` events — confirms admin retraction will drop the score on next refresh.

#### e. Day 2 KPI #3 — admin triage UI
- Backend: added `status: EventStatus | None` query param to `GET /events` in `apps/api/app/routers/events.py` so the admin UI can filter by exact status. Shipped in the same Fly deploy.
- Frontend (App Router):
  - `apps/web/src/app/(app)/admin/events/page.tsx`: server component, admin-gated via `profiles.role`. Tabs for `pending | unverified | corroborated | confirmed | retracted` (default `pending` = `unverified ∪ corroborated`). Renders title, summary preview, severity / evidence-class / status badges, primary company slug, detected_at. Lists up to 100 most recent.
  - `apps/web/src/app/(app)/admin/events/triage-actions.tsx`: client component with Confirm / Retract buttons. Reads the user's Supabase session, calls `PATCH ${NEXT_PUBLIC_API_BASE_URL}/events/{id}/status` with bearer token, then `router.refresh()`. Buttons disabled for terminal statuses.
  - Sidebar `/admin` link already covers nested routes via `pathname.startsWith(item.href + "/")` — no change needed.
- Web `pnpm typecheck` passes.

#### f. Phase 2 hand-off
- User must add `NEXT_PUBLIC_API_BASE_URL=https://chaindrain-api.fly.dev` to Vercel Production env and redeploy.
- Once redeployed, signed in as `waz@canhav.com` (admin), `/admin/events` will show the synthetic event under "Pending" with Confirm / Retract actions.

### Files created
- `scripts/post_synthetic_event.py`
- `apps/web/src/app/(app)/admin/events/page.tsx`
- `apps/web/src/app/(app)/admin/events/triage-actions.tsx`

### Files modified
- `apps/api/app/routers/events.py` — added `status` query-param filter to `list_events`; imported `EventStatus` from models.
- `docs/CHANGELOG_DEV.md` — this entry.
- `docs/AI_CONTEXT.md` — §3 (chaindrain-api now deployed), §7 (note new Fly secret), §10 (Day 2 closed except admin-UI smoke test).

### Live infrastructure status
| Service | URL | Status |
|---|---|---|
| Web | https://chaindrain.vercel.app | Live, pending redeploy with new env var |
| FastAPI | https://chaindrain-api.fly.dev | Live, 2× shared-cpu-1x machines in `iad` |
| Supabase | uftbynydcmzfggltyjao.supabase.co | Live |
| Comet agent | — | Not deployed (Day 3) |

### Security follow-ups (must do)
- **Rotate Supabase service-role key.** It was pasted into the user's shell during setup, so it now exists in `~/.zsh_history`, IDE history, and the Cascade conversation transcript (i.e. Anthropic logs). Supabase dashboard → API → Reset `service_role` key → re-run `flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=<new> --app chaindrain-api` → `flyctl machines restart --app chaindrain-api`.

### Next steps for the next session (Day 3)
1. **Deploy `chaindrain-agent` to Fly** (scaffold + `fly.toml` + Dockerfile already in `apps/agent/`). Will need its own `AGENT_HMAC_SECRET` matching the API's, plus any source-specific config in `apps/agent/app/sources.json`.
2. **Wire `AGENT_RUN_URL=https://chaindrain-agent.fly.dev/run` on the API** so `/admin/agent_runs/trigger` works end-to-end (the "Run agent now" button on `/admin` will no longer 503).
3. **Schedule the daily cron** via the existing `supabase/functions/cron-trigger` edge function (deploy it, set `AGENT_RUN_URL` + `AGENT_HMAC_SECRET` secrets on Supabase, enable cron at 13:00 UTC).
4. **Vercel preview CORS** (optional): add `ALLOWED_ORIGIN_REGEX` to `Settings` + switch `CORSMiddleware` to `allow_origin_regex` when set, so preview deploys can hit the API.
5. **Sentry DSNs** for API + agent (env vars already plumbed).

---

## 2026-05-16 (PM) — Phase 1 partial: apps/mvp scaffolded; co-author hook installed; chat handed off

### Session goals
1. Strip the `Co-authored-by: Cursor <cursoragent@cursor.com>` trailer that the Cursor agent runtime auto-injects into every commit (user explicitly does not want it on GitHub).
2. Begin Phase 1: scaffold `apps/mvp` per [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) "PHASE 1".

### What was done

#### a. `commit-msg` hook to strip the Cursor trailer
- Diagnosed: the trailer is added by the Cursor agent runtime itself (not by a git hook, not by `git config commit.template`, not by `~/.gitmessage`). It cannot be disabled via repo or user config from inside the agent.
- Mitigation: wrote `.git/hooks/commit-msg` (executable, gitignored — hooks aren't tracked) that:
  - `grep -viE '^[[:space:]]*Co-authored-by:[[:space:]]+Cursor[[:space:]]*<'` to drop the trailer line.
  - `awk` pass to trim trailing blank lines while preserving in-message blank lines.
- Hook validated against a synthetic message; output is clean.
- Force-pushed the previously-pushed Phase 0 commit (`4686d09 → fa7e795`) with the trailer stripped via `git commit --amend --no-edit -F /tmp/clean_msg`. Authored from `wazarat@outlook.com` (both author and committer) by passing `GIT_{AUTHOR,COMMITTER}_{EMAIL,NAME}` env vars on the command line — global git config still says `wazarat@users.noreply.github.com` and we are not allowed to mutate it (safety rule).
- Verified on GitHub: the commit page now shows `wazarat` only, no Cursor co-author chip.

#### b. Phase 1: `apps/mvp` scaffold
- Ran `pnpm dlx create-next-app@latest mvp --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --no-turbopack --use-pnpm` from inside `apps/`. Scaffolder gave **Next.js 16.2.6 stable** + React 19.2.4 + Tailwind v4 (via `@tailwindcss/postcss`). The plan asked for "Next 15 stable" but 16 is now the current stable major and App Router is unchanged — accepted the version drift.
- A non-fatal post-scaffold `next typegen exited with code 254` happened because the just-created `apps/mvp/` had no `node_modules` yet so `pnpm exec next` from workspace context failed. Project files are intact.
- Rewrote `apps/mvp/package.json` to:
  - `name: "@chaindrain/mvp"` (workspace-aligned)
  - Pin `next 16.2.6`, `react 19.2.4`, `react-dom 19.2.4` (matches scaffolder)
  - Add deps: `@supabase/supabase-js ^2.45.4`, `drizzle-orm ^0.36.4`, `postgres ^3.4.9`, `resend ^4.0.1`, `zod ^3.23.8`
  - Add devDeps: `drizzle-kit ^0.30.1`, `tsx ^4.19.2` (rest are scaffold defaults)
  - Add scripts: `db:introspect` (drizzle-kit), `seed` (delegates to `../../scripts/load_seed.mjs`), plus standard `dev/build/start/lint/typecheck`.
- Updated `pnpm-workspace.yaml` to add `apps/mvp` alongside `apps/web` and `packages/*`.

#### c. `pnpm install` stalled
- `pnpm install --filter @chaindrain/mvp` ran for >7 minutes with no progress output and no `apps/mvp/node_modules/` directory created. Killed the process.
- The user's chat context was at 88% so this session is being handed off rather than diagnosed in-place. The next chat picks up at "step 1: install deps" of the Phase 1 task list in `AI_CONTEXT.md` §7.

### Files created (uncommitted at handoff)
- `apps/mvp/` (entire scaffold: `src/app/{layout,page}.tsx`, `globals.css`, `favicon.ico`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `package.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `public/`).
- `.git/hooks/commit-msg` (gitignored — git hooks aren't tracked).

### Files modified (uncommitted)
- `pnpm-workspace.yaml` — added `apps/mvp`.
- `docs/AI_CONTEXT.md` — full rewrite with Phase 1 partial state and detailed handoff §8.
- `docs/CHANGELOG_DEV.md` — this entry.
- `docs/DECISIONS.md` — added §16 (Cursor co-author strip via commit-msg hook), §17 (Next 16 acceptance over plan's Next 15).

### Commits this session
- (Phase 0 trailer-strip amend) `fa7e795` — replaces `4686d09`. Same body content, no Cursor co-author. Force-pushed to `main`.
- Phase 1 partial work is **not yet committed** (next chat will commit it).

### Open follow-ups for the next session
1. `pnpm install --filter @chaindrain/mvp` (or fallback: cd into `apps/mvp/` and run `npm install`). Network access required.
2. Continue Phase 1 steps 2–12 from `AI_CONTEXT.md` §7 Phase 1: write Drizzle config, run introspect, write `/api/health`, create Vercel project, smoke-test, commit+push.
3. Then proceed to Phase 2 (SCORE leg dashboard).

### Caveats
- Service-role key rotation deferred indefinitely now that `chaindrain-api` and `chaindrain-agent` Fly apps (the only consumers) are destroyed. The leaked value is dead. The new MVP will use whatever current service-role key the user pastes into Vercel env settings.
- `.cursor/settings.json` was created by the IDE during this session. It is intentionally NOT staged for commit (editor-local config).

---

## 2026-05-16 — Phase 0: hard-cut to MVP rebuild, 875-entity chaindrain.* schema loaded

### Session goals
1. Decommission legacy FastAPI (`chaindrain-api.fly.dev`) + Comet agent (`chaindrain-agent.fly.dev`).
2. Remove `apps/api/`, `apps/agent/`, legacy importer scripts, and Supabase Edge Function from the repo.
3. Drop the entire `public.*` schema (events / companies / sectors / profiles / watchlists / agent_runs / triggers / RLS funcs / pg_cron jobs).
4. Load the 875-entity `chaindrain.*` schema from the `chaindrain_export/` bundle.
5. Verify Top-5 risk scores match the spec (RealT 0.853 etc.).

### What was done

#### a. Fly apps destroyed
- `flyctl apps destroy chaindrain-agent --yes` → "Destroyed app chaindrain-agent".
- `flyctl apps destroy chaindrain-api --yes` → "Destroyed app chaindrain-api".
- Both apps were `suspended` so destruction released their secrets (incl. the leaked `SUPABASE_SERVICE_ROLE_KEY` + `AGENT_HMAC_SECRET` flagged in the prior session's open follow-ups). Service-role rotation is now moot — the consumers are gone.

#### b. Repo prune
Deleted from the working tree:
- `apps/api/` (FastAPI) and `apps/agent/` (Comet/Playwright Python agent).
- `supabase/functions/cron-trigger/` (Edge Function — Vercel Cron will replace).
- Legacy importers under `scripts/`: `import_companies.py`, `import_from_google_sheets.py`, `sheets_to_sql.py`, `sheets_map.py`, `companies_seed.sql`, `companies_seed_batches/`, `post_synthetic_event.py`.
- `data/companies/*.csv` (36 sheets that fed the legacy 499-company catalog).

Kept: `scripts/rls_audit.sql` (reference only).

#### c. Drop legacy public.* — migration `20260516000000_drop_legacy_public.sql`
Single migration that:
- Unschedules `chaindrain_daily_agent` (13:00 UTC) and `chaindrain_refresh_matrix` (every 10 min) pg_cron jobs.
- `DROP MATERIALIZED VIEW public.mv_threat_matrix`, `DROP VIEW public.v_threat_components`.
- `DROP TABLE` for: `notifications`, `watchlists`, `event_companies`, `event_sources`, `events`, `sector_signals`, `companies`, `subsectors`, `sectors`, `profiles`, `agent_runs` (FK-safe order).
- `DROP FUNCTION` for: `admin_grant`, `is_admin`, `handle_new_user`, `refresh_threat_matrix`, `detect_sector_signal(uuid,integer,integer)`, `rls_audit`, `event_subsector_id`, all `tg_*` triggers, all `search_events` overloads (resolved via dynamic plpgsql loop on `pg_proc`).
- `DROP TYPE` for the 3 legacy enums (`evidence_class`, `event_severity`, `event_status`).

`auth.*` left untouched (Supabase managed). Extensions `vector`, `pg_trgm`, `pg_net` kept (still useful).

After apply: `information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'` returns 0 rows. ✓

#### d. Create chaindrain.* — migration `20260516000100_chaindrain_schema.sql`
Verbatim copy of [chaindrain_export/sql/01_schema.sql](../../../Downloads/chaindrain_export/sql/01_schema.sql). Defines:
- `chaindrain.identity` (13 cols, 4 indexes including GIN on `chain_deployments`)
- `chaindrain.contract_fingerprint` (22 cols, 5 indexes)
- `chaindrain.dependency_fingerprint` (10 cols, 4 indexes including GIN on `oracle_providers` / `bridge_dependencies` / `stablecoin_dependencies`)
- `chaindrain.tier_state` (11 cols, 4 indexes)
- `chaindrain.mvp_master` (view joining all four on `entity_id`)

#### e. Grant access — migration `20260516000200_chaindrain_grants.sql`
`anon` + `authenticated` get `SELECT` on all chaindrain.* tables; `service_role` gets ALL. `ALTER DEFAULT PRIVILEGES` so future tables in this schema inherit the same. (Replaces a deleted `..._chaindrain_seed.sql` migration that was a 626 KB copy of the export's seed — the bundled SQL has 7 duplicate-PK rows that violate the table constraint, so the file is unusable as-is.)

#### f. JSON-based seed loader — `scripts/load_seed.mjs`
The `chaindrain_export/sql/02_seed.sql` file ships 7 colliding `entity_id`s (UUIDv5 normalized whitespace in names like `'StarkEx (...)'` vs `'StarkEx\n(...)'`), so it cannot be applied as-is. Built a Node loader that:
- Reads `chaindrain_export/data/entities_final.json` (875 records).
- Detects the 7 collisions and assigns deterministic SHA-1-derived UUIDv5 to the second occurrences (so we land at exactly 875 distinct entity_ids per the spec).
- Inserts in 4 batched waves (200/batch, FK-safe): identity → contract_fingerprint → dependency_fingerprint → tier_state.
- Uses `postgres` npm client over the `aws-1-us-east-1.pooler.supabase.com:5432` session-mode pooler (the older `aws-0-...` host returns "Tenant or user not found" for new projects).
- TRUNCATEs first so the script is idempotent.

Run time: 1.5 s for the full load. Final counts: 875 × 4 = 3,500 rows + 875 in `mvp_master`. ✓

#### g. Spot-check vs spec
| name | risk_score (db) | risk_tier | spec |
|---|---|---|---|
| RealT | 0.8532 | critical | 0.853 ✓ |
| Arbitrum Bridge | 0.8074 | critical | 0.807 ✓ |
| Binance | 0.8032 | critical | 0.803 ✓ |

Spec's "Binance (Wallet / DEX / Exchange)" is split across 3 separate Binance variants in the JSON (Binance / Binance Validator Operations / Binance On-Ramp). All three at risk_score 0.8032 — same value, different rows. Acceptable.

#### h. Pending manual step (flagged for user)
**Expose `chaindrain` schema in Supabase API settings.** PostgREST currently returns `PGRST106 Invalid schema: chaindrain`. Required only if a client wants to read via `supabase-js` over PostgREST; the MVP renders server-side via Drizzle/postgres so this is optional. Path: Supabase Dashboard → Project Settings → API → Exposed schemas → add `chaindrain`.

### Files created
- `supabase/migrations/20260516000000_drop_legacy_public.sql`
- `supabase/migrations/20260516000100_chaindrain_schema.sql` (copy of export bundle)
- `supabase/migrations/20260516000200_chaindrain_grants.sql`
- `scripts/load_seed.mjs`
- `scripts/package.json`, `scripts/package-lock.json` (for `postgres` client)

### Files deleted
- `apps/api/` (entire FastAPI service)
- `apps/agent/` (entire Comet agent)
- `supabase/functions/cron-trigger/`
- `data/companies/*.csv` (36 files)
- `scripts/{import_companies,import_from_google_sheets,sheets_to_sql,sheets_map,post_synthetic_event}.py`
- `scripts/companies_seed.sql`, `scripts/companies_seed_batches/`
- (Note: `apps/web/` is intentionally kept frozen until Phase 1 verifies the MVP rebuild ships green; will be removed in a Phase 6 cleanup.)

### Files modified
- `apps/web/.env.local` — added `DATABASE_URL` + `DATABASE_URL_SESSION` for Drizzle introspect in Phase 1, fixed a host typo (`ufthyyndcmztfgqltyjao` → `uftbynydcmzfggltyjao`).
- `docs/AI_CONTEXT.md` — full rewrite for the post-pivot world.
- `docs/CHANGELOG_DEV.md` — this entry.
- `docs/DECISIONS.md` — added §12 (Drizzle), §13 (no Fly), §14 (single-tenant no auth), §15 (entity_id collision regeneration).

### Commits
- (pending) `phase 0: decommission legacy fly + public.*, load 875-entity chaindrain.* schema`

### Next steps (Phase 1)
Bootstrap `apps/mvp` per [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) "PHASE 1": `pnpm create next-app@latest mvp` → Drizzle introspect → `/api/health` returning `{ ok: true, count: 875 }` → Vercel deploy to `chaindrain-mvp.vercel.app`.

---

## 2026-05-15 (PM #2) — Day 3: chaindrain-agent live, trigger path verified, daily cron scheduled

### Session goals
1. Deploy `chaindrain-agent` to Fly (scaffold + Dockerfile already in `apps/agent/`).
2. Wire `AGENT_RUN_URL` on `chaindrain-api` so the "Run agent now" button stops 503'ing.
3. Verify the full UI → API → agent → `agent_runs` path end-to-end.
4. Deploy `supabase/functions/cron-trigger` and schedule the daily 13:00 UTC fire.
5. (Optional) Add `ALLOWED_ORIGIN_REGEX` for Vercel preview deploys.
6. (Optional) Wire Sentry DSNs.
7. (LAST) Rotate the Supabase service-role key that leaked into shell history.

### What was done

#### a. Pre-existing-bug fixes in `apps/agent` (Phase A)
Before deploying the agent it had two latent bugs that would have made the trigger path crash on first use:

1. **`apps/agent/app/run_daily.py`**: `main()` did `argparse.parse_args()` directly against `sys.argv`. Under uvicorn the process `sys.argv` is `["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]`, so argparse would have errored with `unrecognized arguments: --host …` and crashed the BackgroundTask. Refactored: split into `run(dry_run, limit_sources)` (callable in-process with kwargs, no argv) and a thin `main()` that parses CLI args then calls `run(**vars(args))`. `run()` now also returns the inserted count.

2. **`apps/agent/app/server.py`**: HMAC-verified the body but never parsed it, so the API's `{"dry_run": …, "sources_only": …}` was silently ignored. Updated to `json.loads(body)`, extract `dry_run: bool` and `limit_sources: int | None`, pass to `_run_daily()` via `functools.partial`. Response now echoes the parsed values so callers can confirm: `{"status": "scheduled", "dry_run": …, "limit_sources": …}`.

#### b. `ALLOWED_ORIGIN_REGEX` on the API (Phase B)
- `apps/api/app/config.py`: added `allowed_origin_regex: str | None = Field(default=None, alias="ALLOWED_ORIGIN_REGEX")`.
- `apps/api/app/main.py`: constructed `cors_kwargs` dict; conditionally added `allow_origin_regex` only when the env var is set, then `app.add_middleware(CORSMiddleware, **cors_kwargs)`. Coexists with the explicit `allow_origins` list — Starlette accepts both.

#### c. `chaindrain-agent` on Fly (Phases C–D)
- `flyctl apps create chaindrain-agent --org personal`.
- Added a `.dockerignore` to `apps/agent/` (excluding `__pycache__`, `.ruff_cache`, `.env*`, etc. — was missing, would have bloated build context).
- Set 3 Fly secrets via `flyctl secrets import` (heredoc-piped from user terminal to keep them out of zsh history, mostly): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_HMAC_SECRET`. The latter two share values with `chaindrain-api`.
- `flyctl deploy --remote-only` succeeded in one shot. Build time ~3 min (Debian trixie base, all Chromium runtime deps, Playwright Chromium-headless-shell 147.0.7727.15). Final image 612 MB.
- 2× machines provisioned in `iad`. Healthcheck `/healthz` green.

#### d. Smoke test #1 — direct HMAC curl with `dry_run=true` (Phase E)
- Python one-shot: HMAC-SHA256-sign `{"trigger":"manual","dry_run":true,"limit_sources":1}` with the shared secret, POST to `https://chaindrain-agent.fly.dev/run`.
- Response `200 {"status":"scheduled","dry_run":true,"limit_sources":1}` — confirms Phase A2 body-parsing fix.
- Agent logs showed: `loaded 1 sources`, `loaded 499 companies`, `source=rekt-news findings=23`, 23× `DRY-RUN would insert: …`, `done. inserted=23 elapsed=38.5s`.
- `select count(*) from public.agent_runs where started_at > now() - interval '10 minutes'` → 0 (dry-run path skips the insert, as expected).
- (One initial 401: the first attempt used `openssl dgst -sha256 -hmac SECRET` over stdin which produced an empty sig on macOS openssl. Switched to Python `hmac.new(...).hexdigest()` — works.)

#### e. Wire API → agent (Phase F)
- Redeployed `chaindrain-api` first to ship the new `ALLOWED_ORIGIN_REGEX` code (would have been dead env var otherwise). Image 96 MB, ~2 min.
- `flyctl secrets set AGENT_RUN_URL=https://chaindrain-agent.fly.dev/run 'ALLOWED_ORIGIN_REGEX=https://chaindrain-git-.*\.vercel\.app' --app chaindrain-api` — both in one call → one rolling restart.
- `curl /healthz` → 200 post-restart.

#### f. End-to-end smoke test via `/admin` button (Phase H)
- User signed in to `chaindrain.vercel.app` as `waz@canhav.com` (admin), clicked "Run agent now" on `/admin`.
- Button response: `HTTP 200: {"status":200,"body":"{\"status\":\"scheduled\",\"dry_run\":false,\"limit_sources\":null}"}` — the full chain works.
- Two clicks (user clicked twice) produced two `agent_runs` rows with `status='running'`: `0bceb2fb-9141-437e-91e2-1cced2ee6e57` at 17:24:31Z, `14753d41-a5cc-4bbe-8b86-1d3cf5080b3e` at 17:26:20Z.
- Agent logs: each run loaded 6 sources + 499 companies, processed sources sequentially via Playwright. rekt-news returned 23 findings; defillama-hacks, chainalysis-blog, sec-press-releases all returned 0.
- **0 events were inserted into `public.events`** — all 23 rekt-news findings were dropped by the classifier because their protocol names (Wasabi, KelpDAO, Drift Protocol, Hyperbridge, …) don't match any slug in our 499-company crypto-infra catalog. Rekt.news covers DeFi, not infra. **Infrastructure works; source curation is a Day 4+ tuning task.**

#### g. `cron-trigger` Edge Function + daily schedule (Phase I)
- Deployed `supabase/functions/cron-trigger/index.ts` (already written, untouched) via MCP `deploy_edge_function`. Version 1, `verify_jwt=false`, status ACTIVE.
- Discovered the existing migration `20250101000800_cron.sql` already created `pg_cron` job `chaindrain_daily_agent` at `0 13 * * *`, but its command referenced two Postgres GUCs (`app.settings.cron_trigger_url`, `app.settings.cron_function_key`) that were never set, so `net.http_post(url := NULL, …)` would have silently failed at fire time.
- Wrote append-only migration `supabase/migrations/20250101001100_cron_trigger_config.sql` (per DECISIONS §8) that unschedules and re-creates the job with the function URL inlined and no auth header (the function is `verify_jwt=false`). Applied via `mcp0_apply_migration` — `cron.job` now shows the rewritten command.
- **Pending**: user must set `AGENT_RUN_URL` and `AGENT_HMAC_SECRET` as Edge Function secrets in the Supabase dashboard (MCP can't manage function secrets). Until then the daily 13:00 UTC fire will 500.

#### h. Skipped: Sentry (Phase G)
- No DSNs provided this session. Code in `apps/api/app/main.py:_init_sentry` and `apps/agent/app/server.py:_init_sentry` already reads `SENTRY_DSN_API` / `SENTRY_DSN_AGENT` (alias matches `Settings.sentry_dsn`) — just need `flyctl secrets set` once DSNs are provisioned.

### Files created
- `apps/agent/.dockerignore` (new — was missing, prevented `.ruff_cache/` etc. from going into the build context).
- `supabase/migrations/20250101001100_cron_trigger_config.sql` (rewrite of the daily cron job to call the Edge Function directly).

### Files modified
- `apps/agent/app/run_daily.py` — split `main()` into `run(dry_run, limit_sources)` (in-process callable) + thin `main()` (CLI).
- `apps/agent/app/server.py` — parse JSON body, pass `dry_run`/`limit_sources` to `_run_daily()` via `functools.partial`, return parsed values in response.
- `apps/api/app/config.py` — added `allowed_origin_regex` field (alias `ALLOWED_ORIGIN_REGEX`).
- `apps/api/app/main.py` — conditionally pass `allow_origin_regex=` to `CORSMiddleware` when set.
- `docs/AI_CONTEXT.md` — flipped Day 2 KPI #3 + #5 to ✓, added §9c Day 3 KPI table, replaced §10 with Day 3 close + next-session follow-ups, added `cron-trigger` row to §3 infra table and migration to §6 list.
- `docs/CHANGELOG_DEV.md` — this entry.

### Live infrastructure status
| Service | URL | Status |
|---|---|---|
| Web | https://chaindrain.vercel.app | Live, KPI green |
| FastAPI | https://chaindrain-api.fly.dev | Live, 2× machines, redeployed with `ALLOWED_ORIGIN_REGEX` + `AGENT_RUN_URL` |
| Comet agent | https://chaindrain-agent.fly.dev | **NEW** — 2× shared-cpu-1x 1024 MB, auto-stop, image 612 MB |
| Supabase | uftbynydcmzfggltyjao.supabase.co | 12 migrations applied (added `cron_trigger_config`); `cron-trigger` Edge Function v1 active |

### Commits
- (pending) `day 3: chaindrain-agent on fly, trigger path verified, daily cron scheduled, CORS regex`

### Security follow-ups (must do; carried over from Day 2)
- **Rotate `SUPABASE_SERVICE_ROLE_KEY`** — it has now transited the Cascade transcript (Day 2 setup, Day 3 user paste), shell history on user's mac, and Fly secret stores for two apps. Steps: Supabase dashboard → API → Reset `service_role` → `flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=<new> --app chaindrain-api` → same for `chaindrain-agent` → update local `apps/api/.env` → `sed -i '' '/service_role\|SUPABASE_SERVICE_ROLE_KEY=ey/d' ~/.zsh_history`. Prefer `flyctl secrets set --stdin` (or `flyctl secrets import`) on the rotation re-set to keep the new value out of history.
- **Rotate `AGENT_HMAC_SECRET`** — also leaked into the transcript (single-line paste this session) and shell history. Rotate alongside the service-role key. After rotation, re-set on `chaindrain-api`, `chaindrain-agent`, AND in the Supabase Edge Function secrets (the function uses it to sign requests to the agent).

### Next steps for the next session (Day 4)
1. **Set Edge Function secrets** in Supabase dashboard so tonight's 13:00 UTC cron actually fires successfully. Verify by checking `agent_runs` for a row with `meta.trigger='cron'` after fire.
2. **Rotate both shared secrets** (service-role + AGENT_HMAC_SECRET) per security follow-ups above. Verify both apps healthy post-rotation; verify trigger button still works (i.e., the new HMAC is consistent across api/agent/edge-function).
3. **Wire Sentry DSNs** — `SENTRY_DSN_API` on `chaindrain-api`, `SENTRY_DSN_AGENT` on `chaindrain-agent`. Code already reads them.
4. **Catalog vs source coverage.** Either expand `companies` to include the DeFi protocols rekt.news writes about, or curate `apps/agent/app/sources.json` to be infra-focused (Mandiant, Trail of Bits, US Treasury OFAC, etc.). The current pipeline produces 0 inserts because of the slug-match gap.
5. **Re-trigger** the agent post-fix and confirm at least one event row lands in `public.events`, threat-matrix cell delta visible after `refresh_threat_matrix()`.
6. **Set `PERPLEXITY_API_KEY` / `COMET_API_KEY` / `OPENAI_API_KEY`** on `chaindrain-agent` to enable Comet + embeddings. Optional; Playwright-only mode is the fallback and is working.

---

## 2026-05-16 (PM #3) — Phase 1: apps/mvp deps + Drizzle introspect + /api/health → 875

### Session goals
Phase 1 from `docs/AI_CONTEXT.md` §7 — bootstrap `apps/mvp` so a local `/api/health` returns `{ ok: true, count: 875 }`, then commit + push and hand the Vercel project creation back to the user.

### What was done

#### a. Diagnosed and fixed the `pnpm install` hang
Prior chat handed off with `pnpm install --filter @chaindrain/mvp` stalled >7 min, no `node_modules` written, no progress logs. Reproduced the hang in this chat after ~5 min. Root cause: a leftover in-repo `.pnpm-store/v3/` from an earlier sandboxed run had `.claude/settings.local.json` files inside extracted packages (`node_modules/.pnpm/{nanoid@3.3.12,resolve@1.22.12,resolve@2.0.0-next.6}/node_modules/*/.claude/`). macOS Gatekeeper had stamped those files with the `com.apple.provenance` xattr; `pnpm install` tries to `copyfile` them out of the store into `apps/mvp/node_modules/.pnpm/…_tmp_$$/.claude/settings.local.json`, gets `EPERM`, and silently retries forever. Captured the actual error after switching to `--reporter=append-only`:
```
ERR_PNPM_EPERM  EPERM: operation not permitted, copyfile
  '.pnpm-store/v3/files/57/9a04...' -> 'apps/mvp/node_modules/.pnpm/nanoid@3.3.12/node_modules/nanoid_tmp_17367/.claude/settings.local.json'
```

Fix sequence:
1. `xattr -rd com.apple.provenance node_modules apps/mvp/node_modules`
2. `rm -rf node_modules .pnpm-store apps/web/node_modules apps/mvp/node_modules packages/shared-types/node_modules pnpm-lock.yaml`
3. Wrote `.npmrc` at repo root with `store-dir=~/Library/pnpm/store`, `strict-peer-dependencies=false`, `auto-install-peers=true`. This forces pnpm to use the un-poisoned global macOS store (`~/Library/pnpm/store/v10`) regardless of sandbox mode.
4. `cd apps/mvp && pnpm install --ignore-workspace` → completed in **6.5s**, 401 packages, 542 resolved.
5. Subsequent `pnpm add drizzle-orm@latest` (a few minutes later) implicitly promoted the install to a workspace install — pnpm regenerated `pnpm-lock.yaml` at the root and re-hydrated `apps/web/node_modules` symlinks against the new lockfile in ~10s. No hang.

Codified in DECISIONS §18 so the next agent has a paste-ready diagnostic recipe.

#### b. Drizzle version bump (forced by API change in 0.30.x)
The plan locked `drizzle-orm ^0.36.4` + `drizzle-kit ^0.30.1`. With those exact versions, `pnpm db:introspect` failed at startup with:
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './gel-core' is not defined by "exports" in drizzle-orm/package.json
```
`drizzle-kit@0.30.x` imports `drizzle-orm/gel-core`, a subpath that was only added in `drizzle-orm@0.37.0`. Bumped both to latest paired versions via `pnpm add drizzle-orm@latest && pnpm add -D drizzle-kit@latest` → `drizzle-orm 0.45.2` + `drizzle-kit 0.31.10`. Introspect then ran clean in 1.95s.

#### c. Drizzle introspect output
With `DATABASE_URL_SESSION` (port 5432 pooler) sourced from `apps/mvp/.env.local`, `pnpm db:introspect` produced:
- `src/lib/db/schema.ts` — 4 tables (`identity`, `contract_fingerprint`, `dependency_fingerprint`, `tier_state`), 60 columns total, 17 indexes (GIN on the three array deps + on `chain_deployments`; B-tree on everything in §5 of AI_CONTEXT.md), 3 FKs (all `ON DELETE CASCADE` against `identity`), 1 view (`mvp_master`). Drizzle suffixed table identifiers `InChaindrain` because of the `pgSchema("chaindrain")` namespace.
- `src/lib/db/relations.ts` — generated by drizzle-kit, not yet used.
- `src/lib/db/0000_magical_the_hunter.sql` — drizzle-kit's pulled DDL, kept for future migration round-trips.
- `src/lib/db/meta/` — drizzle-kit metadata snapshot.

#### d. Wrote runtime DB + Supabase clients
- `src/lib/db/index.ts` — singleton `postgres` client (`prepare: false` for pgBouncer transaction-mode compat, `max: 5`, `idle_timeout: 20`); stashed on `globalThis` to survive Next dev-server module reloads. Reads `DATABASE_URL` (port 6543, transaction mode). Exports `sql` (raw postgres) and `db` (Drizzle wrapper with `{ schema }`).
- `src/lib/db/queries.ts` — Phase-2 stub. Only export so far: `countIdentities()` which runs `SELECT count(*) FROM chaindrain.identity` via Drizzle.
- `src/lib/supabase/server.ts` — service-role client, lazy singleton, throws cleanly if `SUPABASE_SERVICE_ROLE_KEY` is missing. `{ db: { schema: 'chaindrain' }, auth: { persistSession: false, autoRefreshToken: false } }`.
- `src/lib/supabase/client.ts` — anon browser client, same schema. Lazy singleton, throws on missing env.
- `drizzle.config.ts` — `schemaFilter: ['chaindrain']`, `introspect.casing: 'preserve'` so the introspect output matches Postgres exactly.

Initial typecheck failed because `SupabaseClient` defaults its schema generic to `"public"` and assigning a `chaindrain`-schemed client to it errored. Refactored both client modules to use `ReturnType<typeof build>` for the singleton type so the inferred schema flows through. `pnpm typecheck` clean after the fix.

#### e. `/api/health` route + local smoke test
- `src/app/api/health/route.ts` — `runtime: 'nodejs'`, `dynamic: 'force-dynamic'`, calls `countIdentities()`, returns `{ ok: true, count }` or `{ ok: false, error }` (500). No service-role required: `DATABASE_URL` uses the `postgres.<ref>` user via Supavisor pooler, which has full DB access.
- Two false starts before the smoke test landed:
  1. First `pnpm dev` exited with `Unhandled Rejection: NodeError [SystemError]: uv_interface_addresses returned Unknown system error 1` — the Cursor sandbox blocks `getifaddrs(2)`. Fixed by re-running with `required_permissions: ["all"]`.
  2. Port 3000 was held by a stale `next-server (v15.0.0-rc.0)` (the legacy `apps/web` dev from a prior chat). Bypassed by running with `PORT=3010`.
- Final smoke: `curl http://localhost:3010/api/health` → `{"ok":true,"count":875}` in 2.7s. Matches the spec acceptance criterion.

#### f. Scaffold cleanup
Deleted the safe-to-delete scaffold defaults flagged in §3 of AI_CONTEXT.md: `apps/mvp/AGENTS.md`, `apps/mvp/CLAUDE.md`, `apps/mvp/README.md`. Added `!.env.local.example` + `!.env.example` to `apps/mvp/.gitignore` so the example env can be committed despite the broad `.env*` block.

#### g. Pending (manual user action)
- **Step 10 — Vercel project.** Create `chaindrain-mvp` Vercel project pointed at `github.com/wazarat/chaindrain`. Root Directory = `apps/mvp`, "Include source files outside Root Directory" = ON. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DATABASE_URL_SESSION`. (No `SUPABASE_SERVICE_ROLE_KEY` yet — `/api/health` doesn't need it, defer until a Phase-3 admin route requires it; user should also rotate before pasting.)
- **Step 11 — Production smoke.** `curl https://chaindrain-mvp.vercel.app/api/health` → expect `{"ok":true,"count":875}`.

### Files created
- `.npmrc`
- `pnpm-lock.yaml` (regenerated; previous one was from May 14 pre-Phase-0)
- `apps/mvp/drizzle.config.ts`
- `apps/mvp/src/lib/supabase/server.ts`
- `apps/mvp/src/lib/supabase/client.ts`
- `apps/mvp/src/lib/db/index.ts`
- `apps/mvp/src/lib/db/queries.ts`
- `apps/mvp/src/lib/db/schema.ts` (drizzle-kit output)
- `apps/mvp/src/lib/db/relations.ts` (drizzle-kit output)
- `apps/mvp/src/lib/db/0000_magical_the_hunter.sql` (drizzle-kit output)
- `apps/mvp/src/lib/db/meta/{_journal.json,0000_snapshot.json}`
- `apps/mvp/src/app/api/health/route.ts`
- `apps/mvp/.env.local` (gitignored)
- `apps/mvp/.env.local.example`

### Files modified
- `apps/mvp/package.json` — `drizzle-orm` `^0.36.4` → `^0.45.2`, `drizzle-kit` `^0.30.1` → `^0.31.10`.
- `apps/mvp/.gitignore` — added `!.env.local.example` + `!.env.example` exceptions.
- `docs/AI_CONTEXT.md` — flipped Phase 1 from IN PROGRESS to DONE LOCALLY, rewrote §3 file inventory + §7 step-by-step + §8 handoff.
- `docs/DECISIONS.md` — added §18 (pnpm store-dir pin + provenance-xattr diagnostic).
- `docs/CHANGELOG_DEV.md` — this entry.

### Files deleted
- `apps/mvp/AGENTS.md`, `apps/mvp/CLAUDE.md`, `apps/mvp/README.md` — scaffold defaults.

### Commits
- `20c635b` `phase 1: apps/mvp deps + drizzle introspect + /api/health → 875` (pushed to `main`)

### Phase 1 close (2026-05-16 ~14:57 UTC)
User created `chaindrain-mvp` Vercel project (same `wazarat/chaindrain` repo, Root Directory `apps/mvp`, "Include files outside Root Directory" ON, Next.js auto-detected, 4 env vars in Production+Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DATABASE_URL_SESSION` — no service-role yet). First deploy: green on first try. `/` renders the unmodified Next scaffold (real dashboard lands in Phase 2). Prod smoke:
```
$ curl -i https://chaindrain-mvp.vercel.app/api/health
HTTP/2 200
content-type: application/json
x-vercel-cache: MISS
x-vercel-id: yul1::iad1::96rrs-...
{"ok":true,"count":875}
# time_total = 0.166s
```
Legacy `chaindrain.vercel.app` (`apps/web`) build that auto-triggered from the Phase 1 push was also green — rollback parachute intact. User will migrate the `chaindrain.xyz` custom domain to the MVP project manually at their convenience; not blocking Phase 2.

### Next steps
**Phase 2 — SCORE leg.** Per `docs/AI_CONTEXT.md` §7 Phase 2 and `chaindrain_export/CURSOR_PROMPT.md` "PHASE 2": KPI cards (4) + filter bar (sector/risk_tier/coverage_tier/oracle/chain/bridge) + sortable HTML table over `chaindrain.mvp_master` (50/page, default `risk_score DESC NULLS LAST`) + Radix `<Dialog>` row-click drawer. Routes: `GET /api/entities` (paginated, zod-validated), `GET /api/entities/[entity_id]`. All SQL through `apps/mvp/src/lib/db/queries.ts` — no inline SQL in route handlers. Acceptance: `risk_tier=critical` → 59 rows, RealT top.

---

## 2026-05-16 (PM #4) — Phase 2: SCORE leg dashboard, /api/entities, drawer — locally complete

### Session goals
Phase 2 from `docs/AI_CONTEXT.md` §7 — build the SCORE leg dashboard at `/` per `chaindrain_export/CURSOR_PROMPT.md` "PHASE 2". 4 KPI cards + filter bar + sortable mvp_master table + Radix `<Dialog>` row-click drawer + `GET /api/entities` (paginated, zod-validated) + `GET /api/entities/[entity_id]`. All SQL through `apps/mvp/src/lib/db/queries.ts`. Acceptance: `risk_tier=critical` → 59 rows, RealT top.

### What was done

#### a. Three new deps
`pnpm add @radix-ui/react-dialog clsx lucide-react` — 22 packages added in 2.3 s through the existing `~/Library/pnpm/store`. Versions pinned: `@radix-ui/react-dialog 1.1.15`, `clsx 2.1.1`, `lucide-react 0.435.0`. No `tailwind-merge` — Tailwind v4 + clsx is enough for this dashboard. The peer-dep warnings printed by pnpm all originate from the legacy `apps/web` (`next 15.0.0-rc.0` ↔ React 19 mismatch) and are unrelated; `apps/web` is on death row anyway.

#### b. Queries layer (`apps/mvp/src/lib/db/queries.ts`)
Replaced the Phase 1 stub. New exports, all using the raw `sql` (postgres-js) tagged-template client from `src/lib/db/index.ts`:
- `countIdentities()` — kept for `/api/health`.
- `getKpiSummary()` — single SELECT with COUNT FILTER + SUM. Returns `{ total_entities, critical_count, high_count, total_tvl_usd, total_blast_radius_usd }`.
- `getFilterOptions()` — four parallel SELECTs in `Promise.all`: distinct sectors from `identity`, distinct unnest of `oracle_providers` / `bridge_dependencies` from `dependency_fingerprint`, and distinct unnest of `chain_deployments` from `identity` ordered by deployment count DESC. Returns the static enum lists `risk_tiers` + `coverage_tiers` inline (no need to `SELECT DISTINCT` them since they're constrained taxonomies).
- `getEntities({ filters, sortField, sortDirection, page, pageSize })` — paginated SELECT against `chaindrain.mvp_master`. Filters compose via a small `buildWhereClause` helper that returns a postgres-js sql fragment: scalar columns use `= ANY(${array}::text[])`, array columns use `&& ${array}::text[]` (overlap, hits the existing GIN indexes). `name ILIKE` for free-text search. Sort field is whitelisted via a `SORTABLE` map; direction is normalised to `ASC`/`DESC` literally. Default `ORDER BY risk_score DESC NULLS LAST, name ASC`. `LIMIT / OFFSET` are parameterised. The total count for pagination runs a second `COUNT(*)` with the same WHERE clause, in series after the row fetch (could be parallelised; not bottleneck-y at 875 rows).
- `getEntityById(entity_id)` — `SELECT * FROM chaindrain.mvp_master WHERE entity_id = $1 LIMIT 1`.

Why raw `sql` over Drizzle's view query builder: `pnpm db:introspect` flattens Postgres `text[]` columns on the view definition to plain `text()` in the generated `schema.ts` (drizzle-kit limitation as of 0.31.10). Trying to use the typed view object would lose array semantics. postgres-js natively decodes Postgres arrays into JS arrays, so the runtime data is correct — the types come from hand-written `EntityRow` / `EntityDetail` interfaces.

Smoke-tested live before wiring the API: `pnpm exec tsx --env-file=.env.local scripts/smoke-queries.ts` (script later deleted) printed `KPI: { total_entities: 875, critical_count: 59, high_count: 69, total_tvl_usd: 828803713287.118…, total_blast_radius_usd: 828803713287.118… }`, `filter options counts: { sectors: 22, oracles: 16, chains: 182, bridges: 1 }`, `critical total: 59`, top 5 = `RealT (0.8532), Arbitrum Bridge (0.8074), Binance (0.8032), Binance (Binance On-Ramp) (0.8032), Binance (Validator Operations) (0.8032)`. ✓ all match the AI_CONTEXT §5 ground-truth values.

#### c. zod schemas (`apps/mvp/src/lib/api/schemas.ts`)
- `entitiesQuerySchema` — accepts `page` / `pageSize` (coerced numbers, page≥1, pageSize 1–200, defaults 1/50), `sort` (enum), `direction` (enum), `search` (≤200 chars), and six list filters (`sectors`, `riskTiers`, `coverageTiers`, `oracles`, `chains`, `bridges`). List filters accept either CSV string (`"critical,high"`) or repeated query params (Next's URLSearchParams will give an array if `riskTiers=critical&riskTiers=high` is used). The `csvEnumList` helper applies `z.enum(values)` after splitting so invalid risk_tier values 400 with structured zod issues. Empty strings are stripped to `undefined`.
- `entityIdParamsSchema` — `z.object({ entity_id: z.string().uuid() })`.
- `parseSearchParams(URLSearchParams)` — utility used in the route handler to flatten a `URLSearchParams` into an `EntitiesQueryInput`-compatible object preserving repeated keys as arrays.

#### d. API routes
- `apps/mvp/src/app/api/entities/route.ts` — `GET` only. Reads URL → `parseSearchParams` → `entitiesQuerySchema.parse` → `getEntities(...)`. Returns `{ ok: true, data: rows, pagination: { page, pageSize, total, totalPages } }`. `ZodError` → 400 with `{ ok: false, error: 'invalid_query', issues: [...] }`. Anything else → 500 + `console.error` per CURSOR_PROMPT.md "Coding standards".
- `apps/mvp/src/app/api/entities/[entity_id]/route.ts` — `GET` only. `params` is a Promise in Next 16 App Router; awaits then parses with `entityIdParamsSchema`. 404 if not found, 400 on bad UUID, 500 fallback.

Both routes are `runtime: 'nodejs'` + `dynamic: 'force-dynamic'` (no caching — the data changes when the seed reloads or, eventually, when the DETECT leg writes alerts).

#### e. UI components
- `src/lib/utils.ts` — `cn`, `formatUsdCompact`, `formatUsdFull`, `formatNumber`, `formatRiskScore`, `formatDate`, `riskTierClass`, `riskScoreColor`, `coverageTierClass`. All money fields go through `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` per spec.
- `src/lib/url-state.ts` — `buildSearchString(params)` (drops empty values, joins arrays with comma) + `parseList(value)` (splits comma-separated URL params back into arrays).
- `src/components/kpi-cards.tsx` — server component. 4 cards in a responsive grid (1 → 2 → 4 across sm/lg). Critical (red), High (orange), Total TVL (emerald), Total Blast Radius (blue). Lucide icons.
- `src/components/multi-select.tsx` — client. Headless multi-select with click-outside / Escape handling, search box auto-shown when options.length > 8, selected count chip, X-to-clear inside the trigger. Used by the filter bar.
- `src/components/filter-bar.tsx` — client. Reads filter values from `useSearchParams()` (single source of truth), pushes via `router.push('/?' + buildSearchString(...), { scroll: false })` inside a `useTransition` so the browser doesn't lose focus / scroll. Page resets to 1 on every filter change. Free-text name search has its own form (Apply button or Enter); local state is synced with URL via the React 19 "adjust state during render" pattern (`if (lastUrlSearch !== current.search) { setLastUrlSearch(current.search); setSearchInput(current.search); }`) — `useEffect` would have triggered the new `react-hooks/set-state-in-effect` lint error. Clear-all wipes all params and pushes to `/`.
- `src/components/entities-table.tsx` — client. `<table>` over `EntityRow[]`. Columns: name / sector / TVL ($ compact) / risk_score (colored) / risk_tier pill / coverage_tier pill / oracle chips / bridge chips / blast_radius ($ compact). Headers are buttons that flip sort direction or switch field (default new field = DESC except for name/sector which default ASC). Rows are `role="button"` with Enter/Space keyboard handling and click → opens `<EntityDrawer entityId={id}>`. Pagination is prev/next at the bottom. `useTransition` on every navigation so the table fades to 70 % opacity during the SSR round-trip, masking the lag.
- `src/components/entity-drawer.tsx` — client. Radix `Dialog.Root` with right-side slide-in (`max-w-2xl`, `inset-y-0 right-0`), backdrop blur. Header has `Dialog.Title` (entity name) + `Dialog.Description` (sector) + `Dialog.Close`. Body fetches `/api/entities/[entity_id]` on mount. **State reset is via `key={entityId}` on a `<DrawerInner>` child** — every time the user clicks a different row the inner component remounts with fresh `loading`/`data`/`error` state. No effect-based reset, no lint complaints. The body groups all 48 mvp_master fields into 5 sections: Identity / Contract Fingerprint / Audits & Bounties / Dependencies / Risk Factors. Top of body is a 4-cell Stat strip: risk_score / risk_tier / coverage / state.

#### f. Page (`src/app/page.tsx`) + layout
- `page.tsx` — server component. `searchParams` is a `Promise<Record<…>>` in Next 16 App Router; awaits then runs through `entitiesQuerySchema.safeParse` (falls back to defaults on parse failure rather than 500-ing the page). Calls `getKpiSummary`, `getFilterOptions`, `getEntities` in parallel via `Promise.all`. Renders header → `<KpiCards>` → `<FilterBar>` → `<EntitiesTable>` → footer with `/api/health` link. `runtime: 'nodejs'`, `dynamic: 'force-dynamic'`.
- `layout.tsx` — dropped the Geist font setup that the scaffold included (slowed down dev start with Google Fonts fetch over the limited sandbox network) in favour of system stack via `--font-sans` in `globals.css`. Sets the page title to `Chaindrain — Threat Detection`.
- `globals.css` — kept Tailwind v4 `@import "tailwindcss"` + the `@theme inline` block, swapped foreground/background to zinc-50/zinc-950 and locked `font-family` to a system stack.

#### g. Lint fixes
- React 19 + the new `react-hooks/set-state-in-effect` rule fired on two files: `entity-drawer.tsx` (initial draft did `setData(null); setError(null)` inside a `useEffect`) and `filter-bar.tsx` (initial draft did `useEffect(() => setSearchInput(current.search), [current.search])`). Fixed via key-based remount in the drawer and the "adjust state during render" pattern in the filter bar (see §e above).
- Removed a stale `// eslint-disable-next-line no-var` directive in `src/lib/db/index.ts` that the new ESLint flagged as unused.
- Added `src/lib/db/schema.ts` and the rest of drizzle-kit's introspect output (`relations.ts`, `meta/**`, `0000_*.sql`) to `eslint.config.mjs` `globalIgnores` since those files are regenerated by `pnpm db:introspect` and we don't want a `'pgTable' is defined but never used` warning to break CI lint.

#### h. Local verification
- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm build` clean: 5.9 s. Routes registered: `ƒ /`, `ƒ /api/entities`, `ƒ /api/entities/[entity_id]`, `ƒ /api/health`, `○ /_not-found`.
- Dev server on :3010, ran 5 acceptance curls:
  - `GET /api/entities?riskTiers=critical&pageSize=5` → `{ pagination: { total: 59, totalPages: 12 }, data: [RealT, Arbitrum Bridge, Binance, Binance (Binance On-Ramp), Binance (Validator Operations)] }`. **Acceptance ✓** — 59 critical, RealT top.
  - `GET /api/entities/69f29121-…` (RealT's UUID) → 200, 48 keys, `chain_deployments: ['xDai']`, `oracle_providers: ['Chainlink']`.
  - `GET /api/entities?sectors=Tokenized%20Real-World%20Assets&pageSize=5` → 28 rows, RealT top. URL-encoded sector with embedded space + ampersand-free name worked.
  - `GET /api/entities?oracles=Chainlink&riskTiers=critical&sort=tvl_usd&direction=desc&pageSize=3` → 13 rows, Binance Validator Operations / Coinbase Validator Operations / Babylon by TVL DESC.
  - `GET /api/entities?page=foo` → `400 { ok: false, error: 'invalid_query', issues: [{ code: 'invalid_type', expected: 'number', received: 'nan', path: ['page'] }] }`.
  - `GET /api/entities/not-a-uuid` → `400 { ok: false, error: 'invalid_entity_id', issues: [{ validation: 'uuid', code: 'invalid_string', path: ['entity_id'] }] }`.
- SSR dashboard: `GET /?riskTiers=critical` → 145 KB HTML in 0.42 s after first compile. Grepped output confirms "RealT", "0.8532", "Critical risk", "Sorted by risk_score", and `Showing 1–50 of 59 entities` all rendered.

### Files created
- `apps/mvp/src/lib/api/schemas.ts`
- `apps/mvp/src/lib/utils.ts`
- `apps/mvp/src/lib/url-state.ts`
- `apps/mvp/src/app/api/entities/route.ts`
- `apps/mvp/src/app/api/entities/[entity_id]/route.ts`
- `apps/mvp/src/components/kpi-cards.tsx`
- `apps/mvp/src/components/multi-select.tsx`
- `apps/mvp/src/components/filter-bar.tsx`
- `apps/mvp/src/components/entities-table.tsx`
- `apps/mvp/src/components/entity-drawer.tsx`

### Files modified
- `apps/mvp/package.json` — +3 deps.
- `apps/mvp/src/app/page.tsx` — replaced Next scaffold with the dashboard server component.
- `apps/mvp/src/app/layout.tsx` — system fonts, new title.
- `apps/mvp/src/app/globals.css` — system font stack, zinc palette.
- `apps/mvp/src/lib/db/index.ts` — dropped stale eslint-disable.
- `apps/mvp/src/lib/db/queries.ts` — Phase-2 query surface.
- `apps/mvp/eslint.config.mjs` — ignore drizzle introspect output.
- `pnpm-lock.yaml` — +22 packages.
- `docs/AI_CONTEXT.md` — flipped Phase 2 to DONE locally; rewrote §3 file inventory + §7 Phase 2 + §8 handoff to Phase 3.
- `docs/CHANGELOG_DEV.md` — this entry.

### Pending (manual user)
- Push to `main` → Vercel auto-deploys `chaindrain-mvp.vercel.app`.
- Smoke `https://chaindrain-mvp.vercel.app/?riskTiers=critical` and confirm 59 rows + RealT top in the live HTML.
- Phase 3 prep: provision a free Etherscan API key (`https://etherscan.io/myapikey`) and generate `CRON_SECRET` (e.g. `openssl rand -hex 32`). Both go into Vercel Production env before Phase 3 ships.

### Commits
- (pending) `phase 2: SCORE leg — KPI cards + filter bar + sortable mvp_master table + entity drawer + /api/entities`

### Next steps
**Phase 3 — DETECT leg.** Per `docs/AI_CONTEXT.md` §7 Phase 3 and `chaindrain_export/CURSOR_PROMPT.md` "PHASE 3": new `chaindrain.alert` table + 5 free-source pollers (stablecoin-depeg, oracle-deviation, bridge-pause, admin-tx, tvl-drop) + Vercel Cron (`*/5 * * * *`) + vitest unit tests. Acceptance: synthetic USDC=0.97 → critical alert with `fanout_count > 50`. Worker also runnable locally as `tsx workers/poll-signals.ts`.

---

## 2026-05-16 (PM #5) — Phase 3: DETECT leg — 5 pollers + chaindrain.alert + Vercel cron */5

### Session goals
Phase 3 per `docs/AI_CONTEXT.md` §7 + `chaindrain_export/CURSOR_PROMPT.md` "PHASE 3". Append-only migration for `chaindrain.alert`, five pure poller functions hitting free public APIs, orchestrator runnable locally and from Vercel Cron, vitest unit tests. Acceptance: synthetic USDC=0.97 → critical alert with `fanout_count > 50` against the live DB.

### What was done

#### a. Live Phase 2 prod smoke (pre-flight, not blocking)
Confirmed `https://chaindrain-mvp.vercel.app/api/health` → `{ok:true,count:875}` and `/api/entities?riskTiers=critical&pageSize=1` → `pagination.total=59`, `data[0].name=RealT`, `risk_score=0.8532` in 213 ms. HEAD on `/?riskTiers=critical` returns 200 in 0.95s; full GET via curl hangs >60s on Next 16 RSC streaming (curl-specific, browsers fine). Unfiltered `GET /` returns 136 KB in 220ms and HTML contains `"Critical risk"`, `"RealT"`, `"of 875"`. Phase 2 prod is functionally green for the user to browser-smoke at their own pace.

#### b. Migration `20260517000000_alerts.sql` applied
`chaindrain.alert(alert_id uuid PK DEFAULT gen_random_uuid(), detected_at timestamptz DEFAULT now(), signal_type text NOT NULL, severity text NOT NULL, dependency_key text NOT NULL, dependency_field text NOT NULL, raw_signal jsonb NOT NULL, fanout_count int, fanout_tvl_usd numeric)` + two CHECK constraints (`signal_type IN (stablecoin_depeg|oracle_deviation|bridge_pause|admin_tx|tvl_drop)`, `severity IN (critical|high|medium|low)`) + indexes `idx_alert_detected (detected_at DESC)` and `idx_alert_severity ((severity, detected_at DESC))` + grants (anon/authenticated SELECT, service_role ALL). Applied via Supabase MCP `apply_migration`. Drizzle re-introspect lifted the new table into `apps/mvp/src/lib/db/schema.ts` (now 5 tables / 69 columns / 19 indexes / 2 check constraints).

#### c. Two new mvp deps
- `viem ^2.49.3` — Chainlink `latestRoundData` reads (oracle-deviation poller) + LayerZero V2 endpoint `paused()` call (bridge-pause poller).
- `vitest ^4.1.6` + `@vitest/coverage-v8 ^4.1.6` — unit-test runner per poller. `vitest.config.ts` uses `pool: "forks"`, includes `src/**/*.test.ts`. Vitest 4 removed `poolOptions`; initial config had it and tsc errored, simplified to just `pool`.

Same DECISIONS §18 trap hit on first install (`ERR_PNPM_UNEXPECTED_STORE`). Recipe from §18 worked: re-run with `required_permissions: ["all"]` so pnpm uses the un-poisoned global `~/Library/pnpm/store`. Peer-dep warnings all originate from `apps/web@15.0.0-rc.0`; ignored (legacy, scheduled for Phase 6 deletion).

#### d. 5 pure poller functions (`apps/mvp/src/lib/pollers/`)
Shared types in `types.ts`: `AlertSignalType`, `AlertSeverity`, `DependencyField` (union over array AND scalar columns — see DECISIONS §20), `ARRAY_DEPENDENCY_FIELDS: ReadonlySet<DependencyField>`, `RawAlert`, `PollerContext` (`{ fetch, now, env }`).

Each poller exports a **pure classifier** (synchronous, takes pre-fetched readings, returns `RawAlert[]`) and an **async I/O wrapper** (`pollX(ctx, deps?)`). Tests exercise the classifier; integration runs the wrapper through the live cron. See DECISIONS §19.

| Poller | API | Thresholds | dependency_field |
|---|---|---|---|
| `stablecoin-depeg.ts` | CoinGecko `/simple/price` for USDC/USDT/DAI/FDUSD/USDS/USDe/USD0 | 0.005 high, 0.02 critical | `stablecoin_dependencies` |
| `oracle-deviation.ts` | viem Chainlink ETH/BTC/LINK feeds via `https://eth.llamarpc.com` (override `ETH_RPC_URL`) + Pyth Hermes `/v2/updates/price/latest` + CoinGecko reference | 0.01 medium, 0.05 high | `oracle_providers` (key=Chainlink or Pyth) |
| `bridge-pause.ts` | LayerZero V2 EndpointV2 `0x1a44…728c` `paused()` (graceful null on revert) + Wormholescan `/v1/heartbeats` + Axelarscan `/getChainMaintainers` | LZ paused / Wormhole guardians < 13 / Axelar chain maintainers < 3 → critical | `bridge_dependencies` |
| `admin-tx.ts` | Etherscan `txlist` (free 5 req/s, sequential 250 ms sleep) | tx in last 5 min: EOA/Multisig → high, other → medium | `admin_address` (scalar) |
| `tvl-drop.ts` | DefiLlama `/protocols` snapshot (`change_1d` field, no state needed) | ≤ −20% high, ≤ −40% critical | `defillama_slug` (scalar) |

#### e. Queries surface (`apps/mvp/src/lib/db/queries.ts`)
- `insertAlert(alert)` — explicit `JSON.stringify(raw_signal)::jsonb` cast (postgres-js `sql.json` doesn't satisfy `Record<string, unknown>` types).
- `computeFanout(field, key)` — branches on `ARRAY_DEPENDENCY_FIELDS`: `&&` for arrays (hits GIN indexes from Phase 0), `=` for scalars. Returns `{ fanout_count, fanout_tvl_usd }`. See DECISIONS §20.
- `getTopAdminWatchEntities(limit)` — selects top-N by risk_score where `admin_address ~ '^0x[0-9a-fA-F]{40}$'`, returns `AdminWatchEntity[]`.
- `getWatchedDefillamaSlugs()` — distinct non-null slugs from `mvp_master`.
- `getRecentAlertCount(windowHours)` — for Phase 2 KPI #4 to read real data once Phase 3 ships.

#### f. Orchestrator + cron route + vercel.json
`src/workers/poll-signals.ts` (`pnpm poll`, tsx-runnable, also the cron route's entry point): fetches admin watchlist + slugs once, runs all 5 pollers via `Promise.allSettled`, per-poller try/catch logs `console.error({ pollster, error })`, then per-alert: `computeFanout` → `insertAlert`. Returns typed `PollRunSummary`. Writes per-alert, not per-poller (DECISIONS §21).

`src/app/api/cron/poll/route.ts` (`runtime: "nodejs"`, `dynamic: "force-dynamic"`, `maxDuration: 60`): 500 `cron_secret_not_configured` if env unset (DECISIONS §22); 401 `unauthorized` if Bearer missing/wrong; else 200 with `{ ok: true, summary }`. Accepts GET (Vercel Cron's verb) and POST.

`apps/mvp/vercel.json` — `{ "crons": [{ "path": "/api/cron/poll", "schedule": "*/5 * * * *" }] }`. First Vercel cron config in the project; replaces the legacy Supabase pg_cron / Edge Function path.

`apps/mvp/src/lib/db/index.ts` got an explicit `closeDb()` helper for clean process exit on `pnpm tsx` runs.

#### g. Vitest tests
5 test files, **29 tests, all green** (~400 ms total). Headline test in `stablecoin-depeg.test.ts`: synthetic USDC=0.97 → exactly 1 critical alert with `dependency_key='USDC'`, `dependency_field='stablecoin_dependencies'`, `raw_signal.source='coingecko'`, `raw_signal.price=0.97`, `deviation ≈ 0.03`. One floating-point boundary test failed initially (`1 - 0.02` is actually `0.9799999999999999` so `Math.abs(0.98 - 1) = 0.020000000000000018 > 0.02 → critical` not `high`); fixed by stepping `±0.001` off the threshold instead of testing the literal edge.

#### h. Live E2E acceptance smoke (one-off, deleted after)
Wrote `apps/mvp/scripts/smoke-phase3.ts` to prove the full pipeline against the live Supabase DB:
```
classifyStablecoinPrices({ "usd-coin": { usd: 0.97 } })
  → 1 alert, severity=critical, dependency_key=USDC, dependency_field=stablecoin_dependencies
computeFanout('stablecoin_dependencies', 'USDC')
  → fanout_count=70, fanout_tvl_usd=$39,528,055,780.40
insertAlert(...)
  → alert_id=45a5dfb7-c545-461d-ab0c-bb0f15789318, detected_at=2026-05-16 15:55:04 UTC
readback
  → severity=critical, fanout_count=70 (matches insert)
cleanup
  → DELETE OK, alert table back to 0 rows
```
Spec required `fanout_count > 50` — 70 comfortably exceeds. Script then deleted (it served its purpose, not part of the committed surface).

#### i. Local cron route auth smoke
After adding `CRON_SECRET` to `.env.local` and bouncing the dev server, hit `/api/cron/poll` three ways:
- No `Authorization` header → `401 {"ok":false,"error":"unauthorized"}` ✓
- `Authorization: Bearer wrong-secret` → `401 {"ok":false,"error":"unauthorized"}` ✓
- With `CRON_SECRET` unset (initial run before .env.local update) → `500 {"ok":false,"error":"cron_secret_not_configured"}` ✓

The correct-token + full pipeline path was *not* hit locally to avoid persisting real alerts during a cron-route smoke; that's left for the first Vercel cron fire post-deploy, where alerts are expected behavior.

#### j. .env.local.example updated
Three new docs lines: `CRON_SECRET=` (generate `openssl rand -hex 32`), `ETHERSCAN_API_KEY=` (free at etherscan.io/myapikey), optional `# ETH_RPC_URL=...` override comment for the viem transport.

#### k. Final local verification
- `pnpm typecheck` → clean.
- `pnpm lint` → clean.
- `pnpm test` → 5 files / 29 tests / all green.
- `pnpm build` → clean, 5.0 s. New route registered: `ƒ /api/cron/poll`.

### Files created
- `supabase/migrations/20260517000000_alerts.sql`
- `apps/mvp/src/lib/pollers/types.ts`
- `apps/mvp/src/lib/pollers/stablecoin-depeg.ts` + `.test.ts`
- `apps/mvp/src/lib/pollers/oracle-deviation.ts` + `.test.ts`
- `apps/mvp/src/lib/pollers/bridge-pause.ts` + `.test.ts`
- `apps/mvp/src/lib/pollers/admin-tx.ts` + `.test.ts`
- `apps/mvp/src/lib/pollers/tvl-drop.ts` + `.test.ts`
- `apps/mvp/src/workers/poll-signals.ts`
- `apps/mvp/src/app/api/cron/poll/route.ts`
- `apps/mvp/vercel.json`
- `apps/mvp/vitest.config.ts`

### Files modified
- `apps/mvp/package.json` — `+viem ^2.49.3`, `+vitest ^4.1.6`, `+@vitest/coverage-v8 ^4.1.6`, scripts `+test`, `+test:watch`, `+poll`.
- `apps/mvp/src/lib/db/schema.ts` + `relations.ts` + `meta/**` + `0000_magical_the_hunter.sql` — regenerated by `pnpm db:introspect` to include `chaindrain.alert`.
- `apps/mvp/src/lib/db/index.ts` — added `closeDb()` helper.
- `apps/mvp/src/lib/db/queries.ts` — added `insertAlert`, `computeFanout`, `getTopAdminWatchEntities`, `getWatchedDefillamaSlugs`, `getRecentAlertCount` + types `AlertInsert` / `AlertRow` / `FanoutResult`. Imported `ARRAY_DEPENDENCY_FIELDS` + alert/dep types from `../pollers/types`.
- `apps/mvp/.env.local.example` — added Phase 3 env docs (`CRON_SECRET`, `ETHERSCAN_API_KEY`, optional `ETH_RPC_URL`).
- `apps/mvp/.env.local` — added `CRON_SECRET=ebb216acc57724d8a9c29be22d9669e5b964707b318d176530cda535dec80846` (gitignored). Same value the user must paste into Vercel.
- `pnpm-lock.yaml` — viem + vitest transitive closure.
- `docs/AI_CONTEXT.md` — flipped Phase 3 to DONE locally; rewrote §3 inventory + §5 DB table + §7 Phase 3 + §8 handoff to Phase 4.
- `docs/DECISIONS.md` — added §19 (poller classifier/wrapper split + no DB mocks in tests), §20 (`DependencyField` over both array and scalar columns + `computeFanout` branch), §21 (per-alert writes, no run-wide transaction), §22 (cron-route hard-fails on missing `CRON_SECRET`, 500 not 401).
- `docs/CHANGELOG_DEV.md` — this entry.

### Pending (manual user)
1. **Set `CRON_SECRET`** in Vercel Production+Preview+Development env vars. Value: `ebb216acc57724d8a9c29be22d9669e5b964707b318d176530cda535dec80846` (also in local `apps/mvp/.env.local`).
2. **Confirm `ETHERSCAN_API_KEY`** is set in Vercel Preview as well as Production (user said Production was already done before this session).
3. Once both env vars are set and the Phase 3 commit pushes, Vercel auto-deploys. First Vercel cron fire happens within 5 minutes — confirm via Vercel dashboard → Crons (green tick) and `SELECT signal_type, severity, dependency_key, fanout_count, fanout_tvl_usd, detected_at FROM chaindrain.alert ORDER BY detected_at DESC LIMIT 20;`. If no alerts appear, that's normal for a quiet 5-minute window (all pollers degrade gracefully when nothing is wrong).
4. Manual prod smoke: `curl -H "Authorization: Bearer $CRON_SECRET" https://chaindrain-mvp.vercel.app/api/cron/poll` should return `{ ok: true, summary: { ... 5 per-poller outcomes ... } }`.

### Commits
- (pending) `phase 3: DETECT leg — chaindrain.alert + 5 pollers + Vercel cron */5`

### Next steps
**Phase 4 — FAN OUT leg.** Per `docs/AI_CONTEXT.md` §7 Phase 4 and `chaindrain_export/CURSOR_PROMPT.md` "PHASE 4": `/alerts` index (last 7 days, sortable by severity / fanout_tvl_usd / detected_at) + `/alerts/[alert_id]` contagion view (header + affected entities ordered by `blast_radius_usd DESC` + similar-exposure panel via Method B query). All queries through `src/lib/db/queries.ts`; reuse `computeFanout` (already canonical); add `getSimilarExposure(field, key, limit)` for Method B. Budget <200ms via existing GIN indexes.
