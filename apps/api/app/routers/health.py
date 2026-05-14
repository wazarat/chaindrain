"""Health and self-check endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models import Health

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=Health)
async def healthz(settings: Settings = Depends(get_settings)) -> Health:
    return Health(environment=settings.environment)
