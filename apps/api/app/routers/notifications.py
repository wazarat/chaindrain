"""Per-user notifications inbox."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, Query, Request

from app.auth import CurrentUser, get_current_user
from app.models import Notification, NotificationKind, Page, Severity
from app.supabase_client import user_client


def _user_jwt(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return auth.removeprefix("Bearer ").strip()

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=Page[Notification])
async def list_notifications(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    unread_only: bool = False,
    kind: NotificationKind | None = None,
    severity: Severity | None = None,
    limit: int = Query(default=50, le=200),
    cursor: str | None = None,
) -> Page[Notification]:
    client = user_client(_user_jwt(request))
    q = (
        client.table("notifications")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit + 1)
    )
    if unread_only:
        q = q.is_("read_at", "null")
    if kind:
        q = q.eq("kind", kind.value)
    if cursor:
        q = q.lt("created_at", cursor)

    rows = q.execute().data or []
    _ = user  # used implicitly via JWT-scoped RLS

    if severity is not None:
        # Filter by joining event severity (events are public).
        event_ids = [r["event_id"] for r in rows if r.get("event_id")]
        if event_ids:
            sev_rows = (
                client.table("events")
                .select("id, severity")
                .in_("id", event_ids)
                .execute()
                .data
                or []
            )
            sev_index = {row["id"]: row["severity"] for row in sev_rows}
            order = ["info", "low", "medium", "high", "critical"]
            min_idx = order.index(severity.value)
            rows = [
                r
                for r in rows
                if not r.get("event_id")
                or sev_index.get(r["event_id"], "info") in order[min_idx:]
            ]

    next_cursor = rows[limit]["created_at"] if len(rows) > limit else None
    items = [Notification.model_validate(r) for r in rows[:limit]]
    return Page[Notification](items=items, next_cursor=next_cursor)


@router.get("/notifications/unread_count")
async def unread_count(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, int]:
    res = (
        user_client(_user_jwt(request))
        .table("notifications")
        .select("id", count="exact")
        .is_("read_at", "null")
        .execute()
    )
    return {"count": int(res.count or 0)}


@router.post("/notifications/{notification_id}/read")
async def mark_read(
    notification_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    user_client(_user_jwt(request)).table("notifications").update(
        {"read_at": datetime.now(UTC).isoformat()}
    ).eq("id", notification_id).execute()
    return {"status": "ok"}


@router.post("/notifications/read_all")
async def mark_all_read(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    only_kind: NotificationKind | None = Body(default=None, embed=True),
) -> dict[str, str]:
    q = (
        user_client(_user_jwt(request))
        .table("notifications")
        .update({"read_at": datetime.now(UTC).isoformat()})
        .is_("read_at", "null")
    )
    if only_kind:
        q = q.eq("kind", only_kind.value)
    q.execute()
    return {"status": "ok"}
