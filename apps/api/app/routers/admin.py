"""Admin-gated routes: agent runs, source list management, bulk ops."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException

from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.models import AgentRun
from app.services.events_service import require_admin
from app.supabase_client import admin_client

router = APIRouter(tags=["admin"], prefix="/admin")


@router.get("/agent_runs", response_model=list[AgentRun])
async def list_agent_runs(
    user: CurrentUser = Depends(get_current_user),
    limit: int = 20,
) -> list[AgentRun]:
    require_admin(user)
    rows = (
        admin_client()
        .table("agent_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [AgentRun.model_validate(r) for r in rows]


@router.post("/agent_runs/trigger")
async def trigger_agent_run(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    """Manually trigger the Comet agent worker.

    Body may contain:
      sources_only: list[str]  (limit which source slugs to run)
      dry_run: bool            (worker should not insert into events)
    """
    require_admin(user)
    if not settings.agent_run_url or not settings.agent_hmac_secret:
        raise HTTPException(
            status_code=503,
            detail="Agent endpoint not configured (AGENT_RUN_URL / AGENT_HMAC_SECRET)",
        )
    body = json.dumps({"trigger": "admin", **payload}).encode()
    sig = hmac.new(settings.agent_hmac_secret.encode(), body, hashlib.sha256).hexdigest()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            settings.agent_run_url,
            content=body,
            headers={
                "content-type": "application/json",
                "x-chaindrain-signature": sig,
                "x-chaindrain-trigger": "admin",
            },
        )
        return {"status": resp.status_code, "body": resp.text[:512]}


@router.get("/sources")
async def list_sources(user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    require_admin(user)
    # Sources are stored as a singleton row in agent_runs.meta.sources[],
    # mirrored from apps/agent/app/sources.json. The worker is the source of truth.
    sources_path = os.environ.get("AGENT_SOURCES_PATH", "apps/agent/app/sources.json")
    try:
        with open(sources_path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return []


@router.post("/companies/bulk_classify")
async def bulk_classify(
    user: CurrentUser = Depends(get_current_user),
    company_ids: list[str] = Body(..., embed=True),
    new_subsector_id: str = Body(..., embed=True),
) -> dict[str, int]:
    require_admin(user)
    res = (
        admin_client()
        .table("companies")
        .update({"subsector_id": new_subsector_id})
        .in_("id", company_ids)
        .execute()
    )
    return {"updated": len(res.data or [])}


@router.post("/agent_runs/{run_id}/finalize")
async def finalize_run(
    run_id: str,
    user: CurrentUser = Depends(get_current_user),
    status: str = Body(..., embed=True),
    found_count: int = Body(0, embed=True),
    cost_cents: int = Body(0, embed=True),
    log_path: str | None = Body(None, embed=True),
) -> dict[str, str]:
    require_admin(user)
    admin_client().table("agent_runs").update(
        {
            "status": status,
            "found_count": found_count,
            "cost_cents": cost_cents,
            "log_path": log_path,
            "ended_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", run_id).execute()
    return {"status": "ok"}
