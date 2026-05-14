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
import logging

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


async def _run_daily() -> None:
    """Run the daily job in-process."""
    from app import run_daily as rd  # local to keep import-time light

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, rd.main)


@app.post("/run")
async def run(
    request: Request,
    background: BackgroundTasks,
    x_chaindrain_signature: str | None = Header(default=None),
) -> dict[str, str]:
    body = await request.body()
    _verify(body, x_chaindrain_signature)
    background.add_task(_run_daily)
    return {"status": "scheduled"}
