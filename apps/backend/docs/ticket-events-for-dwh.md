# Ticket events for DWH and external analytics

This document describes the append-only audit stream in PostgreSQL table `ticket_histories`, how to replicate it, and how to derive common queue KPIs.

## Storage model

| Column       | Type      | Meaning |
|-------------|-----------|---------|
| `id`        | uuid      | Row id |
| `ticket_id` | uuid      | Ticket the event belongs to |
| `action`    | text      | Stable machine-readable event type (see below) |
| `user_id`   | uuid, null | Authenticated actor when known (JWT user) |
| `payload`   | jsonb     | Context: `unit_id`, statuses, counters, reasons, etc. |
| `created_at`| timestamptz | Event time (`occurred_at` for analytics) |

Payload keys use **snake_case**. Join to `tickets` for current snapshot fields (`queue_number`, `is_eod`, `called_at`, `last_called_at`, `completed_at`, …).

## Action catalog

| `action` | When emitted |
|----------|----------------|
| `ticket.created` | Ticket row inserted (`waiting`) |
| `ticket.called` | Ticket moves to `called` (call-next from unit or counter UI, or `pick`) |
| `ticket.recalled` | Recall: status stays `called`, `last_called_at` updated on `tickets` |
| `ticket.status_changed` | Any other status change via PATCH, or supervisor **force release** (`completed`) |
| `ticket.transferred` | Ticket moved to another counter; status set to `waiting` |
| `ticket.returned_to_queue` | Ticket returned to queue (`waiting`, counter cleared) |
| `ticket.eod_flagged` | End-of-day: `is_eod` will be set on the ticket (one row per ticket, same transaction) |

Constants live in Go: `internal/ticketaudit/ticketaudit.go`.

### Typical `payload` fields

- **All relevant rows**: `unit_id`, often `service_id`
- **Counter-related**: `counter_id`, `from_counter_id`, `to_counter_id`
- **Status transitions**: `from_status`, `to_status`
- **Provenance**: `source` (`public_issue`, `pre_registration_redeem`, `unit_call_next`, `counter_call_next`, `pick`) or `reason` (`api_status_patch`, `force_release`)

## Getting data out (CDC / export / webhooks)

The product does not ship a dedicated webhook for ticket history. Typical options:

1. **Logical replication / CDC** from PostgreSQL to ClickHouse, BigQuery, or another warehouse (Debezium, native replication, managed CDC).
2. **Periodic batch export**: `COPY` or incremental `SELECT … WHERE created_at > :cursor` on `ticket_histories` (and optionally `tickets`).
3. **Application webhook** (future): subscribe to the same transitions the API already performs and push normalized events; not implemented in this repo.

## Derived metrics (for analysts)

Definitions below assume events are ordered by `created_at` per `ticket_id`. Cross-check terminal state with `tickets` when needed.

### Wait to first call (`wait_to_call`)

Time from ticket creation to first **call** to the visitor:

- Start: `ticket.created` → `created_at`
- End: first `ticket.called` **or** first `ticket.status_changed` where `to_status = 'called'` (should not be needed if `ticket.called` is always written)

If the ticket never reaches `called`, the interval is **censored** (use `tickets.completed_at` / final status for reporting rules).

### Wait at counter / “second wait” (`at_counter_wait`)

Time from **first call** until service actually starts:

- Start: first `ticket.called` (`created_at`)
- End: first `ticket.status_changed` with `to_status = 'in_service'`

Adjust if your product uses a different “start service” signal.

### Service duration (`service_duration`)

Time from start of service until completion:

- Start: `to_status = 'in_service'` on `ticket.status_changed`
- End: `to_status` in `served`, `no_show`, or `completed` (force release uses `completed` with `reason = 'force_release'`)

Use **last** matching end event if multiple transitions occur.

### Recall and `last_called_at`

- `ticket.recalled` does **not** change `from_status` / `to_status` in payload (status remains `called`). For “number of recalls”, count `ticket.recalled` rows.
- For “time of last call to display”, use `tickets.last_called_at` or the **latest** among (`ticket.called`, `ticket.recalled`) by `created_at`.

### End of day

- `ticket.eod_flagged` marks that the ticket was included in an EOD run **before** `is_eod` was flipped. Filter EOD cohorts with this action or with `tickets.is_eod = true`.

## Status vocabulary (current backend)

Common values: `waiting`, `called`, `in_service`, `served`, `no_show`, `completed`. New values should be documented when added; event payloads always carry explicit `from_status` / `to_status` when the transition changes status.
