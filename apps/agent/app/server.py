"""Agent HTTP server.

Receives HMAC-signed POSTs from:
- The Supabase Edge Function `cron-trigger` (daily 13:00 UTC)
- The chaindrain-api admin endpoint (manual trigger)

The server runs `run_daily.main()` in a background task so the request returns
immediately. The caller should poll `agent_runs` to track progress.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from functools import partial

import sentry_sdk
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

from app.config import get_settings

logger = logging.getLogger("chaindrain.agent.server")
logging.basicConfig(level=logging.INFO)


def _init_sentry() -> None:
    s = get_settings()
    if s.sentry_dsn:
        sentry_sdk.init(dsn=s.sentry_dsn, environment=s.environment, traces_sample_rate=0.1)


_init_sentry()
app = FastAPI(title="Chaindrain Agent", version="0.1.0")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


def _verify(body: bytes, signature: str | None) -> None:
    secret = get_settings().agent_hmac_secret
    if not signature:
        raise HTTPException(401, "Missing signature")
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Bad signature")


async def _run_daily(dry_run: bool = False, limit_sources: int | None = None) -> None:
    """Run the daily job in-process."""
    from app import run_daily as rd  # local to keep import-time light

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, partial(rd.run, dry_run=dry_run, limit_sources=limit_sources)
    )


@app.post("/run")
async def run(
    request: Request,
    background: BackgroundTasks,
    x_chaindrain_signature: str | None = Header(default=None),
) -> dict[str, object]:
    body = await request.body()
    _verify(body, x_chaindrain_signature)

    dry_run = False
    limit_sources: int | None = None
    if body:
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "Invalid JSON body") from exc
        if isinstance(parsed, dict):
            dry_run = bool(parsed.get("dry_run", False))
            raw_limit = parsed.get("limit_sources")
            if raw_limit is not None:
                try:
                    limit_sources = int(raw_limit)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(400, "limit_sources must be an integer") from exc

    logger.info("scheduling run dry_run=%s limit_sources=%s", dry_run, limit_sources)
    background.add_task(_run_daily, dry_run=dry_run, limit_sources=limit_sources)
    return {"status": "scheduled", "dry_run": dry_run, "limit_sources": limit_sources}
