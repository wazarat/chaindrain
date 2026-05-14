"""Deterministic post-processor that turns a raw Comet/Playwright finding into
a normalized `EventDraft` payload (title, summary, evidence_class, severity,
status, primary_company_id, sources, company_refs).

It is intentionally simple: keyword-driven evidence_class + severity bumps,
status auto-promoted from 'unverified' to 'corroborated' if >=2 sources.

When run live, it should be paired with the Comet structured-output prompt
which already asks for evidence_class + severity; this layer is the safety
net that re-validates the labels and discards garbage.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

VALID_EVIDENCE = {
    "protocol_exploit",
    "operational_compromise",
    "market_event",
    "regulatory",
    "governance",
    "disclosure",
    "other",
}
VALID_SEVERITY = ["info", "low", "medium", "high", "critical"]

# keyword -> evidence_class hints
EVIDENCE_KEYWORDS: dict[str, str] = {
    "exploit": "protocol_exploit",
    "drained": "protocol_exploit",
    "reentrancy": "protocol_exploit",
    "flash loan": "protocol_exploit",
    "oracle manipulation": "protocol_exploit",
    "private key": "operational_compromise",
    "compromised wallet": "operational_compromise",
    "phishing": "operational_compromise",
    "rug": "protocol_exploit",
    "depeg": "market_event",
    "liquidation cascade": "market_event",
    "sec ": "regulatory",
    "ofac": "regulatory",
    "wells notice": "regulatory",
    "governance proposal": "governance",
    "post-mortem": "disclosure",
    "incident report": "disclosure",
}

# keyword -> minimum severity bump
SEVERITY_KEYWORDS: dict[str, str] = {
    "$1m": "medium",
    "$10m": "high",
    "$100m": "critical",
    "$1b": "critical",
    "frozen": "high",
    "irreversible": "high",
    "loss of funds": "high",
    "rug pull": "critical",
    "exit scam": "critical",
    "seized": "high",
    "indicted": "high",
}


@dataclass
class RawFinding:
    title: str
    summary: str
    sources: list[str]
    company_slugs: list[str] = field(default_factory=list)
    suggested_evidence_class: str | None = None
    suggested_severity: str | None = None
    occurred_at: datetime | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class EventDraft:
    title: str
    summary: str
    evidence_class: str
    severity: str
    status: str
    occurred_at: datetime | None
    primary_company_id: str | None
    company_refs: list[dict[str, str]]
    sources: list[str]
    meta: dict[str, Any]


def _bump_severity(current: str, candidate: str) -> str:
    cur = VALID_SEVERITY.index(current) if current in VALID_SEVERITY else 0
    can = VALID_SEVERITY.index(candidate) if candidate in VALID_SEVERITY else 0
    return VALID_SEVERITY[max(cur, can)]


def classify(
    finding: RawFinding,
    company_slug_to_id: dict[str, str],
    *,
    now: datetime | None = None,
) -> EventDraft | None:
    """Return an EventDraft, or None if the finding fails minimum bar."""
    text = f"{finding.title}\n{finding.summary}".lower()

    if len(text.strip()) < 30:
        return None

    # 1. evidence_class
    evidence = (finding.suggested_evidence_class or "").lower()
    if evidence not in VALID_EVIDENCE:
        evidence = "other"
        for kw, cls in EVIDENCE_KEYWORDS.items():
            if kw in text:
                evidence = cls
                break

    # 2. severity baseline + keyword bumps
    severity = (finding.suggested_severity or "info").lower()
    if severity not in VALID_SEVERITY:
        severity = "info"
    for kw, sev in SEVERITY_KEYWORDS.items():
        if kw in text:
            severity = _bump_severity(severity, sev)

    # 3. status: corroborated if >=2 sources
    status = "corroborated" if len(set(finding.sources)) >= 2 else "unverified"

    # 4. resolve company refs
    refs: list[dict[str, str]] = []
    primary_id: str | None = None
    for slug in finding.company_slugs:
        cid = company_slug_to_id.get(slug.lower())
        if not cid:
            continue
        refs.append({"company_id": cid, "role": "victim"})
        if primary_id is None:
            primary_id = cid

    return EventDraft(
        title=finding.title.strip()[:240],
        summary=finding.summary.strip()[:4000],
        evidence_class=evidence,
        severity=severity,
        status=status,
        occurred_at=finding.occurred_at,
        primary_company_id=primary_id,
        company_refs=refs,
        sources=list(dict.fromkeys(finding.sources)),  # de-dupe preserve order
        meta={
            "raw": finding.raw,
            "classified_at": (now or datetime.now(timezone.utc)).isoformat(),
        },
    )
