# DECISIONS — Chaindrain

Architectural and security decisions made during development, with rationale. Future AI sessions should respect these unless explicitly told otherwise.

---

## 1. Three Supabase clients, picked per route

**Decision:** API routes use one of three Supabase clients (`public_client`, `user_client(jwt)`, `admin_client`) based on access semantics. Never use `admin_client` for per-user reads.

**Rationale:** The initial implementation used `admin_client()` (service-role) everywhere, which bypasses RLS entirely. That meant:
- Per-user endpoints (`/me`, `/watchlists`, `/notifications`) would have leaked any user's data to any other authenticated user — RLS was effectively disabled at the API layer.
- Service-role key was required to boot the API even for endpoints that don't need it.

By scoping each route to the minimum-privilege client, RLS is the authoritative access boundary, and the API can boot in dev without `SUPABASE_SERVICE_ROLE_KEY`.

**See:** `apps/api/app/supabase_client.py`, all routers in `apps/api/app/routers/`.

---

## 2. `SUPABASE_SERVICE_ROLE_KEY` is optional in development

**Decision:** `Settings.supabase_service_role_key` defaults to empty string. `admin_client()` raises `503 Service Unavailable` with a clear message when called without the key, instead of crashing at boot.

**Rationale:** The Supabase MCP doesn't expose service-role keys, so during AI-driven development we operate without one. Day 1 KPIs (healthz, /me, catalog reads) don't need service-role. Admin/agent endpoints will surface a clean 503 when invoked, telling the operator what's missing. Production must set this env var.

**See:** `apps/api/app/config.py`, `apps/api/app/supabase_client.py:admin_client`.

---

## 3. Security advisor warnings — what we accept

After running `harden_security` migration, the remaining 7 advisor warnings are **intentional**:

| Warning | Object | Why accepted |
|---|---|---|
| `is_admin` callable by anon/authenticated | `public.is_admin(uuid)` | RLS policies reference this function; revoking `EXECUTE` breaks RLS evaluation. Function only returns a boolean, no privilege escalation risk. |
| `refresh_threat_matrix` callable by authenticated | `public.refresh_threat_matrix()` | The API's `/threat-matrix/refresh` admin endpoint calls this via service-role. We additionally gate it with `require_admin(user)` in the router; defense-in-depth. |
| `extension_in_public` × 3 | `vector`, `pg_trgm`, `pg_net` | Moving these to an `extensions` schema would break existing indexes (e.g. company FTS) and require column-type rewrites. Deferred to a separate maintenance migration. |
| `materialized_view_in_api` | `mv_threat_matrix` | The threat matrix is designed to be publicly readable. Selecting it directly is the intended surface. |

All other previously-flagged items (8 SECURITY DEFINER funcs callable by anon, mutable search_path on 5 funcs, SECURITY DEFINER view, missing RLS) were **fixed** in `20250101001000_harden_security.sql`.

**See:** `supabase/migrations/20250101001000_harden_security.sql`.

---

## 4. JWKS-based JWT verification, ES256

**Decision:** API verifies Supabase JWTs by fetching `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` and validating with the JWK's declared algorithm. JWKS URL is auto-derived from `SUPABASE_URL` if `SUPABASE_JWKS_URL` is not explicitly set.

**Rationale:** The Supabase project uses **ES256** (asymmetric, P-256) signing keys — verified via `curl` on the JWKS endpoint. Asymmetric verification means we don't need the JWT secret in the API process. The auto-derived URL means fewer env vars to manage.

**See:** `apps/api/app/auth.py`, `apps/api/app/config.py:jwks_url`.

---

## 5. Importer dedup on slug (last-wins)

**Decision:** `scripts/import_from_google_sheets.py` deduplicates the in-memory payload by `slug` before each upsert batch, keeping the last occurrence.

**Rationale:** Postgres `INSERT ... ON CONFLICT DO UPDATE` rejects multiple rows with the same conflict target in the same statement with `cannot affect row a second time`. Our 36 sheets contained 27 duplicate slugs across sectors (e.g., a company appearing in two subsectors). Last-wins matches the "later sheet overrides earlier" intent.

**See:** `scripts/import_from_google_sheets.py`, dedup loop around the payload list.

---

## 6. `next dev --turbopack` removed

**Decision:** `apps/web/package.json` `dev` script is plain `next dev`, not `next dev --turbopack`.

**Rationale:** The repo pins `next: 15.0.0-rc.0`, which does not support the `--turbopack` flag (it was added in a later RC). The flag caused the dev server to exit with `error: unknown option '--turbopack'`. If/when Next is upgraded to a version that supports turbopack, this can be re-enabled.

**See:** `apps/web/package.json`.

---

## 7. Vercel monorepo: Root Directory in dashboard, not at repo root

**Decision:** The Vercel project's **Root Directory** is set to `apps/web` (via the dashboard, with "Include source files outside of the Root Directory" enabled). The repo-root has no `vercel.json`.

**Rationale:** A repo-root `vercel.json` would need to override Vercel's Next.js auto-detection to point at the subfolder, and Vercel's monorepo handling for Next.js is fragile when done that way. Setting Root Directory is the officially-supported path. The "include outside" checkbox is essential so `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `packages/*` are visible at install time.

`apps/web/vercel.json` is intentionally minimal: just `framework`, `installCommand`, `buildCommand` (using `pnpm --filter @chaindrain/web... build` — the trailing `...` includes workspace deps like `@chaindrain/shared-types`), and `outputDirectory: ".next"`.

The earlier `cd ../..` trick in `buildCommand` caused the build to abort silently after ~7 log lines. Removed.

**See:** `apps/web/vercel.json`, Vercel project dashboard.

---

## 8. Migrations are append-only

**Decision:** New migration files have ascending `20250101NNNNNN` prefixes. Earlier migrations are **never edited** even when their content is logically superseded by a later one.

**Rationale:** Production / staging databases will have already applied earlier migrations. Editing them in-place breaks idempotency: a fresh deploy would apply the new content, but existing environments would have the old content with no way to reconcile.

If a fix is needed (e.g., the `search_path` fixes in `harden_security`), it goes into a **new** migration that brings everything up to current.

**See:** all files in `supabase/migrations/`.

---

## 9. No comments/docstrings added to files unless asked

**Decision:** The AI assistant does not add, remove, or modify code comments or docstrings unless the user explicitly requests it.

**Rationale:** User preference. Comments are part of the original author's expressive intent.

---

## 10. Fly deploys for `chaindrain-api` go via CLI from `apps/api/`, not the GitHub integration

**Decision:** Production deploys to `chaindrain-api.fly.dev` are issued by `flyctl deploy --remote-only` from inside `apps/api/`. The Fly GitHub auto-deploy integration is **not** used.

**Rationale:** Fly's GitHub integration runs `flyctl launch plan propose` at the **repo root** of the connected repository. There is no Dockerfile at the chaindrain repo root — the Dockerfile lives in `apps/api/`. Fly's autodetector cannot see it from the root and fails with `Could not detect runtime or Dockerfile`. A first attempt to use the integration produced exactly that failure and created an empty `chaindrain` app on Fly, which we then destroyed.

The CLI-from-subfolder approach uses the committed `apps/api/Dockerfile` + `apps/api/fly.toml` directly. The same pattern will apply to `chaindrain-agent` (deploy from `apps/agent/`) when that app comes up on Day 3.

If the GitHub integration is ever desired, it would need a per-app Fly-side "source directory" configuration (or a Dockerfile/`fly.toml` at the repo root, which would conflict with the monorepo structure). Not worth the complexity right now.

**See:** `apps/api/fly.toml`, `apps/api/Dockerfile`, the destroyed `chaindrain` app on Fly, the 2026-05-15 PM CHANGELOG entry.

---

## 11. Prod-only CORS on the FastAPI (no preview origin support)

**Decision:** `ALLOWED_ORIGINS` on `chaindrain-api` is set to exactly `https://chaindrain.vercel.app` in prod. No regex support. Vercel preview deploys (`https://chaindrain-git-*.vercel.app`) cannot call the API from a browser.

**Rationale:** `CORSMiddleware` with `allow_credentials=True` rejects `*` as `allow_origins`. Supporting preview URLs requires either an explicit list (preview hostnames are not predictable) or `allow_origin_regex` (small code change in `apps/api/app/config.py` + `app/main.py`). Day 2 does not need preview testing of authenticated paths; we'll add the regex setting on Day 3 if preview testing becomes necessary.

Dev still works because local `apps/api/.env` keeps `ALLOWED_ORIGINS=http://localhost:3000`.

**See:** `apps/api/app/main.py` `CORSMiddleware` block, `apps/api/app/config.py:cors_origins`, prod Fly secret `ALLOWED_ORIGINS`.
