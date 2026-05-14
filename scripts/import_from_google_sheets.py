"""Fetch every Google Sheet in `sheets_map.SHEETS` and upsert into Supabase.

Two modes:

  --cache-only        : download CSVs to data/companies/{sector}__{subsector}.csv
                        and stop. Useful for inspecting before import.
  (default)           : download + upsert into public.companies via Supabase.

The importer is column-flexible. It looks for these columns (case-insensitive):
    name | project | company        -> name (required)
    slug                            -> slug (auto-generated if missing)
    website | url | site            -> website
    chain | chains | network        -> chains[] (split on | , ;)
    tag  | tags  | category         -> tags[]
    description | summary | notes   -> stashed in meta.description

All unknown columns are stashed under `meta` so nothing is lost.

Usage:
    uv run python scripts/import_from_google_sheets.py --cache-only
    uv run python scripts/import_from_google_sheets.py \\
        --supabase-url $SUPABASE_URL \\
        --service-role-key $SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:  # pragma: no cover
    print("httpx is required: pip install httpx", file=sys.stderr)
    raise

from sheets_map import SHEETS, SheetTarget, export_csv_url

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data" / "companies"

SLUG_RE = re.compile(r"[^a-z0-9]+")

NAME_COLS = ("name", "entity", "coin", "project", "company", "protocol", "asset")
SLUG_COLS = ("slug", "ticker", "symbol")
WEBSITE_COLS = ("website", "url", "site", "homepage")
CHAINS_COLS = (
    "chains",
    "chain",
    "primary networks",
    "supported networks",
    "network",
    "networks",
    "underlying rollup base",
)
TAGS_COLS = (
    "tags",
    "tag",
    "category",
    "categories",
    "entity type",
    "type of framework",
    "client category",
)
DESCRIPTION_COLS = (
    "description",
    "summary",
    "notes",
    "about",
    "reason for inclusion",
    "reason of inclusion",
    "practitioner's note",
    "practictioners note",
)


def slugify(text: str) -> str:
    return SLUG_RE.sub("-", text.lower()).strip("-") or "company"


def split_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in re.split(r"[|,;/]", raw) if p.strip()]


def find_col(header: list[str], candidates: tuple[str, ...]) -> str | None:
    norm = {h.lower().strip(): h for h in header}
    for c in candidates:
        if c in norm:
            return norm[c]
    # fuzzy match: any header containing the candidate word
    for c in candidates:
        for k, original in norm.items():
            if c in k:
                return original
    return None


def fetch_csv(target: SheetTarget, retries: int = 3) -> str:
    url = export_csv_url(target)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                resp = client.get(url)
                if resp.status_code == 200 and resp.text.strip():
                    return resp.text
                last_err = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        except httpx.HTTPError as exc:
            last_err = exc
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(
        f"Failed to fetch {target.label} ({target.file_id}/{target.gid}): {last_err}"
    )


def parse_rows(target: SheetTarget, csv_text: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Returns (rows, warnings)."""
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    warnings: list[str] = []
    if not rows:
        return [], [f"{target.label}: empty sheet"]

    # Header heuristic: first row containing any NAME_COLS keyword.
    header_idx = 0
    for i, row in enumerate(rows[:5]):
        joined = " | ".join(c.lower() for c in row)
        if any(c in joined for c in NAME_COLS):
            header_idx = i
            break

    header = [c.strip() for c in rows[header_idx]]
    body = rows[header_idx + 1 :]

    name_col = find_col(header, NAME_COLS)
    if not name_col:
        return [], [f"{target.label}: no name-like column found in header={header[:6]}"]
    slug_col = find_col(header, SLUG_COLS)
    website_col = find_col(header, WEBSITE_COLS)
    chains_col = find_col(header, CHAINS_COLS)
    tags_col = find_col(header, TAGS_COLS)
    description_col = find_col(header, DESCRIPTION_COLS)

    parsed: list[dict[str, Any]] = []
    for raw in body:
        # Normalize row -> dict by header
        row = dict(zip(header, [c.strip() for c in raw]))
        name = (row.get(name_col) or "").strip()
        if not name or name.lower() in {"name", "project", "n/a", "tbd", "-"}:
            continue
        meta: dict[str, Any] = {"source_label": target.label}
        if description_col:
            desc = row.get(description_col)
            if desc:
                meta["description"] = desc
        # stash unrecognised columns under meta for later inspection
        known = {name_col, slug_col, website_col, chains_col, tags_col, description_col}
        for k, v in row.items():
            if k and k not in known and v:
                meta.setdefault("extras", {})[k] = v

        parsed.append(
            {
                "name": name,
                "slug": (row.get(slug_col) or slugify(name)) if slug_col else slugify(name),
                "website": row.get(website_col) or None,
                "chains": split_list(row.get(chains_col)),
                "tags": split_list(row.get(tags_col)),
                "meta": meta,
                "_subsector_slug": target.subsector_slug,
                "_sector_slug": target.sector_slug,
            }
        )

    return parsed, warnings


def write_cache(target: SheetTarget, csv_text: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{target.sector_slug}__{target.subsector_slug}.csv"
    path.write_text(csv_text, encoding="utf-8")
    return path


def upsert_to_supabase(rows: list[dict[str, Any]], supabase_url: str, service_role_key: str) -> int:
    from supabase import create_client

    client = create_client(supabase_url, service_role_key)

    # Build a (sector_slug, subsector_slug) -> subsector_id index.
    sectors = client.table("sectors").select("id, slug").execute().data or []
    sector_by_slug = {s["slug"]: s["id"] for s in sectors}
    subsectors = (
        client.table("subsectors").select("id, slug, sector_id").execute().data or []
    )
    sub_index: dict[tuple[str, str], str] = {}
    for sub in subsectors:
        for sec_slug, sec_id in sector_by_slug.items():
            if sub["sector_id"] == sec_id:
                sub_index[(sec_slug, sub["slug"])] = sub["id"]
                break

    # Deduplicate by slug, last-wins (matches the "last sheet wins" intent).
    # Postgres ON CONFLICT DO UPDATE rejects duplicate slugs in the same INSERT.
    by_slug: dict[str, dict[str, Any]] = {}
    skipped = 0
    for r in rows:
        sub_id = sub_index.get((r["_sector_slug"], r["_subsector_slug"]))
        if not sub_id:
            skipped += 1
            continue
        by_slug[r["slug"]] = {
            "slug": r["slug"],
            "name": r["name"],
            "subsector_id": sub_id,
            "website": r["website"],
            "chains": r["chains"],
            "tags": r["tags"],
            "meta": r["meta"],
        }
    payload: list[dict[str, Any]] = list(by_slug.values())
    deduped = len(rows) - len(payload) - skipped

    print(
        f"  upserting {len(payload)} rows "
        f"({skipped} skipped due to missing subsector, {deduped} dedup'd by slug)"
    )
    BATCH = 100
    for i in range(0, len(payload), BATCH):
        client.table("companies").upsert(payload[i : i + BATCH], on_conflict="slug").execute()
    return len(payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cache-only",
        action="store_true",
        help="Download CSVs to data/companies/ but skip Supabase upsert",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        default=None,
        help="Optional list of subsector slugs to limit the run to",
    )
    parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"))
    parser.add_argument(
        "--service-role-key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse but do not upsert")
    args = parser.parse_args()

    targets = SHEETS
    if args.only:
        wanted = set(args.only)
        targets = [t for t in SHEETS if t.subsector_slug in wanted]
        if not targets:
            print(f"No sheets match --only {args.only}", file=sys.stderr)
            return 1

    if not args.cache_only and not args.dry_run:
        if not args.supabase_url or not args.service_role_key:
            print(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --cache-only)",
                file=sys.stderr,
            )
            return 1

    all_rows: list[dict[str, Any]] = []
    failures: list[tuple[str, str]] = []

    for t in targets:
        print(f"-> {t.sector_slug}/{t.subsector_slug}  ({t.label})")
        if t.notes:
            print(f"   note: {t.notes}")
        try:
            csv_text = fetch_csv(t)
        except Exception as exc:
            print(f"   FETCH FAIL: {exc}")
            failures.append((t.label, str(exc)))
            continue

        write_cache(t, csv_text)
        rows, warnings = parse_rows(t, csv_text)
        for w in warnings:
            print(f"   WARN: {w}")
        print(f"   parsed {len(rows)} rows")
        all_rows.extend(rows)

    print(
        f"\nTotal parsed across {len(targets) - len(failures)} sheets: {len(all_rows)} rows"
    )
    if failures:
        print("Sheets that failed to fetch:")
        for label, err in failures:
            print(f"  - {label}: {err}")

    if args.cache_only or args.dry_run:
        print("(skipping Supabase upsert)")
        return 0 if not failures else 1

    inserted = upsert_to_supabase(all_rows, args.supabase_url, args.service_role_key)
    print(f"Done. Upserted {inserted} companies.")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
