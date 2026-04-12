#!/usr/bin/env python3
"""Re-apply OpenAPI tweaks swag does not emit. Run after: swag init -g cmd/api/main.go -o ./docs

- minProperties on PATCH bodies (PatchTicketVisitorRequest, patchVisitorTagDefinitionRequest)
- hex color pattern on visitor tag definition request color fields
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"

JSON_PATCHES: list[tuple[str, str, str]] = [
    (
        "PatchTicketVisitorRequest minProperties",
        (
            '"handlers.PatchTicketVisitorRequest": {\n'
            '            "type": "object",\n'
            '            "properties": {'
        ),
        (
            '"handlers.PatchTicketVisitorRequest": {\n'
            '            "type": "object",\n'
            '            "minProperties": 1,\n'
            '            "properties": {'
        ),
    ),
    (
        "createVisitorTagDefinitionRequest color pattern",
        (
            '"handlers.createVisitorTagDefinitionRequest": {\n'
            '            "type": "object",\n'
            '            "required": [\n'
            '                "color",\n'
            '                "label"\n'
            '            ],\n'
            '            "properties": {\n'
            '                "color": {\n'
            '                    "type": "string"\n'
            '                },'
        ),
        (
            '"handlers.createVisitorTagDefinitionRequest": {\n'
            '            "type": "object",\n'
            '            "required": [\n'
            '                "color",\n'
            '                "label"\n'
            '            ],\n'
            '            "properties": {\n'
            '                "color": {\n'
            '                    "type": "string",\n'
            f'                    "pattern": "{COLOR_PATTERN}"\n'
            '                },'
        ),
    ),
    (
        "patchVisitorTagDefinitionRequest minProperties + color pattern",
        (
            '"handlers.patchVisitorTagDefinitionRequest": {\n'
            '            "type": "object",\n'
            '            "properties": {\n'
            '                "color": {\n'
            '                    "type": "string"\n'
            '                },'
        ),
        (
            '"handlers.patchVisitorTagDefinitionRequest": {\n'
            '            "type": "object",\n'
            '            "minProperties": 1,\n'
            '            "properties": {\n'
            '                "color": {\n'
            '                    "type": "string",\n'
            f'                    "pattern": "{COLOR_PATTERN}"\n'
            '                },'
        ),
    ),
]

YAML_PATCHES: list[tuple[str, str, str]] = [
    (
        "PatchTicketVisitorRequest minProperties",
        (
            "  handlers.PatchTicketVisitorRequest:\n"
            "    properties:\n"
        ),
        (
            "  handlers.PatchTicketVisitorRequest:\n"
            "    minProperties: 1\n"
            "    properties:\n"
        ),
    ),
    (
        "createVisitorTagDefinitionRequest color pattern",
        (
            "  handlers.createVisitorTagDefinitionRequest:\n"
            "    properties:\n"
            "      color:\n"
            "        type: string\n"
        ),
        (
            "  handlers.createVisitorTagDefinitionRequest:\n"
            "    properties:\n"
            "      color:\n"
            f"        pattern: '{COLOR_PATTERN}'\n"
            "        type: string\n"
        ),
    ),
    (
        "patchVisitorTagDefinitionRequest minProperties + color pattern",
        (
            "  handlers.patchVisitorTagDefinitionRequest:\n"
            "    properties:\n"
            "      color:\n"
            "        type: string\n"
        ),
        (
            "  handlers.patchVisitorTagDefinitionRequest:\n"
            "    minProperties: 1\n"
            "    properties:\n"
            "      color:\n"
            f"        pattern: '{COLOR_PATTERN}'\n"
            "        type: string\n"
        ),
    ),
]


def _apply_json_like(path: Path, patches: list[tuple[str, str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    for _label, before, after in patches:
        if after in text:
            continue
        if before not in text:
            raise SystemExit(
                f"post_swagger_visitor_minprops: expected unpatched block not found in {path}"
            )
        text = text.replace(before, after, 1)
    path.write_text(text, encoding="utf-8")


def _apply_yaml(path: Path, patches: list[tuple[str, str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    for _label, before, after in patches:
        if after in text:
            continue
        if before not in text:
            raise SystemExit(
                f"post_swagger_visitor_minprops: expected unpatched block not found in {path}"
            )
        text = text.replace(before, after, 1)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    for name in ("swagger.json", "docs.go"):
        _apply_json_like(DOCS / name, JSON_PATCHES)
    _apply_yaml(DOCS / "swagger.yaml", YAML_PATCHES)


if __name__ == "__main__":
    main()
