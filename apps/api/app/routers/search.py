"""Hybrid search endpoint: pgvector + Postgres FTS via SQL RPC."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.models import EvidenceClass, Severity
from app.services.embedding import embed_text
from app.supabase_client import admin_client

router = APIRouter(tags=["search"])


@router.get("/search/events")
async def search_events(
    q: str | None = Query(default=None, description="Free-text query"),
    sector_id: str | None = None,
    subsector_id: str | None = None,
    evidence_class: EvidenceClass | None = None,
    severity: Severity | None = None,
    since: datetime | None = None,
    limit: int = Query(default=50, le=200),
    use_vector: bool = True,
) -> list[dict[str, Any]]:
    embedding = None
    if q and use_vector:
        try:
            embedding = await embed_text(q)
        except Exception:
            embedding = None

    params = {
        "p_query": q,
        "p_embedding": embedding,
        "p_limit": limit,
        "p_sector_id": sector_id,
        "p_subsector_id": subsector_id,
        "p_evidence_class": evidence_class.value if evidence_class else None,
        "p_severity": severity.value if severity else None,
        "p_since": since.isoformat() if since else None,
    }
    try:
        res = admin_client().rpc("search_events", params).execute()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return res.data or []
