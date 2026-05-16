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

**Status (2026-05-16):** Decision moot. `apps/api` was destroyed in Phase 0 of the MVP rebuild; the MVP has no FastAPI surface and no CORS rules to maintain. See §13.

---

## 12. MVP rebuild stack lock — Next.js + Drizzle, no FastAPI

**Decision (2026-05-16, Phase 0):** the new MVP stack is **Next.js 15 (stable) App Router + TypeScript + Tailwind + supabase-js + Drizzle ORM + Vercel**. Nothing else. No FastAPI, no Python, no Fly, no auth, no charting library beyond Recharts (only if a Phase 5 stretch goal needs it).

**Rationale:** the MVP scope spec ([chaindrain_export/data/mvp_scope_spec.md](../../../Downloads/chaindrain_export/data/mvp_scope_spec.md)) explicitly defines three legs (Score / Detect / Fan Out) with a daily digest. The previous architecture had a custom FastAPI + Python Comet agent + Edge Function cron trigger — three deploy targets and three runtime languages. Vercel + Supabase + Drizzle covers the same surface with **one runtime, one deploy, one ORM**, and the spec's explicit "do NOT build" list (auth, multi-tenant, custom UI design system, alert replay, LLM reasoning, Slack/Discord) keeps scope tight.

The MVP lives in a new `apps/mvp/` directory; the legacy `apps/web/` stays frozen until Phase 1 verifies the rebuild is green, then it's deleted in a Phase 6 cleanup.

**See:** `apps/mvp/` (Phase 1+), [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) for the canonical phased build instructions.

---

## 13. Decommission FastAPI + Comet agent + cron-trigger Edge Function

**Decision (2026-05-16, Phase 0):** destroyed `chaindrain-api` and `chaindrain-agent` Fly apps and removed `apps/api/`, `apps/agent/`, `supabase/functions/cron-trigger/` from the repo. Pg_cron jobs `chaindrain_daily_agent` and `chaindrain_refresh_matrix` unscheduled.

**Rationale:** they're not in the new stack (§12). Hard cut prevents drift between two parallel architectures and resolves the "rotate leaked SUPABASE_SERVICE_ROLE_KEY + AGENT_HMAC_SECRET" follow-up trivially — the consumers of those secrets are gone.

The only thing kept warm is the legacy `chaindrain.vercel.app` deploy of `apps/web/` — frozen, but live, as a rollback parachute until Phase 5 ships green.

**See:** `docs/CHANGELOG_DEV.md` 2026-05-16 entry, `supabase/migrations/20260516000000_drop_legacy_public.sql`.

---

## 14. Single-tenant, IP-allowlisted, no auth in v1

**Decision (2026-05-16, Phase 0):** the MVP has no user accounts, no profiles, no watchlists. Access control is a Vercel IP allowlist on the deployment. No `supabase auth`, no JWT verification, no RLS policies on `chaindrain.*` tables (instead: SELECT granted to `anon` + `authenticated`, ALL to `service_role`).

**Rationale:** explicit spec choice from [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md): "no auth in v1 (single-tenant tool)." Auth was the second-largest source of complexity in the legacy `apps/web` (signup trigger, admin_grant function, RLS policies, JWKS verification). v1 doesn't need it. If the product grows past one tenant, auth becomes a Phase 6+ project.

**See:** `supabase/migrations/20260516000200_chaindrain_grants.sql`, [chaindrain_export/CURSOR_PROMPT.md](../../../Downloads/chaindrain_export/CURSOR_PROMPT.md) "What to NOT build" section.

---

## 15. entity_id collision: regenerate UUIDs, preserve 875-row spec

**Decision (2026-05-16, Phase 0):** when loading `chaindrain_export/data/entities_final.json`, 7 pairs of records share the same `entity_id` (UUIDv5 normalized whitespace in names — e.g. `'StarkEx (...)'` vs `'StarkEx\n(...)'`). For each colliding pair, the loader keeps the first occurrence's `entity_id` as-is and assigns a new SHA-1-derived UUIDv5 (`{original_uuid}|{name}|{key}` as the seed) to the second occurrence.

**Rationale:**
- The spec, the README's verification steps, and the `/api/health` smoke test all reference **875 entities**. Dedup-by-collision would land at 868, breaking the smoke test and the user's expectation.
- The pairs are functionally distinct (different `name` and `key`), just incidentally collapsed by the export's UUID-derivation rule. Preserving them is closer to the source spreadsheet's intent than dedup.
- The new UUIDs are deterministic given the same input, so re-running `scripts/load_seed.mjs` produces stable IDs.

The bundled SQL (`02_seed.sql`) doesn't apply this fix and so cannot be used as a Postgres migration — it would error on `duplicate key value violates unique constraint "identity_pkey"`. The migration that would have copied that file in was deleted in favor of the JSON loader path. See `scripts/load_seed.mjs`.

**See:** `scripts/load_seed.mjs:deriveUuid`, `chaindrain_export/data/entities_final.json`.

---

## 16. Strip the Cursor agent co-author trailer via `commit-msg` hook

**Decision (2026-05-16):** every commit on this repo runs `.git/hooks/commit-msg`, which removes `Co-authored-by: Cursor <cursoragent@cursor.com>` lines (case-insensitive) before the commit object is created. Future agent-driven and human-driven commits will both show only `wazarat <wazarat@outlook.com>` on GitHub.

**Rationale:** the Cursor agent runtime auto-injects a Cursor co-author trailer into every commit message it builds, with no opt-out exposed in the workspace, user, or extension settings. The user does not want that attribution on the public GitHub repo. Repo-local hooks are the cleanest mitigation: they intercept *every* commit (CLI, agent, IDE) without modifying global git config or fighting the agent runtime. Hooks aren't checked into git, so this hook needs to be re-installed if the repo is freshly cloned — that's documented in `AI_CONTEXT.md` §0.

The previously-pushed Phase 0 commit (`4686d09`) already had the trailer; it was rewritten in-place via `git commit --amend` and force-pushed (`→ fa7e795`). One-time history rewrite, explicitly approved by the user (safety rule allows force-push to main only when the user explicitly requests it).

**See:** `.git/hooks/commit-msg`, `docs/CHANGELOG_DEV.md` 2026-05-16 PM entry.

---

## 17. Next 16 stable accepted over plan's Next 15 stable

**Decision (2026-05-16, Phase 1):** `apps/mvp` was scaffolded with Next.js **16.2.6** (current stable major) instead of the plan's "Next.js 15 stable". React 19.2.4 + Tailwind v4 (`@tailwindcss/postcss`) accepted likewise.

**Rationale:** `pnpm dlx create-next-app@latest` ships 16 as the default. The plan was written before Next 16 GA. App Router semantics are unchanged between 15 and 16; nothing in the MVP scope spec depends on a 15-specific API. Pinning to 16 avoids the legacy `apps/web`'s problem (it was on `15.0.0-rc.0` which had unsupported flags like `--turbopack` — see DECISIONS §6) and keeps us on a long-term-supported major. If anything in Phases 2–5 hits a 16-only regression, we'll downgrade per-phase.

**See:** `apps/mvp/package.json`, `docs/CHANGELOG_DEV.md` 2026-05-16 PM entry.

---

## 18. Pin pnpm `store-dir` to `~/Library/pnpm/store` via root `.npmrc`

**Decision (2026-05-16, Phase 1):** The repo's `.npmrc` sets `store-dir=~/Library/pnpm/store` (the macOS-default global pnpm store). It also sets `auto-install-peers=true` and `strict-peer-dependencies=false`.

**Rationale:** When pnpm is invoked from inside the Cursor sandbox (default `network: limited`, FS write-restricted to the workspace), it cannot write to `~/Library/pnpm/store` and silently falls back to a per-repo `.pnpm-store/v3`. That fallback worked once, then was poisoned by a different (later) agent run that wrote `.claude/settings.local.json` files into extracted package directories like `node_modules/.pnpm/nanoid@3.3.12/node_modules/nanoid/.claude/`. macOS Gatekeeper stamped those files with the `com.apple.provenance` extended attribute. From that point on, every `pnpm install` invocation tries to `copyfile()` those poisoned files out of the in-repo store, gets `EPERM` from TCC, retries indefinitely, and **hangs the entire install with no progress output**. We hit the hang in the prior chat (>7 min) and again at the start of this one. Symptom is identical: install resolves packages, starts copying, then blocks on the first `.claude/`-bearing package.

Pinning `store-dir` to the global path forces pnpm to use the un-poisoned macOS store regardless of sandbox mode. The trade-off is `pnpm install` will fail inside a write-restricted sandbox if the global store needs new packages — that's handled by running install commands with `required_permissions: ["all"]` in agent runs.

**Companion fixes applied at the same time (one-time cleanup, not part of the policy):**
- Deleted the poisoned `.pnpm-store/` and the orphan `apps/web/node_modules/` (full of symlinks pointing at a `node_modules/.pnpm/` tree that didn't exist on disk).
- Cleared `com.apple.provenance` xattrs from `node_modules/` via `xattr -rd com.apple.provenance node_modules` before re-running `rm -rf`. Future agents who hit the same error should run that command first.

**Diagnostic recipe (paste into a fresh chat if `pnpm install` ever hangs again):**
```bash
pnpm store path                         # confirm it points to ~/Library/pnpm/store, NOT .pnpm-store/
ls -la .pnpm-store 2>/dev/null          # if it exists, the .npmrc isn't being honored
xattr -l node_modules/**/.claude/settings.local.json 2>/dev/null | head   # look for com.apple.provenance
```

**See:** `.npmrc`, `docs/CHANGELOG_DEV.md` 2026-05-16 PM #3 entry.

---

## 19. Phase 3 poller architecture: pure classifier + I/O wrapper, no DB mocks in tests

**Decision (2026-05-16, Phase 3):** Each of the 5 pollers in `apps/mvp/src/lib/pollers/` is split into a pure synchronous *classifier* function (e.g. `classifyStablecoinPrices`, `classifyOracleDeviations`, `classifyBridgeReadings`, `classifyAdminTx`, `classifyTvlDrops`) and an async *I/O wrapper* (`pollX(ctx, deps)`) that handles fetch / viem RPC and then delegates to the classifier. Vitest tests cover the classifier with synthetic inputs and the wrapper with a mock `fetch` (when applicable). **Tests do not mock viem and do not touch the live DB.** End-to-end verification (real DB writes, real fanout) is a one-shot smoke script run from a fresh tsx invocation, not a committed test file.

**Rationale:** CURSOR_PROMPT.md "Coding standards" requires "Every poller is unit-testable (vitest): pass a mock fetch, assert alert shape." The classifier seam is the natural place for that: it's the kernel that turns raw observations into `RawAlert[]`, has zero I/O, and is what determines spec compliance (severity thresholds, dependency_key / dependency_field mapping). Mocking viem would require either rebuilding viem's internal RPC plumbing or stubbing `createPublicClient` — both add test complexity without proving spec compliance. Mocking the postgres-js DB layer would prove nothing about the actual fanout query (which is the real risk surface). The live one-shot smoke proves the full pipeline integrates; the unit tests prove the deterministic logic; together they cover the spec without overfitting the test scaffolding.

This pattern is the canonical seam for adding new pollers in Phase 4+ (e.g. an incident-ledger poller pulling rekt.news in a stretch goal). The pure classifier should always be the *first* thing exported.

**See:** `apps/mvp/src/lib/pollers/{stablecoin-depeg,oracle-deviation,bridge-pause,admin-tx,tvl-drop}.ts`, the matching `.test.ts` files, `apps/mvp/src/workers/poll-signals.ts`.

---

## 20. `DependencyField` is a typed union over array AND scalar columns; `computeFanout` branches on it

**Decision (2026-05-16, Phase 3):** `DependencyField` in `apps/mvp/src/lib/pollers/types.ts` is a string-literal union containing both array columns (`stablecoin_dependencies`, `oracle_providers`, `bridge_dependencies`, `chain_deployments`) and scalar columns (`admin_address`, `defillama_slug`). A sibling constant `ARRAY_DEPENDENCY_FIELDS: ReadonlySet<DependencyField>` marks which ones are arrays. `computeFanout(dependency_field, dependency_key)` in `apps/mvp/src/lib/db/queries.ts` checks the set and dispatches:
- Array fields → `WHERE ${sql(field)} && ARRAY[${key}]::text[]` (hits the existing GIN indexes from Phase 0).
- Scalar fields → `WHERE ${sql(field)} = ${key}` (B-tree on `admin_address`, plain table scan acceptable for `defillama_slug`).

**Rationale:** Two of the five Phase 3 pollers emit alerts that don't fit the "shared external dependency in an array column" mental model:
- `admin_tx` keys on `admin_address` (a scalar). Multiple entities can share the same multisig as admin (e.g. several Aave protocols controlled by the same Gnosis Safe), so fanout > 1 is legitimate.
- `tvl_drop` keys on `defillama_slug` (also scalar). Each protocol has its own slug; fanout is typically 1 but the same query path generalizes if a future poller emits multiple alerts per slug.

Refusing to model these would force the orchestrator to special-case admin_tx and tvl_drop. Threading both through the same `dependency_field` discriminator keeps `runPollers` simple and lets Phase 4's contagion view reuse `computeFanout` uniformly. The CHECK constraint on `chaindrain.alert.signal_type` doesn't constrain `dependency_field`, so the schema doesn't have to change when we add a new dependency-shape category later.

**See:** `apps/mvp/src/lib/pollers/types.ts:DependencyField`, `apps/mvp/src/lib/db/queries.ts:computeFanout`, `supabase/migrations/20260517000000_alerts.sql`.

---

## 21. `runPollers` writes per-alert, not per-poller; no wrapping transaction

**Decision (2026-05-16, Phase 3):** The orchestrator at `apps/mvp/src/workers/poll-signals.ts` persists each alert independently inside the per-poller loop: compute fanout → `insertAlert` → push to `persisted` array. A failed `insertAlert` for one alert is caught with `console.error` and does not block the rest. No outer `BEGIN/COMMIT` wraps the run.

**Rationale:** CURSOR_PROMPT.md says "for each alert: compute `fanout_count` and `fanout_tvl_usd` ... Persist alert + fanout numbers atomically." Atomicity at the *row* level — fanout numbers and the alert row written in the same INSERT — is what the spec actually requires; the prose doesn't imply wrapping the whole 5-poller run in a transaction. A run-wide transaction would (a) hold a long-lived connection across slow external HTTP calls (CoinGecko, Etherscan rate-limited, etc.), increasing the chance of pooler timeouts on the Supavisor transaction-mode pooler, and (b) cause one flaky alert insert to nuke an otherwise good run's data.

Per-alert writes also give Phase 4's `/alerts` UI the most-recent-first ordering for free even if a cron run partially fails — the persisted alerts show up immediately, the failed ones get retried 5 minutes later when the next cron fires.

**See:** `apps/mvp/src/workers/poll-signals.ts:runPollers`, `apps/mvp/src/lib/db/queries.ts:insertAlert`.

---

## 22. Cron route hard-fails when `CRON_SECRET` is unset (500), not silently disables

**Decision (2026-05-16, Phase 3):** `apps/mvp/src/app/api/cron/poll/route.ts` returns HTTP 500 with `{ ok: false, error: "cron_secret_not_configured" }` when `CRON_SECRET` is absent, *before* the auth check. It does not fall back to "any caller is allowed" or "skip the run".

**Rationale:** A misconfigured cron is a deploy-time bug, not a runtime condition. Returning 500 makes Vercel's cron dashboard mark the schedule as failing, which is the loudest possible "fix me" signal. Returning 200 with `skipped: true` would mask the misconfiguration and the operator wouldn't notice until they queried the empty `chaindrain.alert` table. Returning 401 would be misleading — there's no "wrong credential" to fix, the credential simply doesn't exist server-side.

The pollers themselves degrade gracefully on missing optional config: `admin-tx` logs a `console.warn` and returns empty when `ETHERSCAN_API_KEY` is unset; the others have hard-coded free public endpoints. The hard fail is reserved for the *route-level secret* that gates the entire cron path.

**See:** `apps/mvp/src/app/api/cron/poll/route.ts`.

---

## 23. Schedule the DETECT cron from GitHub Actions, not Vercel Cron

**Decision (2026-05-16, post-Phase-3 deploy fix):** The 5-minute poller cadence is driven by a GitHub Actions workflow (`.github/workflows/cron-poll.yml`) at `schedule: "*/5 * * * *"`, which `curl`s the deployed `https://chaindrain-mvp.vercel.app/api/cron/poll` with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`. `apps/mvp/vercel.json` no longer declares a `crons` entry; the file was deleted.

**Rationale:** The Vercel project is on the **Hobby plan**, which rejects any cron expression that would fire more than once per day at *deploy time* with the error `Hobby accounts are limited to daily cron jobs`. Our spec requires a 5-minute cadence, so Vercel Cron is incompatible without upgrading to Pro ($20/mo). The first Phase 3 push (commit `fee1948`) failed for exactly this reason — `Vercel – chaindrain-mvp` reported `failure` against the commit while the legacy `chaindrain` project deployed normally (no cron declared there), which surfaced as "the wrong project deployed" from the user's perspective.

GitHub Actions cron is the closest substitute that:
- Costs $0 (the repo is public, so Actions minutes are unmetered).
- Keeps the route + auth + orchestrator code identical (Vercel still hosts and authenticates the run; only the trigger source moved).
- Surfaces run history in the Actions tab with full logs of the poll route's JSON response.
- Supports `workflow_dispatch` for ad-hoc manual triggers (with an optional `target_url` input for preview deployments).
- Can be flipped back to Vercel Cron later by re-adding the `crons` entry once on Pro — the route is unchanged.

**Known limitation:** GitHub Actions cron has up-to-15-min jitter under load; the spec says "every 5 min", but the underlying acceptance criterion ("5 pollers all run successfully on the cron without errors for 24h straight") only requires regular execution, not exact 5-min cadence. Pyth/Chainlink staleness windows are far longer than 15 min, so the detection mission is preserved.

**Alternative considered: Supabase pg_cron + pg_net.** The pg_cron extension is still installed in our project (Phase 0 only unscheduled the jobs). It'd give us exact 5-min cadence and run the trigger from the same infra as the data, but requires pasting the `CRON_SECRET` into Supabase Vault and writing a pg_net job — more setup, less log visibility (no equivalent of the Actions UI). Re-evaluate if we ever migrate the DB to a paid Supabase tier with full pg_cron observability.

**Cleanup shipped in the same commit:** dropped `api-lint` and `agent-lint` jobs from `.github/workflows/ci.yml` (their `apps/api/` and `apps/agent/` directories were deleted in Phase 0); dropped the noisy `web-lint-typecheck` (apps/web is frozen rollback parachute); added a real `mvp` job running `lint + typecheck + test` for the active surface.

**See:** `.github/workflows/cron-poll.yml`, `.github/workflows/ci.yml`, `docs/AI_CONTEXT.md` §9 (Vercel project routing & deploy ops).
