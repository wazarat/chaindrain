"""Pydantic v2 models that mirror the Supabase schema.

These are the single source of truth for both the FastAPI surface and the
generated TypeScript types in `packages/shared-types`.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


# ----------------------------- Enums -----------------------------


class EvidenceClass(str, Enum):
    protocol_exploit = "protocol_exploit"
    operational_compromise = "operational_compromise"
    market_event = "market_event"
    regulatory = "regulatory"
    governance = "governance"
    disclosure = "disclosure"
    other = "other"


class Severity(str, Enum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class EventStatus(str, Enum):
    unverified = "unverified"
    corroborated = "corroborated"
    confirmed = "confirmed"
    retracted = "retracted"


class ProfileRole(str, Enum):
    user = "user"
    admin = "admin"


class NotificationKind(str, Enum):
    watched_company_event = "watched_company_event"
    sector_signal = "sector_signal"
    system = "system"


class CompanyEventRole(str, Enum):
    victim = "victim"
    attacker = "attacker"
    vendor = "vendor"
    oracle = "oracle"
    related = "related"


# ----------------------------- Base / common -----------------------------


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------- Profile -----------------------------


class Profile(ORMBase):
    id: str
    role: ProfileRole
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime


# ----------------------------- Sectors / Companies -----------------------------


class Sector(ORMBase):
    id: str
    slug: str
    name: str
    description: str | None = None


class Subsector(ORMBase):
    id: str
    sector_id: str
    slug: str
    name: str
    description: str | None = None


class Company(ORMBase):
    id: str
    subsector_id: str | None = None
    slug: str
    name: str
    website: str | None = None
    chains: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# ----------------------------- Events -----------------------------


class EventSource(ORMBase):
    id: str
    event_id: str
    url: str
    source_type: str
    captured_at: datetime
    snapshot_path: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class EventCompanyRef(BaseModel):
    company_id: str
    role: CompanyEventRole = CompanyEventRole.related


class Event(ORMBase):
    id: str
    title: str
    summary: str
    evidence_class: EvidenceClass
    severity: Severity
    status: EventStatus
    occurred_at: datetime | None = None
    detected_at: datetime
    primary_company_id: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class EventWithRelations(Event):
    sources: list[EventSource] = Field(default_factory=list)
    companies: list[EventCompanyRef] = Field(default_factory=list)


class EventDraft(BaseModel):
    """Input shape used by both the admin POST /events route and the agent."""

    title: str
    summary: str
    evidence_class: EvidenceClass
    severity: Severity = Severity.info
    status: EventStatus = EventStatus.unverified
    occurred_at: datetime | None = None
    primary_company_id: str | None = None
    company_refs: list[EventCompanyRef] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list, description="List of source URLs")
    meta: dict[str, Any] = Field(default_factory=dict)


class EventStatusPatch(BaseModel):
    status: EventStatus


# ----------------------------- Watchlist -----------------------------


class WatchlistEntry(ORMBase):
    user_id: str
    company_id: str
    created_at: datetime


# ----------------------------- Notifications -----------------------------


class Notification(ORMBase):
    id: str
    user_id: str
    event_id: str | None = None
    sector_signal_id: str | None = None
    kind: NotificationKind
    read_at: datetime | None = None
    created_at: datetime


# ----------------------------- Sector signals -----------------------------


class SectorSignal(ORMBase):
    id: str
    subsector_id: str
    window_start: datetime
    window_end: datetime
    severity: Severity
    rationale: str
    event_count: int
    created_at: datetime


# ----------------------------- Agent runs -----------------------------


class AgentRun(ORMBase):
    id: str
    started_at: datetime
    ended_at: datetime | None = None
    status: str
    found_count: int
    cost_cents: int
    log_path: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


# ----------------------------- Threat matrix -----------------------------


class ThreatCell(BaseModel):
    subsector_id: str
    evidence_class: EvidenceClass
    event_count: int
    unique_companies: int
    severity_sum: float
    recency_sum: float
    score: float


class ThreatMatrix(BaseModel):
    cells: list[ThreatCell]
    subsectors: list[Subsector]
    evidence_classes: list[EvidenceClass]


# ----------------------------- Pagination -----------------------------


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None


# ----------------------------- Health -----------------------------


class Health(BaseModel):
    status: str = "ok"
    environment: str
    version: str = "0.1.0"
