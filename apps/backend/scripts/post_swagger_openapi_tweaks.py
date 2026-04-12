#!/usr/bin/env python3
"""Patch OpenAPI 3 artifacts after swag + kin-openapi conversion.

Swag emits Swagger 2.0; swagger-to-openapi3 produces OAS 3.0.x. This script adds
constraints kin/swag omit: minProperties on some PATCH bodies, hex pattern on tag colors.

Run after: swag init … && go run ./cmd/swagger-to-openapi3
Applies to: docs/swagger.json, docs/swagger.yaml (docs/docs.go uses //go:embed swagger.json).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"

# OpenAPI 3: components.schemas (JSON / docs no longer embed full JSON in docs.go)
JSON_PATCHES: list[tuple[str, str, str]] = [
    (
        "PatchTicketVisitorRequest minProperties",
        (
            '"handlers.PatchTicketVisitorRequest": {\n'
            '                "properties": {'
        ),
        (
            '"handlers.PatchTicketVisitorRequest": {\n'
            '                "minProperties": 1,\n'
            '                "properties": {'
        ),
    ),
    (
        "createVisitorTagDefinitionRequest color pattern",
        (
            '"handlers.createVisitorTagDefinitionRequest": {\n'
            '                "properties": {\n'
            '                    "color": {\n'
            '                        "type": "string"\n'
            '                    },'
        ),
        (
            '"handlers.createVisitorTagDefinitionRequest": {\n'
            '                "properties": {\n'
            '                    "color": {\n'
            '                        "pattern": "' + COLOR_PATTERN + '",\n'
            '                        "type": "string"\n'
            '                    },'
        ),
    ),
    (
        "patchVisitorTagDefinitionRequest minProperties + color pattern",
        (
            '"handlers.patchVisitorTagDefinitionRequest": {\n'
            '                "properties": {\n'
            '                    "color": {\n'
            '                        "type": "string"\n'
            '                    },'
        ),
        (
            '"handlers.patchVisitorTagDefinitionRequest": {\n'
            '                "minProperties": 1,\n'
            '                "properties": {\n'
            '                    "color": {\n'
            '                        "pattern": "' + COLOR_PATTERN + '",\n'
            '                        "type": "string"\n'
            '                    },'
        ),
    ),
]

YAML_PATCHES: list[tuple[str, str, str]] = [
    (
        "PatchTicketVisitorRequest minProperties",
        (
            "        handlers.PatchTicketVisitorRequest:\n"
            "            properties:\n"
        ),
        (
            "        handlers.PatchTicketVisitorRequest:\n"
            "            minProperties: 1\n"
            "            properties:\n"
        ),
    ),
    (
        "createVisitorTagDefinitionRequest color pattern",
        (
            "        handlers.createVisitorTagDefinitionRequest:\n"
            "            properties:\n"
            "                color:\n"
            "                    type: string\n"
        ),
        (
            "        handlers.createVisitorTagDefinitionRequest:\n"
            "            properties:\n"
            "                color:\n"
            f"                    pattern: '{COLOR_PATTERN}'\n"
            "                    type: string\n"
        ),
    ),
    (
        "patchVisitorTagDefinitionRequest minProperties + color pattern",
        (
            "        handlers.patchVisitorTagDefinitionRequest:\n"
            "            properties:\n"
            "                color:\n"
            "                    type: string\n"
        ),
        (
            "        handlers.patchVisitorTagDefinitionRequest:\n"
            "            minProperties: 1\n"
            "            properties:\n"
            "                color:\n"
            f"                    pattern: '{COLOR_PATTERN}'\n"
            "                    type: string\n"
        ),
    ),
]


def _apply_patches(path: Path, patches: list[tuple[str, str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    for _label, before, after in patches:
        if after in text:
            continue
        if before not in text:
            raise SystemExit(
                f"post_swagger_openapi_tweaks: expected unpatched block not found in {path}"
            )
        text = text.replace(before, after, 1)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    _apply_patches(DOCS / "swagger.json", JSON_PATCHES)
    _apply_patches(DOCS / "swagger.yaml", YAML_PATCHES)


if __name__ == "__main__":
    main()
