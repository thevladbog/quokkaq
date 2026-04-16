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


def _merge_schema_required(schema: dict[str, Any], extra: list[str]) -> None:
    """Union swagger/kin `required` with extra keys without dropping existing entries."""
    cur = schema.get("required")
    seen: dict[str, None] = {}
    if isinstance(cur, list):
        for x in cur:
            if isinstance(x, str) and x not in seen:
                seen[x] = None
    for x in extra:
        if x not in seen:
            seen[x] = None
    schema["required"] = list(seen.keys())


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


def _response_302_with_location(description: str) -> dict[str, Any]:
    """Standard 302 response with Location header (OpenAPI 3.0.x)."""
    return {
        "description": description,
        "headers": {
            "Location": {
                "description": "Absolute or relative URL the client should follow (RFC 9110).",
                "schema": {"type": "string", "format": "uri"},
            }
        },
    }


def _patch_security_schemes_session_cookie(doc: dict[str, Any]) -> None:
    """Document HttpOnly refresh cookie as an alternative to Bearer for POST /auth/refresh."""
    comp = doc.get("components")
    if not isinstance(comp, dict):
        return
    schemes = comp.get("securitySchemes")
    if not isinstance(schemes, dict):
        return
    schemes.setdefault(
        "SessionCookie",
        {
            "type": "apiKey",
            "in": "cookie",
            "name": "quokkaq_refresh",
            "description": (
                "HttpOnly refresh JWT cookie (same-origin /api). When present, POST /auth/refresh "
                "does not require Authorization. Legacy clients may still send Bearer refresh."
            ),
        },
    )
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return
    refresh = paths.get("/auth/refresh")
    if not isinstance(refresh, dict):
        return
    post = refresh.get("post")
    if not isinstance(post, dict):
        return
    post["security"] = [{"BearerAuth": []}, {"SessionCookie": []}]


def _patch_saml_acs_request_body_required(doc: dict[str, Any]) -> None:
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return
    acs = paths.get("/auth/saml/acs")
    if not isinstance(acs, dict):
        return
    post = acs.get("post")
    if not isinstance(post, dict):
        return
    rb = post.get("requestBody")
    if isinstance(rb, dict):
        rb["required"] = True


def _patch_auth_redirect_302_headers(doc: dict[str, Any]) -> None:
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return
    patches: list[tuple[str, str, str]] = [
        ("/auth/saml/acs", "post", "Redirect to app with one-time code"),
        ("/auth/sso/authorize", "get", "Redirect to IdP authorization endpoint"),
        ("/auth/sso/callback", "get", "Redirect to app after OIDC callback"),
    ]
    for path, method, desc in patches:
        item = paths.get(path)
        if not isinstance(item, dict):
            continue
        op = item.get(method)
        if not isinstance(op, dict):
            continue
        responses = op.get("responses")
        if not isinstance(responses, dict):
            continue
        r302 = responses.get("302")
        if not isinstance(r302, dict):
            continue
        r302.update(_response_302_with_location(desc))


def _patch_login_link_response_schema(doc: dict[str, Any]) -> None:
    comp = _components(doc)
    schemas = comp.get("schemas")
    if not isinstance(schemas, dict):
        return
    schemas["handlers.LoginLinkResponse"] = {
        "type": "object",
        "required": ["token", "exampleUrl"],
        "properties": {
            "token": {
                "type": "string",
                "description": "Opaque tenant login token for strict-tenant links",
            },
            "exampleUrl": {
                "type": "string",
                "format": "uri",
                "description": "Example full login URL including the token query parameter",
            },
        },
    }
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return
    ll = paths.get("/companies/me/login-links")
    if not isinstance(ll, dict):
        return
    post = ll.get("post")
    if not isinstance(post, dict):
        return
    responses = post.get("responses")
    if not isinstance(responses, dict):
        return
    ok = responses.get("200")
    if not isinstance(ok, dict):
        return
    content = ok.get("content")
    if not isinstance(content, dict):
        return
    app_json = content.get("application/json")
    if not isinstance(app_json, dict):
        return
    app_json["schema"] = {"$ref": "#/components/schemas/handlers.LoginLinkResponse"}


def _patch_tenant_hint_sso_protocol_enums(doc: dict[str, Any]) -> None:
    comp = _components(doc)
    th = _schema(comp, "services.TenantHintResponse")
    props = th.get("properties")
    if isinstance(props, dict):
        nxt = props.get("next")
        if isinstance(nxt, dict):
            nxt["enum"] = ["sso", "password", "choose_slug"]
    for schema_name in ("services.CompanySSOGetResponse", "services.CompanySSOPatch"):
        s = _schema(comp, schema_name)
        p = s.get("properties")
        if not isinstance(p, dict):
            continue
        sp = p.get("ssoProtocol")
        if isinstance(sp, dict):
            sp["enum"] = ["oidc", "saml"]


def _patch_auth_sso_authorize_locale_enum(doc: dict[str, Any]) -> None:
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return
    authz = paths.get("/auth/sso/authorize")
    if not isinstance(authz, dict):
        return
    get_op = authz.get("get")
    if not isinstance(get_op, dict):
        return
    params = get_op.get("parameters")
    if not isinstance(params, list):
        return
    for p in params:
        if isinstance(p, dict) and p.get("name") == "locale" and p.get("in") == "query":
            sch = p.get("schema")
            if not isinstance(sch, dict):
                sch = {}
                p["schema"] = sch
            sch["enum"] = ["en", "ru"]
            break


def _patch_statistics_survey_scores_question_ids_param(doc: dict[str, Any]) -> None:
    """Ensure survey-scores questionIds is documented as form-style array (repeat + CSV)."""
    paths = doc.get("paths")
    if not isinstance(paths, dict):
        return
    item = paths.get("/units/{unitId}/statistics/survey-scores")
    if not isinstance(item, dict):
        return
    get_op = item.get("get")
    if not isinstance(get_op, dict):
        return
    params = get_op.get("parameters")
    if not isinstance(params, list):
        return
    for p in params:
        if (
            isinstance(p, dict)
            and p.get("name") == "questionIds"
            and p.get("in") == "query"
        ):
            p["style"] = "form"
            p["explode"] = True
            return


def apply_openapi_tweaks(doc: dict[str, Any]) -> None:
    """Apply extra schema constraints by path under components.schemas.

    Edits are structural (dict keys), not string fragments: resilient to kin-openapi / encoder
    changing JSON key order or indentation. If swag or kin rename models or drop schemas, this
    fails fast with a clear message — adjust the schema names or fields above.
    """
    comp = _components(doc)

    _patch_security_schemes_session_cookie(doc)
    _patch_saml_acs_request_body_required(doc)
    _patch_auth_redirect_302_headers(doc)
    _patch_login_link_response_schema(doc)
    _patch_tenant_hint_sso_protocol_enums(doc)
    _patch_auth_sso_authorize_locale_enum(doc)

    _patch_statistics_survey_scores_question_ids_param(doc)

    patch_visitor = _schema(comp, "handlers.PatchTicketVisitorRequest")
    patch_visitor["minProperties"] = 1

    create_tag = _schema(comp, "handlers.createVisitorTagDefinitionRequest")
    _patch_color_pattern(create_tag, "createVisitorTagDefinitionRequest")

    patch_tag = _schema(comp, "handlers.patchVisitorTagDefinitionRequest")
    patch_tag["minProperties"] = 1
    _patch_color_pattern(patch_tag, "patchVisitorTagDefinitionRequest")

    _patch_create_ticket_request(comp)

    upload_logo = _schema(comp, "handlers.UploadLogoResponse")
    upload_logo["required"] = ["url"]

    upload_completion = _schema(comp, "handlers.UploadSurveyCompletionImageResponse")
    _merge_schema_required(upload_completion, ["url"])

    upload_idle = _schema(comp, "handlers.UploadSurveyIdleMediaResponse")
    _merge_schema_required(upload_idle, ["url"])

    create_survey = _schema(comp, "handlers.createSurveyRequest")
    _merge_schema_required(create_survey, ["title", "questions"])

    guest_submit = _schema(comp, "handlers.guestSurveySubmitRequest")
    _merge_schema_required(guest_submit, ["ticketId", "surveyId", "answers"])

    tenant_hint = _schema(comp, "handlers.tenantHintRequest")
    _merge_schema_required(tenant_hint, ["email"])

    sso_exchange = _schema(comp, "handlers.ssoExchangeRequest")
    _merge_schema_required(sso_exchange, ["code"])

    patch_slug = _schema(comp, "handlers.patchCompanySlugRequest")
    _merge_schema_required(patch_slug, ["slug"])

    patch_survey = _schema(comp, "handlers.patchSurveyRequest")
    patch_survey["minProperties"] = 1

    kiosk_patch = _schema(comp, "handlers.PatchUnitKioskConfigRequest")
    kiosk_patch["required"] = ["config"]
    cfg = kiosk_patch.get("properties", {}).get("config")
    if isinstance(cfg, dict):
        cfg["required"] = ["kiosk"]


def _patch_create_ticket_request(components: dict[str, Any]) -> None:
    """Model POST /units/{unitId}/tickets body as oneOf: anonymous | staff | kiosk."""
    schemas = components.get("schemas")
    if not isinstance(schemas, dict):
        sys.exit("post_swagger_openapi_tweaks: components.schemas missing for create ticket patch")

    anonymous = {
        "type": "object",
        "properties": {
            "serviceId": {"type": "string", "minLength": 1},
        },
        "required": ["serviceId"],
        "additionalProperties": False,
    }
    staff = {
        "type": "object",
        "properties": {
            "serviceId": {"type": "string", "minLength": 1},
            "clientId": {"type": "string", "minLength": 1},
        },
        "required": ["serviceId", "clientId"],
        "additionalProperties": False,
    }
    kiosk = {
        "type": "object",
        "properties": {
            "serviceId": {"type": "string", "minLength": 1},
            "visitorPhone": {"type": "string", "minLength": 1},
            "visitorLocale": {"type": "string", "enum": ["en", "ru"]},
        },
        "required": ["serviceId", "visitorPhone", "visitorLocale"],
        "additionalProperties": False,
    }
    schemas["handlers.CreateTicketRequestAnonymous"] = anonymous
    schemas["handlers.CreateTicketRequestStaff"] = staff
    schemas["handlers.CreateTicketRequestKiosk"] = kiosk
    schemas["handlers.CreateTicketRequest"] = {
        "oneOf": [
            {
                "$ref": "#/components/schemas/handlers.CreateTicketRequestAnonymous",
            },
            {"$ref": "#/components/schemas/handlers.CreateTicketRequestStaff"},
            {"$ref": "#/components/schemas/handlers.CreateTicketRequestKiosk"},
        ],
    }


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
