"""Import the 500-company CSV into Supabase.

Expected CSV columns (case-insensitive, extras ignored):
  name           - required, human display name
  slug           - optional, auto-generated from name if missing
  sector         - required, sector slug or name (case-insensitive)
  subsector      - required, subsector slug or name (case-insensitive within sector)
  website        - optional
  chains         - optional, pipe- or comma-separated (e.g. "ethereum|arbitrum")
  tags           - optional, pipe- or comma-separated

Usage:
  uv run python scripts/import_companies.py path/to/companies.csv \\
      --supabase-url $SUPABASE_URL \\
      --service-role-key $SUPABASE_SERVICE_ROLE_KEY

The script is idempotent: re-running upserts on `companies.slug`.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from typing import Iterable

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover
    print("supabase-py is required: pip install supabase", file=sys.stderr)
    raise


SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    s = SLUG_RE.sub("-", text.lower()).strip("-")
    return s or "company"


def _split_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[|,;]", raw)
    return [p.strip() for p in parts if p.strip()]


@dataclass
class CompanyRow:
    name: str
    slug: str
    sector: str
    subsector: str
    website: str | None
    chains: list[str]
    tags: list[str]


def read_csv(path: str) -> Iterable[CompanyRow]:
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise SystemExit("CSV has no header row")
        normalized = {name.lower(): name for name in reader.fieldnames}

        required = {"name", "sector", "subsector"}
        missing = required - set(normalized)
        if missing:
            raise SystemExit(f"CSV missing required columns: {sorted(missing)}")

        for row in reader:
            def get(col: str) -> str | None:
                key = normalized.get(col)
                if not key:
                    return None
                v = row.get(key)
                return v.strip() if isinstance(v, str) else v

            name = get("name") or ""
            if not name:
                continue
            yield CompanyRow(
                name=name,
                slug=get("slug") or slugify(name),
                sector=(get("sector") or "").lower(),
                subsector=(get("subsector") or "").lower(),
                website=get("website") or None,
                chains=_split_list(get("chains")),
                tags=_split_list(get("tags")),
            )


def build_lookup(client: Client) -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    """Return (sectors_by_slug_or_name, subsectors_by_(sector_slug, slug_or_name))."""
    sectors = client.table("sectors").select("id, slug, name").execute().data or []
    subsectors = (
        client.table("subsectors").select("id, slug, name, sector_id").execute().data or []
    )

    sector_index: dict[str, str] = {}
    sector_id_to_slug: dict[str, str] = {}
    for s in sectors:
        sector_index[s["slug"].lower()] = s["id"]
        sector_index[s["name"].lower()] = s["id"]
        sector_id_to_slug[s["id"]] = s["slug"]

    sub_index: dict[tuple[str, str], str] = {}
    for sub in subsectors:
        sector_slug = sector_id_to_slug.get(sub["sector_id"])
        if not sector_slug:
            continue
        sub_index[(sector_slug.lower(), sub["slug"].lower())] = sub["id"]
        sub_index[(sector_slug.lower(), sub["name"].lower())] = sub["id"]
    return sector_index, sub_index


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"))
    parser.add_argument(
        "--service-role-key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.supabase_url or not args.service_role_key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    client = create_client(args.supabase_url, args.service_role_key)
    sector_index, sub_index = build_lookup(client)

    payload: list[dict] = []
    skipped: list[tuple[str, str]] = []
    for row in read_csv(args.csv_path):
        sub_id = sub_index.get((row.sector, row.subsector))
        if not sub_id:
            skipped.append((row.name, f"unknown sector/subsector: {row.sector}/{row.subsector}"))
            continue
        payload.append({
            "slug": row.slug,
            "name": row.name,
            "subsector_id": sub_id,
            "website": row.website,
            "chains": row.chains,
            "tags": row.tags,
            "meta": {},
        })

    print(f"Parsed {len(payload)} valid rows ({len(skipped)} skipped)")
    for name, reason in skipped[:20]:
        print(f"  SKIP {name}: {reason}")
    if len(skipped) > 20:
        print(f"  ... and {len(skipped) - 20} more")

    if args.dry_run:
        return 0

    BATCH = 100
    inserted = 0
    for i in range(0, len(payload), BATCH):
        chunk = payload[i : i + BATCH]
        client.table("companies").upsert(chunk, on_conflict="slug").execute()
        inserted += len(chunk)
        print(f"  upserted {inserted}/{len(payload)}")

    count = (
        client.table("companies").select("id", count="exact").execute().count
    )
    print(f"companies.count = {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
