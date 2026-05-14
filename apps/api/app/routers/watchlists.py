"""Watchlist endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import CurrentUser, get_current_user
from app.models import Company
from app.supabase_client import admin_client

router = APIRouter(tags=["watchlists"])


@router.get("/watchlists", response_model=list[Company])
async def list_my_watchlist(user: CurrentUser = Depends(get_current_user)) -> list[Company]:
    client = admin_client()
    rows = (
        client.table("watchlists")
        .select("company_id, companies(*)")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [Company.model_validate(r["companies"]) for r in rows if r.get("companies")]


@router.post("/watchlists/{company_id}", status_code=201)
async def add_to_watchlist(
    company_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    client = admin_client()
    exists = (
        client.table("companies")
        .select("id")
        .eq("id", company_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Company not found")

    client.table("watchlists").upsert(
        {"user_id": user.id, "company_id": company_id},
        on_conflict="user_id,company_id",
    ).execute()
    return {"status": "watched", "company_id": company_id}


@router.delete("/watchlists/{company_id}", status_code=204)
async def remove_from_watchlist(
    company_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> None:
    client = admin_client()
    (
        client.table("watchlists")
        .delete()
        .eq("user_id", user.id)
        .eq("company_id", company_id)
        .execute()
    )
