"""Generate TypeScript types in `packages/shared-types/src/index.ts` from
the Pydantic models in `apps/api/app/models.py`.

Uses `datamodel-code-generator` to emit a JSON schema, then a small
custom transformer turns that into idiomatic TS.

Run:
    uv run python scripts/gen_types.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TS_OUT = REPO_ROOT / "packages" / "shared-types" / "src" / "index.ts"

PY_TO_TS = {
    "string": "string",
    "integer": "number",
    "number": "number",
    "boolean": "boolean",
}


def schema_for_models() -> dict:
    """Build a single JSON schema by walking app.models."""
    sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))
    from app import models  # type: ignore[import-not-found]
    from pydantic import BaseModel

    out_defs: dict[str, dict] = {}
    out_enums: dict[str, list[str]] = {}

    for name in dir(models):
        obj = getattr(models, name)
        if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
            try:
                schema = obj.model_json_schema(ref_template="#/$defs/{model}")
            except Exception:
                continue
            out_defs[name] = schema
            for k, v in schema.get("$defs", {}).items():
                out_defs.setdefault(k, v)

    # Enums: anything in models that subclasses Enum
    import enum

    for name in dir(models):
        obj = getattr(models, name)
        if isinstance(obj, type) and issubclass(obj, enum.Enum):
            out_enums[name] = [m.value for m in obj]

    return {"definitions": out_defs, "enums": out_enums}


def ts_type(prop: dict, defs: dict) -> str:  # noqa: PLR0911
    if "$ref" in prop:
        return prop["$ref"].split("/")[-1]
    if "anyOf" in prop:
        parts = [ts_type(p, defs) for p in prop["anyOf"]]
        return " | ".join(dict.fromkeys(parts))
    if "enum" in prop:
        return " | ".join(json.dumps(v) for v in prop["enum"])
    typ = prop.get("type")
    if typ == "array":
        return f"{ts_type(prop.get('items', {}), defs)}[]"
    if typ == "object":
        return "Record<string, unknown>"
    if typ == "null":
        return "null"
    if typ in PY_TO_TS:
        return PY_TO_TS[typ]
    return "unknown"


def emit(model_name: str, schema: dict, defs: dict) -> str:
    props = schema.get("properties", {})
    required = set(schema.get("required", []))
    lines = [f"export interface {model_name} {{"]
    for k, v in props.items():
        opt = "" if k in required else "?"
        lines.append(f"  {k}{opt}: {ts_type(v, defs)};")
    lines.append("}")
    return "\n".join(lines)


def main() -> int:
    bundle = schema_for_models()
    defs = bundle["definitions"]
    enums = bundle["enums"]

    parts: list[str] = [
        "// AUTO-GENERATED FILE. Do not edit by hand.",
        "// Source: apps/api/app/models.py",
        "// Regenerate via: pnpm gen:types",
        "",
    ]

    for name, values in enums.items():
        parts.append(
            f"export type {name} = " + " | ".join(json.dumps(v) for v in values) + ";"
        )
    parts.append("")

    seen: set[str] = set()
    for name, schema in defs.items():
        if name in seen or name in enums:
            continue
        if "properties" not in schema:
            continue
        parts.append(emit(name, schema, defs))
        parts.append("")
        seen.add(name)

    TS_OUT.parent.mkdir(parents=True, exist_ok=True)
    TS_OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"wrote {TS_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
