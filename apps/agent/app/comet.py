"""Perplexity Comet driver.

Comet is a browser/computer-use agent. We invoke it via Perplexity's
chat-completions API with a Comet-style "tools" call that asks the model to
fetch the source URL and return JSON-only output.

If the Comet API returns a non-conforming or empty response, the caller falls
back to `playwright_fallback.py`.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.classifier import RawFinding

PROMPT_TEMPLATE = """You are a security-research analyst. Read the page at the
URL below and extract every distinct exploit, hack, depeg, regulatory action,
governance attack, or operational compromise reported on that page within the
last {freshness_hours} hours.

Source: {url}

Return STRICT JSON with this shape and no commentary:
{{
  "findings": [
    {{
      "title": "<one short sentence>",
      "summary": "<2-4 sentence neutral summary>",
      "occurred_at": "<ISO 8601 if known else null>",
      "company_slugs": ["<slug>", ...],
      "evidence_class": "<one of: protocol_exploit | operational_compromise | market_event | regulatory | governance | disclosure | other>",
      "severity": "<one of: info | low | medium | high | critical>",
      "sources": ["<canonical url of the underlying article>", ...]
    }}
  ]
}}

If nothing qualifies, return {{"findings": []}}.
"""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=20))
async def fetch_findings(
    api_key: str,
    source_url: str,
    freshness_hours: int = 168,
) -> list[RawFinding]:
    """Call Comet/Perplexity and return parsed findings.

    Raises on hard transport errors (so retry kicks in). Returns [] on empty.
    """
    prompt = PROMPT_TEMPLATE.format(url=source_url, freshness_hours=freshness_hours)
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            "https://api.perplexity.ai/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "content-type": "application/json",
            },
            json={
                "model": "sonar-reasoning",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()

    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "{}")
    try:
        parsed: dict[str, Any] = json.loads(content)
    except json.JSONDecodeError:
        return []

    findings_raw = parsed.get("findings") or []
    out: list[RawFinding] = []
    for f in findings_raw:
        if not isinstance(f, dict):
            continue
        title = (f.get("title") or "").strip()
        summary = (f.get("summary") or "").strip()
        if not title or not summary:
            continue
        out.append(
            RawFinding(
                title=title,
                summary=summary,
                sources=[s for s in f.get("sources", []) if isinstance(s, str)],
                company_slugs=[s for s in f.get("company_slugs", []) if isinstance(s, str)],
                suggested_evidence_class=f.get("evidence_class"),
                suggested_severity=f.get("severity"),
                occurred_at=None,  # parsed by classifier if needed
                raw=f,
            )
        )
    return out
