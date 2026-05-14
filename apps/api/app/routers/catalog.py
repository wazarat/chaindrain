"""Read-only catalog endpoints: /sectors, /subsectors, /companies."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import Company, Page, Sector, Subsector
from app.supabase_client import public_client

router = APIRouter(tags=["catalog"])


@router.get("/sectors", response_model=list[Sector])
async def list_sectors() -> list[Sector]:
    res = public_client().table("sectors").select("*").order("name").execute()
    return [Sector.model_validate(r) for r in (res.data or [])]


@router.get("/subsectors", response_model=list[Subsector])
async def list_subsectors(sector_id: str | None = None) -> list[Subsector]:
    q = public_client().table("subsectors").select("*").order("name")
    if sector_id:
        q = q.eq("sector_id", sector_id)
    res = q.execute()
    return [Subsector.model_validate(r) for r in (res.data or [])]


@router.get("/companies", response_model=Page[Company])
async def list_companies(
    subsector_id: str | None = None,
    sector_id: str | None = None,
    q: str | None = Query(default=None, description="Fuzzy name match"),
    limit: int = Query(default=50, le=200),
    cursor: str | None = None,
) -> Page[Company]:
    client = public_client()
    query = client.table("companies").select("*").order("name").limit(limit + 1)

    if subsector_id:
        query = query.eq("subsector_id", subsector_id)
    elif sector_id:
        # Resolve subsector ids in that sector first.
        subs = (
            client.table("subsectors")
            .select("id")
            .eq("sector_id", sector_id)
            .execute()
            .data
            or []
        )
        ids = [s["id"] for s in subs]
        if not ids:
            return Page[Company](items=[], next_cursor=None)
        query = query.in_("subsector_id", ids)

    if q:
        query = query.ilike("name", f"%{q}%")

    if cursor:
        query = query.gt("name", cursor)

    res = query.execute()
    rows = res.data or []
    next_cursor = rows[limit]["name"] if len(rows) > limit else None
    items = [Company.model_validate(r) for r in rows[:limit]]
    return Page[Company](items=items, next_cursor=next_cursor)


@router.get("/companies/{slug}", response_model=Company)
async def get_company(slug: str) -> Company:
    res = (
        public_client()
        .table("companies")
        .select("*")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Company not found")
    return Company.model_validate(rows[0])
