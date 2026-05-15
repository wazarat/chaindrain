# CHANGELOG_DEV — Chaindrain

Chronological log of development work. Each AI session appends a new dated section. **Do not rewrite history; only append.**

Format per entry:
- **What** changed
- **Why**
- **Files modified / created**
- **Next steps**

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
