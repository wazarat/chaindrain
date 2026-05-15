"""Post a synthetic HMAC-signed event to the chaindrain-api /agent/events route.

Used to validate the agent ingestion surface (Day 2 KPI #1) before the Comet
worker is deployed. The endpoint is the same one the worker will call.

Env vars (required):
  AGENT_HMAC_SECRET       Hex string set as a Fly secret on chaindrain-api.
  CHAINDRAIN_API_BASE_URL Defaults to https://chaindrain-api.fly.dev
  PRIMARY_COMPANY_ID      UUID of an existing public.companies row.

Optional:
  EVIDENCE_CLASS          Default: operational_compromise
  SEVERITY                Default: high
  STATUS                  Default: unverified  (auto-promoted to corroborated by
                          the API when sources >= 2)

Usage:
  AGENT_HMAC_SECRET=<hex> \\
  PRIMARY_COMPANY_ID=<uuid> \\
  python3 scripts/post_synthetic_event.py
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
from datetime import datetime, timezone

import urllib.request
import urllib.error

UTC = timezone.utc


def main() -> int:
    secret = os.environ.get("AGENT_HMAC_SECRET")
    if not secret:
        print("ERROR: AGENT_HMAC_SECRET is required", file=sys.stderr)
        return 2

    company_id = os.environ.get("PRIMARY_COMPANY_ID")
    if not company_id:
        print("ERROR: PRIMARY_COMPANY_ID is required", file=sys.stderr)
        return 2

    base = os.environ.get("CHAINDRAIN_API_BASE_URL", "https://chaindrain-api.fly.dev").rstrip("/")
    evidence_class = os.environ.get("EVIDENCE_CLASS", "operational_compromise")
    severity = os.environ.get("SEVERITY", "high")
    status = os.environ.get("STATUS", "unverified")

    payload = {
        "title": "[SYNTHETIC] Day 2 KPI smoke test",
        "summary": (
            "Hand-crafted event used to validate the /agent/events ingestion "
            "surface and threat-matrix wiring. Safe to retract."
        ),
        "evidence_class": evidence_class,
        "severity": severity,
        "status": status,
        "occurred_at": datetime.now(UTC).isoformat(),
        "primary_company_id": company_id,
        "sources": [
            "https://example.com/synthetic/source-a",
            "https://example.com/synthetic/source-b",
        ],
        "meta": {"synthetic": True, "session": datetime.now(UTC).date().isoformat()},
    }

    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    url = f"{base}/agent/events"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-chaindrain-signature": sig,
        },
    )

    print(f"POST {url}")
    print(f"  body bytes : {len(body)}")
    print(f"  signature  : {sig}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read().decode("utf-8")
            print(f"  status     : {resp.status}")
            print(f"  response   : {data[:1024]}")
            return 0
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        print(f"  status     : {e.code}")
        print(f"  response   : {body_text[:1024]}")
        return 1
    except urllib.error.URLError as e:
        print(f"  network err: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
