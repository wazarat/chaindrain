"""Convert cached CSVs in data/companies/ into a single companies_seed.sql.

The output SQL can be executed via `mcp0_execute_sql` in chunks.

Same column-detection + slug + meta logic as
`scripts/import_from_google_sheets.py` (so that switching importers does not
change the resulting rows).

Usage:
    uv run python scripts/sheets_to_sql.py
    -> writes scripts/companies_seed.sql
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
from pathlib import Path
from typing import Any

from sheets_map import SHEETS, SheetTarget

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data" / "companies"
OUT_PATH = REPO_ROOT / "scripts" / "companies_seed.sql"

SLUG_RE = re.compile(r"[^a-z0-9]+")

NAME_COLS = ("name", "entity", "coin", "project", "company", "protocol", "asset")
SLUG_COLS = ("slug", "ticker", "symbol")
WEBSITE_COLS = ("website", "url", "site", "homepage")
CHAINS_COLS = (
    "chains", "chain", "primary networks", "supported networks",
    "network", "networks", "underlying rollup base",
)
TAGS_COLS = (
    "tags", "tag", "category", "categories", "entity type",
    "type of framework", "client category",
)
DESCRIPTION_COLS = (
    "description", "summary", "notes", "about", "reason for inclusion",
    "reason of inclusion", "practitioner's note", "practictioners note",
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
    for c in candidates:
        for k, original in norm.items():
            if c in k:
                return original
    return None


def parse_rows(target: SheetTarget, csv_text: str) -> list[dict[str, Any]]:
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return []

    header_idx = 0
    for i, row in enumerate(rows[:5]):
        joined = " | ".join(c.lower() for c in row)
        if any(c in joined for c in NAME_COLS):
            header_idx = i
            break

    header = [c.strip() for c in rows[header_idx]]
    body = rows[header_idx + 1:]

    name_col = find_col(header, NAME_COLS)
    if not name_col:
        print(f"  WARN: no name column for {target.label}, header={header[:6]}", file=sys.stderr)
        return []
    slug_col = find_col(header, SLUG_COLS)
    website_col = find_col(header, WEBSITE_COLS)
    chains_col = find_col(header, CHAINS_COLS)
    tags_col = find_col(header, TAGS_COLS)
    description_col = find_col(header, DESCRIPTION_COLS)

    parsed: list[dict[str, Any]] = []
    for raw in body:
        row = dict(zip(header, [c.strip() for c in raw]))
        name = (row.get(name_col) or "").strip()
        if not name or name.lower() in {"name", "project", "n/a", "tbd", "-"}:
            continue
        meta: dict[str, Any] = {"source_label": target.label}
        if description_col and (desc := row.get(description_col)):
            meta["description"] = desc
        known = {name_col, slug_col, website_col, chains_col, tags_col, description_col}
        for k, v in row.items():
            if k and k not in known and v:
                meta.setdefault("extras", {})[k] = v

        parsed.append({
            "name": name,
            "slug": (row.get(slug_col) or slugify(name)) if slug_col else slugify(name),
            "website": row.get(website_col) or None,
            "chains": split_list(row.get(chains_col)),
            "tags": split_list(row.get(tags_col)),
            "meta": meta,
            "sector_slug": target.sector_slug,
            "subsector_slug": target.subsector_slug,
        })

    return parsed


def sql_str(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def sql_text_array(items: list[str]) -> str:
    if not items:
        return "ARRAY[]::text[]"
    escaped = ", ".join(sql_str(i) for i in items)
    return f"ARRAY[{escaped}]::text[]"


def sql_jsonb(obj: dict[str, Any]) -> str:
    return sql_str(json.dumps(obj, ensure_ascii=False, sort_keys=True)) + "::jsonb"


def render_batch(rows: list[dict[str, Any]]) -> str:
    """Render a single multi-row INSERT with VALUES + JOIN to resolve subsector_id."""
    values_rows: list[str] = []
    for r in rows:
        values_rows.append(
            "(" + ", ".join([
                sql_str(r["slug"]),
                sql_str(r["name"]),
                sql_str(r["sector_slug"]),
                sql_str(r["subsector_slug"]),
                sql_str(r["website"]),
                sql_text_array(r["chains"]),
                sql_text_array(r["tags"]),
                sql_jsonb(r["meta"]),
            ]) + ")"
        )

    values_block = ",\n  ".join(values_rows)

    return (
        "INSERT INTO public.companies (slug, name, subsector_id, website, chains, tags, meta)\n"
        "SELECT v.slug, v.name, s.id, v.website, v.chains, v.tags, v.meta\n"
        "FROM (VALUES\n  "
        + values_block
        + "\n) AS v(slug, name, sector_slug, subsector_slug, website, chains, tags, meta)\n"
        "JOIN public.sectors sec ON sec.slug = v.sector_slug\n"
        "JOIN public.subsectors s ON s.sector_id = sec.id AND s.slug = v.subsector_slug\n"
        "ON CONFLICT (slug) DO UPDATE SET\n"
        "  name = EXCLUDED.name,\n"
        "  subsector_id = EXCLUDED.subsector_id,\n"
        "  website = EXCLUDED.website,\n"
        "  chains = EXCLUDED.chains,\n"
        "  tags = EXCLUDED.tags,\n"
        "  meta = EXCLUDED.meta,\n"
        "  updated_at = NOW();\n"
    )


def main() -> int:
    if not DATA_DIR.exists():
        print(f"Cache dir not found: {DATA_DIR}. Run import_from_google_sheets.py --cache-only first.", file=sys.stderr)
        return 1

    all_rows: list[dict[str, Any]] = []
    seen_slugs: set[str] = set()
    duplicates: list[tuple[str, str, str]] = []  # (slug, prev_label, new_label)

    for t in SHEETS:
        path = DATA_DIR / f"{t.sector_slug}__{t.subsector_slug}.csv"
        if not path.exists():
            print(f"  MISSING: {path}", file=sys.stderr)
            continue
        csv_text = path.read_text(encoding="utf-8")
        rows = parse_rows(t, csv_text)
        for r in rows:
            slug = r["slug"]
            if slug in seen_slugs:
                duplicates.append((slug, "(earlier)", t.label))
            seen_slugs.add(slug)
        all_rows.extend(rows)

    print(f"Parsed {len(all_rows)} rows ({len(seen_slugs)} unique slugs).")
    if duplicates:
        print(f"  {len(duplicates)} duplicate slugs (last-wins on conflict):")
        for slug, _, label in duplicates[:10]:
            print(f"    - {slug} (later seen in {label})")

    # Size-bounded chunking so each batch fits comfortably in one MCP execute_sql call.
    MAX_BYTES = 55_000
    BATCH_DIR = REPO_ROOT / "scripts" / "companies_seed_batches"
    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    for f in BATCH_DIR.glob("*.sql"):
        f.unlink()

    parts: list[str] = []
    parts.append("-- Generated by scripts/sheets_to_sql.py from data/companies/*.csv\n")
    parts.append("BEGIN;\n")

    batch_num = 0
    cursor = 0
    while cursor < len(all_rows):
        # Grow chunk row-by-row until we exceed MAX_BYTES, then back off one row.
        size = 0
        end = cursor
        while end < len(all_rows):
            tentative = render_batch(all_rows[cursor:end + 1])
            size = len(tentative.encode("utf-8"))
            if size > MAX_BYTES and end > cursor:
                break
            end += 1
        chunk = all_rows[cursor:end]
        cursor = end
        batch_num += 1
        batch_sql = render_batch(chunk)
        parts.append(batch_sql)
        (BATCH_DIR / f"batch_{batch_num:02d}.sql").write_text(batch_sql, encoding="utf-8")

    parts.append("COMMIT;\n")
    parts.append("\n-- Verify:\n")
    parts.append("SELECT COUNT(*) AS companies FROM public.companies;\n")

    OUT_PATH.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes, {len(all_rows)} rows in {batch_num} batches).")
    print(f"Per-batch files in {BATCH_DIR}/")
    for f in sorted(BATCH_DIR.glob("*.sql")):
        print(f"  {f.name} ({f.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
