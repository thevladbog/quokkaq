#!/usr/bin/env python3
"""Patch OpenAPI 3 artifacts after swag + kin-openapi conversion.

Swag emits Swagger 2.0; swagger-to-openapi3 produces OAS 3.0.x. This script adds
constraints kin/swag omit: minProperties on some PATCH bodies, hex pattern on tag colors.

Run after: swag init … && go run ./cmd/swagger-to-openapi3
Applies to: docs/swagger.json, docs/swagger.yaml (docs/docs.go uses //go:embed swagger.json).

Requires PyYAML for swagger.yaml (CI installs it; locally: pip install pyyaml).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

# Hex color for visitor tag definitions (matches handler descriptions).
COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"


def _components(doc: dict[str, Any]) -> dict[str, Any]:
    comp = doc.get("components")
    if not isinstance(comp, dict):
        sys.exit("post_swagger_openapi_tweaks: OpenAPI document has no components object")
    return comp


def _schema(components: dict[str, Any], name: str) -> dict[str, Any]:
    schemas = components.get("schemas")
    if not isinstance(schemas, dict):
        sys.exit("post_swagger_openapi_tweaks: components.schemas missing or not an object")
    s = schemas.get(name)
    if not isinstance(s, dict):
        sys.exit(
            f"post_swagger_openapi_tweaks: components.schemas[{name!r}] missing or not an object "
            "(swag/kin-openapi output may have changed — update schema names or tweak logic here)."
        )
    return s


def _patch_color_pattern(schema_obj: dict[str, Any], schema_label: str) -> None:
    """Set properties.color.pattern on a components.schemas entry; schema_label is used in errors."""
    props = schema_obj.get("properties")
    if not isinstance(props, dict):
        sys.exit(f"post_swagger_openapi_tweaks: {schema_label}.properties missing")
    color = props.get("color")
    if not isinstance(color, dict):
        sys.exit(f"post_swagger_openapi_tweaks: {schema_label}.properties.color missing")
    color["pattern"] = COLOR_PATTERN


def apply_openapi_tweaks(doc: dict[str, Any]) -> None:
    """Apply extra schema constraints by path under components.schemas.

    Edits are structural (dict keys), not string fragments: resilient to kin-openapi / encoder
    changing JSON key order or indentation. If swag or kin rename models or drop schemas, this
    fails fast with a clear message — adjust the schema names or fields above.
    """
    comp = _components(doc)

    patch_visitor = _schema(comp, "handlers.PatchTicketVisitorRequest")
    patch_visitor["minProperties"] = 1

    create_tag = _schema(comp, "handlers.createVisitorTagDefinitionRequest")
    _patch_color_pattern(create_tag, "createVisitorTagDefinitionRequest")

    patch_tag = _schema(comp, "handlers.patchVisitorTagDefinitionRequest")
    patch_tag["minProperties"] = 1
    _patch_color_pattern(patch_tag, "patchVisitorTagDefinitionRequest")


def _write_json(path: Path, doc: dict[str, Any]) -> None:
    text = json.dumps(doc, indent=4, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8")


def _patch_yaml(path: Path) -> None:
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError as e:
        sys.exit(
            "post_swagger_openapi_tweaks: PyYAML is required for swagger.yaml "
            "(pip install pyyaml). CI installs it before this script.\n"
            f"ImportError: {e}"
        )

    raw = path.read_text(encoding="utf-8")
    doc = yaml.safe_load(raw)
    if not isinstance(doc, dict):
        sys.exit("post_swagger_openapi_tweaks: swagger.yaml root is not a mapping")
    apply_openapi_tweaks(doc)
    # default_flow_style=False: block style; sort_keys=False preserves key order where supported
    out = yaml.dump(
        doc,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=1000,
    )
    if not out.endswith("\n"):
        out += "\n"
    path.write_text(out, encoding="utf-8")


def main() -> None:
    json_path = DOCS / "swagger.json"
    doc = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        sys.exit("post_swagger_openapi_tweaks: swagger.json root must be an object")
    apply_openapi_tweaks(doc)
    _write_json(json_path, doc)

    _patch_yaml(DOCS / "swagger.yaml")


if __name__ == "__main__":
    main()
