#!/usr/bin/env python3
"""Re-apply schema tweaks swag does not emit: minProperties on PATCH visitor body.

Run after: swag init -g cmd/api/main.go -o ./docs
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

# Unpatched (plain swag output)
JSON_BEFORE = (
    '"handlers.PatchTicketVisitorRequest": {\n'
    '            "type": "object",\n'
    '            "properties": {'
)
# Patched (committed / CI expected)
JSON_AFTER = (
    '"handlers.PatchTicketVisitorRequest": {\n'
    '            "type": "object",\n'
    '            "minProperties": 1,\n'
    '            "properties": {'
)

YAML_BEFORE = (
    "  handlers.PatchTicketVisitorRequest:\n"
    "    properties:\n"
)
YAML_AFTER = (
    "  handlers.PatchTicketVisitorRequest:\n"
    "    minProperties: 1\n"
    "    properties:\n"
)


def main() -> None:
    for name, before, after in (
        ("swagger.json", JSON_BEFORE, JSON_AFTER),
        ("docs.go", JSON_BEFORE, JSON_AFTER),
        ("swagger.yaml", YAML_BEFORE, YAML_AFTER),
    ):
        path = DOCS / name
        text = path.read_text(encoding="utf-8")
        if after in text:
            continue
        if before not in text:
            raise SystemExit(
                f"post_swagger_visitor_minprops: expected unpatched block not found in {path}"
            )
        path.write_text(text.replace(before, after, 1), encoding="utf-8")


if __name__ == "__main__":
    main()
