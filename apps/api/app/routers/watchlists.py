"""Watchlist endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import CurrentUser, get_current_user
from app.models import Company
from app.supabase_client import public_client, user_client


def _user_jwt(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return auth.removeprefix("Bearer ").strip()

router = APIRouter(tags=["watchlists"])


@router.get("/watchlists", response_model=list[Company])
async def list_my_watchlist(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> list[Company]:
    client = user_client(_user_jwt(request))
    rows = (
        client.table("watchlists")
        .select("company_id, companies(*)")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [Company.model_validate(r["companies"]) for r in rows if r.get("companies")]


@router.post("/watchlists/{company_id}", status_code=201)
async def add_to_watchlist(
    company_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    exists = (
        public_client()
        .table("companies")
        .select("id")
        .eq("id", company_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Company not found")

    user_client(_user_jwt(request)).table("watchlists").upsert(
        {"user_id": user.id, "company_id": company_id},
        on_conflict="user_id,company_id",
    ).execute()
    return {"status": "watched", "company_id": company_id}


@router.delete("/watchlists/{company_id}", status_code=204)
async def remove_from_watchlist(
    company_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> None:
    client = user_client(_user_jwt(request))
    (
        client.table("watchlists")
        .delete()
        .eq("company_id", company_id)
        .execute()
    )
