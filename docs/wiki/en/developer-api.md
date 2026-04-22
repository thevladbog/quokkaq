# Developer API, webhooks, and public queue widget

This page describes tenant-facing integration features. **Exact HTTP paths, request bodies, and response schemas** for your deployment are in the **OpenAPI** document served by your API (for example Scalar UI at `/swagger/` and JSON at `/docs/openapi.json` on the API host).

## What your plan allows (`planCapabilities`)

When an authenticated tenant admin calls **`GET /companies/me`**, the JSON includes **`planCapabilities`** — three booleans derived from the company subscription (SaaS operator tenants may have all features enabled regardless of plan):

| Field | Meaning |
|--------|---------|
| `apiAccess` | Integration REST under **`/integrations/v1`** (API keys, OAuth-style scopes on keys). |
| `outboundWebhooks` | Configure HTTPS webhook endpoints and receive signed payloads for ticket lifecycle events. |
| `publicQueueWidget` | Embed a read-only queue status widget on your own site (browser `Origin` allowlist + short-lived JWT). |

The same response includes **`publicApiUrl`** — use this as the API base URL in snippets (do not hardcode a hostname from docs).

If every flag is `false`, the product UI typically hides the Developer API / integrations sections until the subscription is upgraded.

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
