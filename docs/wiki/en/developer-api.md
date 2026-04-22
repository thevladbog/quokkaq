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
- Keys carry **scopes**; each route documents required scopes. Example read-only route: **`GET /integrations/v1/units/{unitId}/queue-summary`** (requires `tickets.read` on the key).
- **Rate limiting:** your operator may set `INTEGRATION_API_RL_REDIS=true` on the server so limits are enforced with Redis (shared across instances). If unset or `false`, the API uses an in-memory limiter (fine for single-node dev).

## Webhooks

- Create, list, update, and delete webhook endpoints under **`/companies/me/webhook-endpoints`** (Bearer session of a user who is allowed to manage company settings).
- **Rotate signing secret** via the documented `POST …/rotate-secret` route when you suspect compromise; update your verifier on the receiving side immediately.
- Delivery semantics, retry behavior, and payload shape are defined in OpenAPI and any operator runbooks — verify the **`X-QuokkaQ-Signature`** (or documented header) using the current signing secret.

## Public queue widget (embed)

**Server requirement:** the deployment must set **`PUBLIC_WIDGET_JWT_SECRET`** so the API can mint and verify HS256 JWTs for embed tokens.

**Browser security:** only origins listed in **`publicQueueWidgetAllowedOrigins`** inside **`company.settings`** may load the widget in a browser (CORS). Each entry must be a full origin such as `https://kiosk.example.com` (scheme + host, optional port; no path). Configure this in Settings together with the embed snippet (the UI shows a copyable example using `publicApiUrl` from `GET /companies/me`).

**Operational note:** rotating `PUBLIC_WIDGET_JWT_SECRET` invalidates previously issued widget tokens until you embed new tokens.

## Where to look next

- **OpenAPI / Scalar** on your API base — authoritative list of routes and models.
- In-repo operator wiki (MDX) under `apps/frontend/content/wiki/` may duplicate some topics for in-app `/help`; this `docs/wiki/` tree is a **staging** copy for integration topics until content is merged into the product wiki.
