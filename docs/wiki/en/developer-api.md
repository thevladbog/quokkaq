# Developer API, webhooks, and public queue widget

This page describes tenant-facing integration features. **Exact HTTP paths, request bodies, and response schemas** for your deployment are in the **OpenAPI** document served by your API (for example Scalar UI at `/swagger/` and JSON at `/docs/openapi.json` on the API host).

## What your plan allows (`planCapabilities`)

When an authenticated tenant admin calls **`GET /companies/me`**, the JSON includes **`planCapabilities`** — three booleans derived from the company subscription (SaaS operator tenants may have all features enabled regardless of plan):

| Field | Meaning |
|--------|---------|
| `apiAccess` | Integration REST under **`/integrations/v1`** (API keys, OAuth-style scopes on keys). |
| `outboundWebhooks` | Configure HTTPS webhook endpoints and receive signed payloads for ticket lifecycle events. |
| `publicQueueWidget` | Embed a read-only queue status widget on your own site (browser `Origin` allowlist + short-lived JWT). |
| `kioskEmployeeIdp` | **Employee badge / login (server-side IdP proxy)** — configure per-unit external HTTPS lookup, kiosk/staff call **`POST /units/{unitId}/employee-idp/resolve`**; secrets never leave the server. |

The same response includes **`publicApiUrl`** — use this as the API base URL in snippets (do not hardcode a hostname from docs).

If every flag is `false`, the product UI typically hides the Developer API / integrations sections until the subscription is upgraded.

## Employee IdP (badge / login) — for your **HR or directory HTTP API** (not QuokkaQ’s REST)

**Audience:** the team that hosts the **employee or card directory** that must answer *“who is this badge or this login?”* for a given unit.  
QuokkaQ does **not** expose your API keys or HMAC material to the browser. The product calls **only from the QuokkaQ server** to an **HTTPS** URL you configure in unit settings. **Requires** `kioskEmployeeIdp` in **`planCapabilities`**; resolution from the kiosk uses a **terminal** session.

**What you implement (your HTTPS endpoint):**

- **URL:** one HTTPS URL per unit (e.g. `https://id.example.com/api/employee/resolve`). Only **`https`**; loopback, literal private IPs, and hostnames that resolve only to private addresses are **rejected** (SSRF hardening on the QuokkaQ side).
- **Request:** built from a **JSON body template** in QuokkaQ (Go `text/template`) with this data: **`Raw`**, **`Login`**, **`Kind`** (`badge` or `login`), **`Ts`** (Unix seconds). For a badge reader, the kiosk sends the scanned string; for the on-screen keyboard, **`Kind`** is `login` and the typed value is in **`Raw`/`Login`**.
- **Headers:** optional; values can reference stored secrets with **`${secret:NAME}`** (name matches a secret row in the unit; plaintext is only on the server after save).
- **Response:** valid JSON. QuokkaQ reads the employee email with a **gjson path** you configure (e.g. `data.email`) and optionally a display name path. The email is matched to a **user in the same company**; there is no automatic directory sync—users must already exist in QuokkaQ.

**What you must *not* log in your own systems (recommended):** the raw badge or login in clear text, or the full QuokkaQ user object; keep correlation IDs and outcomes only, in line with your DPA/152‑FЗ obligations.

**QuokkaQ routes (from your side as a consumer, not the HR API):**

- **`POST /units/{unitId}/employee-idp/resolve`** with body `{ "kind": "badge"|"login", "raw": "…" }` (terminal JWT + kiosk access). **OpenAPI** is the contract for **HTTP status codes** and the normalized **`matchStatus` / `userId`** view returned to the client.
- **Admin:** **`GET`/`PATCH /units/{unitId}/employee-idp`** with permission **`unit.employee_idp.manage`** — no secret values in `GET` responses. **`PATCH`** accepts optional **`secretNamesToDelete`**: a string array of **named** secret keys to remove from the unit.
- **Web (staff) vs badge:** the **browser** staff and admin apps use the normal product **SSO** session. **Employee IdP resolve** (badge/keyboard) is for **kiosk/terminal** sessions that call the route above — do not reimplement resolve from a plain staff browser; keep identity on SSO. **Badge** identification is a **kiosk (or counter)** app concern.
- **`matchStatus`:** in addition to **`matched`** (with `userId`) and **`no_user`**, the API may return **`ambiguous`** when the upstream email matches **more than one** user in the company (tenant should fix duplicate people data). The resolve endpoint is **rate-limited** per client IP and unit (see operator runbook; HTTP **429** when exceeded).
- **Services with `identificationMode: "qr"`** on the kiosk depend on **pre-registration / appointment check-in** being enabled; if not, the product should not leave users in a dead-end (see in-app help for mode matrix).

## Integration REST (`/integrations/v1`)

- Authenticate with an **integration API key** issued in Settings (see OpenAPI for the header name and format).
- Keys carry **scopes**; each route documents required scopes. Example read-only route: **`GET /integrations/v1/units/{unitId}/queue-summary`** (requires `tickets:read` on the key; routes that create or change data need `tickets:write` where OpenAPI says so).
- **Rate limiting (per integration key on `/integrations/v1`):** with **`INTEGRATION_API_RL_REDIS=true`** and Redis: **up to 180 requests per key in a 60s sliding window**; shared across replicas. Otherwise: in-process limiter (~**2 req/s** sustained, **burst 60**), **resets on API restart**, **not shared** across instances.

## Webhooks

- Create, list, update, and delete webhook endpoints under **`/companies/me/webhook-endpoints`** (Bearer session of a user who is allowed to manage company settings).
- **Rotate signing secret** via the documented `POST …/rotate-secret` route when you suspect compromise; update your verifier on the receiving side immediately.
- **Delivery format, signature header, payload:** use **OpenAPI/Scalar** on your API as the tenant-facing source. **Operator-only runbooks** (if you self-host with internal docs) do not replace OpenAPI for integrators.

## Public queue widget (embed)

**Server requirement:** the deployment must set **`PUBLIC_WIDGET_JWT_SECRET`** so the API can mint and verify HS256 JWTs for embed tokens. JWTs include an **`exp`** claim; signing uses this secret.

**Token lifetime:** `POST /companies/me/public-widget-token` defaults to **900 seconds (15 min)** if `ttlSeconds` is omitted; you may set **`ttlSeconds` from 60 to 86400**. Re-issue before expiry; `GET /companies/me` still provides **`publicApiUrl`** and plan info for your snippets.

**Browser security:** only origins listed in **`publicQueueWidgetAllowedOrigins`** inside **`company.settings`** may load the widget in a browser (CORS). Each entry must be a full origin such as `https://kiosk.example.com` (scheme + host, optional port; no path). Configure this in Settings together with the embed snippet (the UI shows a copyable example using `publicApiUrl` from `GET /companies/me`).

**Operational note:** rotating `PUBLIC_WIDGET_JWT_SECRET` invalidates previously issued widget tokens until you embed new tokens.

## Where to look next

- **OpenAPI / Scalar** on your API base — authoritative list of routes and models.
- In-repo operator wiki (MDX) under `apps/frontend/content/wiki/` may duplicate some topics for in-app `/help`; this `docs/wiki/` tree is a **staging** copy for integration topics until content is merged into the product wiki.
