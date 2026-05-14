"""/me endpoint - returns the authenticated user's profile."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import CurrentUser, get_current_user
from app.models import Profile
from app.supabase_client import admin_client

router = APIRouter(tags=["me"])


@router.get("/me", response_model=Profile)
async def get_me(user: CurrentUser = Depends(get_current_user)) -> Profile:
    client = admin_client()
    result = (
        client.table("profiles")
        .select("id, role, display_name, created_at, updated_at")
        .eq("id", user.id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        # Trigger should have created it; create lazily if missing.
        client.table("profiles").insert(
            {"id": user.id, "display_name": user.email.split("@")[0] if user.email else None}
        ).execute()
        result = (
            client.table("profiles")
            .select("id, role, display_name, created_at, updated_at")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(status_code=500, detail="Could not load profile")

    return Profile.model_validate(rows[0])
