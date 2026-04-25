# Ops Track — Health Endpoints + Error Tracking — Design Document

**Status:** Approved (single brainstorm pass — all locked-in via session questions).
**Date:** 2026-04-25
**Audience:** Backend / frontend / SRE / kiosk team
**Track:** Operational hardening, parallel to the SCIM Enterprise track.
**Sibling specs:** SCIM 2.0 design doc (`2026-04-25-scim-2.0-enterprise-provisioning-design.md`).

---

## Context

QuokkaQ today has solid OpenTelemetry tracing (existing OTel pipeline, OTLP HTTP export) and structured `slog` logging, but two operational gaps surfaced during the strategic review:

1. **No centralized error tracking.** Errors land in stdout / log aggregators only. Operators see `tail -F log` style discovery, not aggregated/grouped/alertable error feed. Integration with Plane/Yandex Tracker is for issue tracking, not real-time error capture.
2. **No explicit health endpoints.** The k8s/Yandex-Cloud-LB liveness/readiness checks rely on best-effort path responses. No formal `/health/*` contract, no readiness gating around DB / Redis / MinIO availability.

This document specifies: (1) self-hosted GlitchTip as the error-tracking backend covering Go backend + Next.js frontend + Tauri/Rust kiosk; (2) k8s-style `/health/live` + `/health/ready` endpoints on the backend (and corresponding Next.js routes for frontend / marketing).

This unblocks the public status page sibling (Enterprise pack), the Prometheus/Grafana dashboards (SCIM Plan 3 dependency), and any future reliability work.

**Out of scope:**
- Public status page (separate Enterprise-pack item)
- Prometheus / Grafana metrics (covered by SCIM Plan 3 partially; broader rollout — separate spec)
- Log aggregation (Loki / ELK) — orthogonal
- Distributed tracing UI (Jaeger / Tempo) — already covered by existing OTel pipeline
- APM (per-request profiling) — not needed yet

---

## Decisions (locked-in via brainstorming)

| # | Decision | Rationale |
|---|---|---|
| 1 | **GlitchTip self-hosted** in Yandex Cloud (same region as production backend). | Sentry-compatible SDKs work unchanged; MIT-licensed; data residency for 152-ФЗ; modest infra footprint compared to self-hosted Sentry. |
| 2 | **Scope: Backend + Frontend + Kiosk Desktop** (Go via `getsentry/sentry-go`, Next.js via `@sentry/nextjs`, Tauri/Rust via `sentry-rust`). | Full coverage of the failure surface end users / operators see; matches existing product surface. |
| 3 | **Health endpoints: k8s-style `/health/live` + `/health/ready`.** | Standard for Yandex Cloud Kubernetes load balancers; clear separation of "process alive" from "deps available". |
| 4 | **PII redaction is mandatory at SDK level** (not only post-hoc). | 152-ФЗ obligation; user emails / phones / passport fragments must never leave the process to GlitchTip. |
| 5 | **Release tagging via git SHA from CI** for source-map upload + breadcrumbs. | Without it, GlitchTip groups errors poorly across deploys. |
| 6 | **Sentry SDK transport via project-controlled DSN proxy** for the public-facing kiosk. | Kiosk DSN should not be embedded in shipped binaries — proxy through backend so we can rotate/revoke. |

---

## Section 1 — GlitchTip topology

### 1.1 Deployment

**Runtime:** Yandex Cloud, same Kubernetes cluster as the backend. Three components:

```
GlitchTip stack (in-cluster):
  - glitchtip-web      (Django HTTP frontend)        × 2 replicas
  - glitchtip-worker   (Celery event ingestion)      × 3 replicas
  - postgres-glitchtip (events DB)                   1 instance, persistent volume
  - redis-glitchtip    (Celery broker)               1 instance
```

Backed by:
- Yandex Object Storage bucket (`glitchtip-attachments-prod`) for source maps and attachments
- Yandex Managed PostgreSQL **alternative path** if GlitchTip's own postgres struggles at scale; default is in-cluster postgres because GlitchTip's volume is moderate.

**Hosting at:** `errors.quokkaq.ru` (DNS A record → ingress controller). TLS via existing cert-manager + Let's Encrypt OR Yandex CertManager.

### 1.2 Authentication & access

- **Web UI:** SSO from existing `auth.quokkaq.ru` if feasible; otherwise GlitchTip's built-in user mgmt with admin invite flow.
- **DSN:** per-project (one for `quokkaq-backend`, one for `quokkaq-frontend`, one for `quokkaq-kiosk`), rotatable via web UI.
- **Network policy:** GlitchTip ingress is **internal-only** for SDK ingestion (only the apps' pods can POST events), web UI is public over TLS with auth.

### 1.3 Sizing (estimate)

For a baseline of 100 tenants × 50 events/day each = 5000 events/day → ~5MB/day events + breadcrumbs, ~50MB/month. Postgres < 1GB/year. Source maps: ~30MB/release × 50 releases/year = 1.5 GB/year.

Two web replicas + three workers handle 100 events/sec burst with headroom. Scale later if signal indicates.

---

## Section 2 — Health endpoints contract

### 2.1 `/health/live` — process liveness

**Purpose:** answer "is the process alive and able to serve HTTP" — used by the LB / k8s liveness probe to decide restart.

```
GET /health/live HTTP/1.1
→
HTTP/1.1 200 OK
Content-Type: application/json
{
  "status": "ok",
  "version": "v1.42.7",
  "git_sha": "a1b2c3d",
  "uptime_seconds": 12345,
  "timestamp": "2026-04-25T10:00:00Z"
}
```

Always 200 unless the process is critically wedged. **No external calls.** Constant-time response.

### 2.2 `/health/ready` — readiness (deps available)

**Purpose:** answer "can this instance serve real requests" — used by the LB readiness probe to decide whether to send traffic.

Checks executed in parallel with a 2-second budget:
- **PostgreSQL ping** (`SELECT 1`)
- **Redis ping** (`PING`)
- **MinIO/S3 head bucket** (HEAD on a non-sensitive bucket)
- **Asynq broker connectivity** (separate Redis client — same instance OK)

```
GET /health/ready HTTP/1.1
→
HTTP/1.1 200 OK         ← all deps ok
{
  "status": "ok",
  "checks": {
    "postgres": {"status": "ok", "latency_ms": 3},
    "redis":    {"status": "ok", "latency_ms": 1},
    "minio":    {"status": "ok", "latency_ms": 12},
    "asynq":    {"status": "ok", "latency_ms": 2}
  }
}

OR

HTTP/1.1 503 Service Unavailable
{
  "status": "degraded",
  "checks": {
    "postgres": {"status": "ok", "latency_ms": 3},
    "redis":    {"status": "fail", "error": "connection refused"},
    "minio":    {"status": "ok", "latency_ms": 12},
    "asynq":    {"status": "ok", "latency_ms": 2}
  }
}
```

Caching: results cached 5 seconds — multiple LB probes per second don't hammer deps.

### 2.3 Auth posture

`/health/live` — open (probe traffic). `/health/ready` — open by default but rate-limited per-IP at the edge (existing public RL middleware) since it's slightly more expensive.

If concern about info leak from `checks[*].error` strings: in production return only `{"status": "ok|degraded"}` and put detail in logs. Configurable via `HEALTH_VERBOSE` env (default `false` in prod, `true` in dev).

### 2.4 Frontend / marketing

Next.js apps get `/api/health` route (Next route handler) returning the same shape. Used by the LB / Vercel-equivalent health checks.

---

## Section 3 — Error tracking integration

### 3.1 Backend (Go)

**SDK:** `getsentry/sentry-go` v0.27+. Initialized at process start in `cmd/api/main.go`:

```go
err := sentry.Init(sentry.ClientOptions{
    Dsn:              os.Getenv("SENTRY_DSN_BACKEND"),
    Environment:      os.Getenv("ENVIRONMENT"), // "production" | "staging"
    Release:          buildInfo.GitSHA,
    SampleRate:       1.0,           // capture all errors
    TracesSampleRate: 0,             // tracing covered by OTel; don't double-sample
    BeforeSend:       redactor.RedactEvent,
    EnableTracing:    false,
    AttachStacktrace: true,
    SendDefaultPII:   false,         // explicit
})
```

**Integration points:**
- HTTP middleware that captures panics + 5xx responses → Sentry
- Asynq error handler that captures task failures
- `slog.Error(...)` calls in critical paths additionally call `sentry.CaptureException(err)`

**PII redaction (`BeforeSend`):**
- Strip `request.headers.authorization`
- Strip `request.headers.cookie`
- Strip request bodies entirely from breadcrumbs (they may contain emails/phones/passport data)
- Strip `extra.user.email`, `extra.user.phone` if present
- Replace `email_hash` / `phone_hash` is OK (already hashed)

### 3.2 Frontend (Next.js)

**SDK:** `@sentry/nextjs` v8+. Configured via `next.config.ts` and three init files:
- `sentry.server.config.ts` (server-side errors during SSR)
- `sentry.client.config.ts` (browser errors)
- `sentry.edge.config.ts` (edge runtime — not used by frontend; safe default)

**Source maps:** uploaded during CI via `@sentry/cli` to GlitchTip; release tag = git SHA. This lets GlitchTip un-minify stack traces.

**PII redaction (`beforeSend` hook):**
- Same rules as backend
- Plus: scrub form values (React Hook Form fields) before sending breadcrumb
- Disable session replay PII capture (or disable session replay entirely for v1)

### 3.3 Kiosk Desktop (Tauri/Rust + JS)

Two surfaces:

**Rust side** (`apps/kiosk-desktop/src-tauri/src/main.rs`):
```rust
let _guard = sentry::init((
    env!("SENTRY_DSN_KIOSK"),
    sentry::ClientOptions {
        release: sentry::release_name!(),
        environment: Some(env::var("ENVIRONMENT").unwrap_or_default().into()),
        before_send: Some(Arc::new(redactor::redact_event)),
        ..Default::default()
    },
));
```

**JS side (webview)** — uses the frontend Sentry config but with kiosk-specific tags (`environment=kiosk`, `tenant_slug` from bootstrap).

**DSN proxy** (decision #6): kiosk binaries do not embed the DSN. They fetch it on startup from `https://api.quokkaq.ru/kiosk/sentry-config` after authenticating with the device API key. This lets us rotate / revoke the DSN per fleet without re-shipping binaries. Backend endpoint returns:
```json
{ "dsn": "https://....@errors.quokkaq.ru/3", "environment": "production", "release": "kiosk-v2.4.1" }
```

### 3.4 Release tagging

CI passes git SHA as build flag:
- Go: `-ldflags="-X main.gitSHA=$GITHUB_SHA"`
- Next.js: `NEXT_PUBLIC_GIT_SHA` env at build time
- Kiosk: `RELEASE_TAG` env at build time

Each SDK uses this as the `release` field. GlitchTip groups errors by release for regression detection.

### 3.5 Tags on every event

Standard tags emitted by all three SDKs:
- `service` — `quokkaq-backend` / `quokkaq-frontend` / `quokkaq-kiosk`
- `environment` — `production` / `staging` / `dev`
- `release` — git SHA
- `tenant_slug` — captured from request context if available (backend) or bootstrap (kiosk)
- `route_template` — backend: chi route pattern; frontend: Next.js route

These tags drive filtering / grouping in GlitchTip UI and alert rules.

---

## Section 4 — Alerts (initial set)

GlitchTip alert rules:

| Alert | Condition | Severity |
|---|---|---|
| **New issue** | First time this fingerprint is seen in production | medium → Telegram channel #ops |
| **Regression** | Issue was resolved, now firing again | high → Telegram + on-call page |
| **Frequency spike** | Any issue >50 events / 5 min | high → on-call page |
| **Critical service** | Any error tagged `service=quokkaq-backend` AND endpoint matches `/scim/v2/*` (after SCIM ships) | high |
| **Kiosk fleet** | >5 distinct kiosks reporting errors / hour | medium |

Alert routing: GlitchTip → webhook → existing internal alert pipeline (Plane / Tracker / Telegram bot).

---

## Section 5 — Security & data handling

### 5.1 Data residency

GlitchTip + its Postgres + its Object-Storage bucket all in Yandex Cloud `ru-central1` region. No cross-border data transfer.

### 5.2 PII handling

`BeforeSend` redaction is enforced at SDK level (decision #4). A code-review checklist item: any new `sentry.CaptureException` call must be reviewed for PII in the surrounding context. Audit every quarter.

### 5.3 Retention

- Production events: 90 days
- Staging/dev events: 14 days
- Source maps: forever (small, useful for old-version forensics)

Configurable in GlitchTip settings.

### 5.4 Access

Only QuokkaQ engineering and on-call. Not customer-facing. No tenant-isolated dashboards (events are aggregated across tenants for engineering visibility).

---

## Section 6 — Rollout

Single phase (no alpha/beta/GA gates needed for an internal observability tool):

1. Deploy GlitchTip stack to staging cluster, verify ingestion via `curl`.
2. Wire backend SDK → staging GlitchTip → push deliberate errors → verify they appear.
3. Wire frontend SDK → push deliberate errors → verify source maps work.
4. Wire kiosk SDK → install one staging kiosk → trigger error → verify.
5. Configure alert rules → trip each manually → verify Telegram delivery.
6. Repeat for production cluster.
7. Update on-call runbook with GlitchTip URL and how to triage.

Total: ~1–2 weeks.

---

## Open questions

- **GlitchTip auth scheme** (decision deferred to implementation) — built-in or SSO from existing auth provider. Built-in is faster; SSO is consistent with rest of internal tooling. Pick after seeing how GlitchTip handles invites.
- **Health endpoint detail in production.** Default `HEALTH_VERBOSE=false` → minimal body. Some teams prefer always-verbose for debugging incidents. Confirm with on-call.

## References

- [GlitchTip docs](https://glitchtip.com/documentation)
- [Sentry SDK reference (compat target)](https://docs.sentry.io/platforms/)
- [Kubernetes liveness/readiness/startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- 152-ФЗ ст. 18.1 — operator/processor relationship
- Companion SCIM design — `2026-04-25-scim-2.0-enterprise-provisioning-design.md`
