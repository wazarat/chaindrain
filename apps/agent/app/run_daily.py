"""Daily Comet run.

Flow:
1. Open agent_runs row (status=running).
2. For each source in sources.json:
   - Try Comet (Perplexity API)
   - On failure or empty -> Playwright fallback
3. Classify findings with the deterministic post-processor.
4. Embed each (best-effort).
5. Insert events + sources + company refs via the service-role-key Supabase client.
6. Close agent_runs row with status + counts.

Run locally:
    uv run python -m app.run_daily --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from supabase import Client, create_client

from app.classifier import RawFinding, classify
from app.comet import fetch_findings as comet_fetch
from app.config import get_settings
from app.embedder import embed
from app.playwright_fallback import fetch_headlines as pw_fetch

logger = logging.getLogger("chaindrain.agent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SOURCES_PATH = Path(__file__).resolve().parent / "sources.json"


def _load_sources() -> list[dict[str, Any]]:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def _build_company_slug_index(client: Client) -> dict[str, str]:
    rows = client.table("companies").select("id, slug").execute().data or []
    return {r["slug"].lower(): r["id"] for r in rows}


async def _gather_findings(
    sources: list[dict[str, Any]],
    pplx_key: str | None,
) -> list[tuple[dict[str, Any], list[RawFinding]]]:
    out: list[tuple[dict[str, Any], list[RawFinding]]] = []
    for src in sources:
        findings: list[RawFinding] = []
        if pplx_key:
            try:
                findings = await comet_fetch(pplx_key, src["url"], src.get("freshness_hours", 168))
            except Exception as exc:
                logger.warning("comet failed for %s: %s", src["slug"], exc)
        if not findings:
            try:
                findings = await pw_fetch(src["slug"], src["url"])
            except Exception as exc:
                logger.warning("playwright failed for %s: %s", src["slug"], exc)
        logger.info("source=%s findings=%d", src["slug"], len(findings))
        out.append((src, findings))
    return out


async def _ingest(
    client: Client,
    findings_by_source: list[tuple[dict[str, Any], list[RawFinding]]],
    slug_index: dict[str, str],
    *,
    embed_key: str | None,
    dry_run: bool,
) -> int:
    inserted = 0
    for src, findings in findings_by_source:
        for raw in findings:
            draft = classify(raw, slug_index)
            if not draft:
                continue
            payload = {
                "title": draft.title,
                "summary": draft.summary,
                "evidence_class": draft.evidence_class,
                "severity": draft.severity,
                "status": draft.status,
                "occurred_at": draft.occurred_at.isoformat() if draft.occurred_at else None,
                "primary_company_id": draft.primary_company_id,
                "meta": {**draft.meta, "source_slug": src["slug"]},
            }
            if embed_key:
                try:
                    payload["embedding"] = await embed(
                        f"{draft.title}\n{draft.summary}", embed_key
                    )
                except Exception as exc:
                    logger.warning("embed failed: %s", exc)

            if dry_run:
                logger.info("DRY-RUN would insert: %s", draft.title)
                inserted += 1
                continue

            ev_res = client.table("events").insert(payload).execute()
            ev_rows = ev_res.data or []
            if not ev_rows:
                logger.warning("event insert returned empty: %s", draft.title)
                continue
            event_id = ev_rows[0]["id"]

            if draft.sources:
                client.table("event_sources").insert(
                    [{"event_id": event_id, "url": u} for u in draft.sources]
                ).execute()
            if draft.company_refs:
                client.table("event_companies").insert(
                    [{"event_id": event_id, **ref} for ref in draft.company_refs]
                ).execute()
            inserted += 1
    return inserted


def run(dry_run: bool = False, limit_sources: int | None = None) -> int:
    """Execute the daily ingestion run.

    Callable in-process (e.g. from FastAPI BackgroundTasks) without touching sys.argv.
    Returns the number of events inserted (or would-have-inserted, in dry-run mode).
    """
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_service_role_key)

    sources = _load_sources()
    if limit_sources:
        sources = sources[:limit_sources]
    logger.info("loaded %d sources", len(sources))

    slug_index = _build_company_slug_index(client)
    logger.info("loaded %d companies", len(slug_index))

    started = datetime.now(UTC)
    if not dry_run:
        run_res = (
            client.table("agent_runs")
            .insert({"status": "running", "started_at": started.isoformat()})
            .execute()
        )
        run_id = (run_res.data or [{}])[0].get("id")
    else:
        run_id = None

    t0 = time.time()
    findings_by_source = asyncio.run(_gather_findings(sources, s.perplexity_api_key))
    inserted = asyncio.run(
        _ingest(
            client,
            findings_by_source,
            slug_index,
            embed_key=s.openai_api_key,
            dry_run=dry_run,
        )
    )
    elapsed = time.time() - t0

    if not dry_run and run_id:
        client.table("agent_runs").update(
            {
                "status": "success" if inserted > 0 else "partial",
                "ended_at": datetime.now(UTC).isoformat(),
                "found_count": inserted,
                "meta": {"elapsed_seconds": elapsed, "sources": [s["slug"] for s, _ in findings_by_source]},
            }
        ).eq("id", run_id).execute()

    logger.info("done. inserted=%d elapsed=%.1fs", inserted, elapsed)
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit-sources", type=int, default=None)
    args = parser.parse_args()
    run(dry_run=args.dry_run, limit_sources=args.limit_sources)
    return 0


if __name__ == "__main__":
    sys.exit(main())
