"""/me endpoint - returns the authenticated user's profile."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import CurrentUser, get_current_user
from app.models import Profile
from app.supabase_client import user_client

router = APIRouter(tags=["me"])


@router.get("/me", response_model=Profile)
async def get_me(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> Profile:
    auth = request.headers.get("authorization", "")
    jwt = auth.removeprefix("Bearer ").strip()
    client = user_client(jwt)
    result = (
        client.table("profiles")
        .select("id, role, display_name, created_at, updated_at")
        .eq("id", user.id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        # The on_auth_user_created trigger creates the profile; if it's missing
        # something is wrong with the auth pipeline (or the user's JWT is stale).
        raise HTTPException(
            status_code=404,
            detail="Profile not found; sign out and sign in again",
        )

    return Profile.model_validate(rows[0])
