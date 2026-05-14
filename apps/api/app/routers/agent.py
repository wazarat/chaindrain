"""Agent-facing endpoints.

These are called by the Comet worker (apps/agent) via HMAC-signed POSTs.
The worker uses the service-role-key for direct Supabase writes; this
endpoint exists so that the API can act as an audit trail and so that
the FE can display agent activity without granting it service-role-key.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.config import Settings, get_settings
from app.models import EventDraft, EventWithRelations
from app.services.events_service import create_event_with_relations
from app.supabase_client import admin_client

router = APIRouter(tags=["agent"], prefix="/agent")


def _verify_hmac(body: bytes, signature: str | None, secret: str | None) -> None:
    if not secret:
        raise HTTPException(status_code=503, detail="AGENT_HMAC_SECRET not configured")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature")
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Bad signature")


@router.post("/runs/start")
async def start_run(
    request: Request,
    settings: Settings = Depends(get_settings),
    x_chaindrain_signature: str | None = Header(default=None),
) -> dict[str, str]:
    body = await request.body()
    _verify_hmac(body, x_chaindrain_signature, settings.agent_hmac_secret)
    res = (
        admin_client()
        .table("agent_runs")
        .insert({"status": "running", "started_at": datetime.now(UTC).isoformat()})
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to insert run")
    return {"id": rows[0]["id"]}


@router.post("/events", response_model=EventWithRelations)
async def ingest_event(
    request: Request,
    draft: EventDraft,
    settings: Settings = Depends(get_settings),
    x_chaindrain_signature: str | None = Header(default=None),
) -> EventWithRelations:
    body = await request.body()
    _verify_hmac(body, x_chaindrain_signature, settings.agent_hmac_secret)
    return create_event_with_relations(admin_client(), draft)
