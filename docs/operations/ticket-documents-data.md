# Ticket `documentsData` and kiosk user-provided fields

Operator / developer runbook. End-user help is not covered here.

## What is stored

- **`tickets.documents_data`** (JSONB): key/value from the kiosk — e.g. document OCR line (`idDocumentOcr`) or custom field keys from service `kioskIdentificationConfig.apiFieldKey`.
- **`tickets.documents_data_expires_at`**: server-set timestamp for TTL. Document mode and **sensitive** custom data get an expiry; non-sensitive custom may have `NULL` (no automatic purge by cron).

## Retention and cron

- A periodic job in [`apps/backend/cmd/api/main.go`](../../apps/backend/cmd/api/main.go) calls [`ClearExpiredTicketDocuments`](../../apps/backend/internal/repository/ticket_repository.go) (PostgreSQL: `NOW()`). Rows with `documents_data_expires_at < now` are cleared (`documents_data` and expiry set to `NULL`).
- **Unit test** (SQLite) uses a parallel helper in [`ticket_clear_expired_document_test.go`](../../apps/backend/internal/repository/ticket_clear_expired_document_test.go) for the same predicate with `datetime('now')` — not the production SQL string, but the same behavior.

## DWH and exports

- **Do not** assume `documentsData` is replicated to analytics or DWH. Product policy: no automatic bulk export of PII; staff access is a separate concern from any future **integration / partner API** (out of scope until those endpoints exist).

## Permission: `tickets.user_data.read`

- Slug: `tickets.user_data.read` ([`rbac.PermTicketsViewUserData`](../../apps/backend/internal/rbac/permissions.go)).
- **Not** part of [`DefaultInvitationUnitPermissions`](../../apps/backend/internal/rbac/permissions.go) — grant explicitly where staff should see OCR/custom fields in API and staff/supervisor UI.
- Server strips `documentsData` (and related) when the caller is not allowed; see `applyTicketUserDataForHTTP` in [`ticket_handler.go`](../../apps/backend/internal/handlers/ticket_handler.go).

## Public ticket status page (`/ticket/[id]`)

- **`GET /tickets/{id}`** may return `documentsData` when the request includes **`X-Visitor-Token`** matching `ticket.visitorToken` (see handler).
- The web app stores the token in **`sessionStorage`** under `visitor_token_{ticketId}` (see [`ticket/[ticketId]/page`](../../apps/frontend/app/[locale]/ticket/[ticketId]/page.tsx) and virtual-queue / kiosk when a ticket is issued). Polling and initial load pass this header via [`ticketsApi.getById`](../../apps/frontend/lib/api.ts).
- A **plain QR** or link to `/ticket/{id}` **without** a prior same-origin session (or another device) will **not** send the token: `documentsData` is omitted — only queue status, etc.

## Regenerating API clients

- After swag / OpenAPI changes: `pnpm nx run backend:openapi` (or your usual pipeline) and `pnpm nx run frontend:orval` from the monorepo root.
