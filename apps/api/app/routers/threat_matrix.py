"""Threat-matrix endpoint backed by mv_threat_matrix."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user_optional
from app.models import EvidenceClass, Subsector, ThreatCell, ThreatMatrix
from app.supabase_client import admin_client

router = APIRouter(tags=["threat_matrix"])


@router.get("/threat-matrix", response_model=ThreatMatrix)
async def get_threat_matrix(
    _user: CurrentUser | None = Depends(get_current_user_optional),
) -> ThreatMatrix:
    client = admin_client()
    cells_raw = client.table("mv_threat_matrix").select("*").execute().data or []
    subsectors_raw = client.table("subsectors").select("*").order("name").execute().data or []

    cells = [ThreatCell.model_validate(c) for c in cells_raw]
    subsectors = [Subsector.model_validate(s) for s in subsectors_raw]
    evidence_classes = list(EvidenceClass)
    return ThreatMatrix(cells=cells, subsectors=subsectors, evidence_classes=evidence_classes)


@router.post("/threat-matrix/refresh")
async def refresh_matrix(_user: CurrentUser | None = Depends(get_current_user_optional)) -> dict[str, str]:
    client = admin_client()
    client.rpc("refresh_threat_matrix").execute()
    return {"status": "refreshed"}
