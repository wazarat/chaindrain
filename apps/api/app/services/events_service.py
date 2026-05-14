"""Event create/read helpers shared between the public API and the agent."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from supabase import Client

from app.auth import CurrentUser
from app.models import (
    EventCompanyRef,
    EventDraft,
    EventSource,
    EventWithRelations,
)


def require_admin(user: CurrentUser) -> None:
    """Raises 403 if the user is not an admin in `public.profiles`."""
    from app.supabase_client import admin_client

    res = (
        admin_client()
        .table("profiles")
        .select("role")
        .eq("id", user.id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows or rows[0].get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def fetch_event_relations(
    client: Client, event_id: str
) -> tuple[list[EventSource], list[EventCompanyRef]]:
    sources = (
        client.table("event_sources")
        .select("*")
        .eq("event_id", event_id)
        .order("captured_at")
        .execute()
        .data
        or []
    )
    refs = (
        client.table("event_companies")
        .select("company_id, role")
        .eq("event_id", event_id)
        .execute()
        .data
        or []
    )
    return (
        [EventSource.model_validate(s) for s in sources],
        [EventCompanyRef.model_validate(r) for r in refs],
    )


def create_event_with_relations(client: Client, draft: EventDraft) -> EventWithRelations:
    """Insert the event + sources + company refs in a best-effort sequence.

    The Supabase REST client does not support multi-statement transactions, but
    each statement is atomic. Failure of a child insert raises an HTTPException;
    the caller may choose to retry / clean up.
    """
    # Auto-promote status if >=2 sources, otherwise force unverified.
    status = draft.status.value
    if len(draft.sources) < 2 and draft.status.value == "unverified":
        status = "unverified"
    elif len(draft.sources) >= 2 and draft.status.value == "unverified":
        status = "corroborated"

    payload: dict[str, Any] = {
        "title": draft.title,
        "summary": draft.summary,
        "evidence_class": draft.evidence_class.value,
        "severity": draft.severity.value,
        "status": status,
        "occurred_at": draft.occurred_at.isoformat() if draft.occurred_at else None,
        "primary_company_id": draft.primary_company_id,
        "meta": draft.meta,
    }
    inserted = client.table("events").insert(payload).execute()
    rows = inserted.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Insert failed")
    event_row = rows[0]
    event_id = event_row["id"]

    if draft.sources:
        client.table("event_sources").insert(
            [{"event_id": event_id, "url": url} for url in draft.sources]
        ).execute()

    if draft.company_refs:
        client.table("event_companies").insert(
            [
                {
                    "event_id": event_id,
                    "company_id": ref.company_id,
                    "role": ref.role.value,
                }
                for ref in draft.company_refs
            ]
        ).execute()
    elif draft.primary_company_id:
        # Always include the primary company so fan-out fires.
        client.table("event_companies").insert(
            {
                "event_id": event_id,
                "company_id": draft.primary_company_id,
                "role": "victim",
            }
        ).execute()

    sources, refs = fetch_event_relations(client, event_id)
    return EventWithRelations.model_validate(
        {**event_row, "sources": sources, "companies": refs}
    )
