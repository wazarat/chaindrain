"""Events endpoints.

- GET /events           : list (filterable, paginated)
- GET /events/{id}      : single event with sources + companies
- POST /events          : admin-only create (used by Comet agent worker too)
- PATCH /events/{id}/status : admin-only status transition
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user
from app.models import (
    Event,
    EventDraft,
    EventStatusPatch,
    EventWithRelations,
    EvidenceClass,
    Page,
    Severity,
)
from app.services.events_service import (
    create_event_with_relations,
    fetch_event_relations,
    require_admin,
)
from app.supabase_client import admin_client, public_client

router = APIRouter(tags=["events"])


_SEVERITY_ORDER = {
    Severity.info: 0,
    Severity.low: 1,
    Severity.medium: 2,
    Severity.high: 3,
    Severity.critical: 4,
}


@router.get("/events", response_model=Page[Event])
async def list_events(
    sector_id: str | None = None,
    subsector_id: str | None = None,
    evidence_class: EvidenceClass | None = None,
    severity: Severity | None = Query(default=None, description="Minimum severity"),
    since: datetime | None = None,
    limit: int = Query(default=50, le=200),
    cursor: str | None = Query(default=None, description="ISO timestamp cursor (detected_at)"),
) -> Page[Event]:
    client = public_client()
    query = (
        client.table("events")
        .select("*")
        .order("detected_at", desc=True)
        .limit(limit + 1)
    )

    if evidence_class:
        query = query.eq("evidence_class", evidence_class.value)
    if severity:
        allowed = [s.value for s, order in _SEVERITY_ORDER.items() if order >= _SEVERITY_ORDER[severity]]
        query = query.in_("severity", allowed)
    if since:
        query = query.gte("detected_at", since.isoformat())
    if cursor:
        query = query.lt("detected_at", cursor)

    # Sector / subsector filtering happens via the primary_company_id join.
    if subsector_id or sector_id:
        sub_ids: list[str] = []
        if subsector_id:
            sub_ids = [subsector_id]
        else:
            subs = (
                client.table("subsectors")
                .select("id")
                .eq("sector_id", sector_id)
                .execute()
                .data
                or []
            )
            sub_ids = [s["id"] for s in subs]
        if not sub_ids:
            return Page[Event](items=[], next_cursor=None)
        company_rows = (
            client.table("companies")
            .select("id")
            .in_("subsector_id", sub_ids)
            .execute()
            .data
            or []
        )
        company_ids = [c["id"] for c in company_rows]
        if not company_ids:
            return Page[Event](items=[], next_cursor=None)
        query = query.in_("primary_company_id", company_ids)

    rows = query.execute().data or []
    next_cursor = rows[limit]["detected_at"] if len(rows) > limit else None
    items = [Event.model_validate(r) for r in rows[:limit]]
    return Page[Event](items=items, next_cursor=next_cursor)


@router.get("/events/{event_id}", response_model=EventWithRelations)
async def get_event(event_id: str) -> EventWithRelations:
    client = public_client()
    res = client.table("events").select("*").eq("id", event_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Event not found")
    base = rows[0]
    sources, companies = fetch_event_relations(client, event_id)
    return EventWithRelations.model_validate(
        {**base, "sources": sources, "companies": companies}
    )


@router.post("/events", response_model=EventWithRelations, status_code=201)
async def create_event(
    draft: Annotated[EventDraft, Body(...)],
    user: CurrentUser = Depends(get_current_user),
) -> EventWithRelations:
    require_admin(user)
    return create_event_with_relations(admin_client(), draft)


@router.patch("/events/{event_id}/status", response_model=Event)
async def patch_status(
    event_id: str,
    patch: EventStatusPatch,
    user: CurrentUser = Depends(get_current_user),
) -> Event:
    require_admin(user)
    client = admin_client()
    res = (
        client.table("events")
        .update({"status": patch.status.value})
        .eq("id", event_id)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Event not found")
    return Event.model_validate(rows[0])
