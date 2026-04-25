# Ops Track — Health Endpoints + Error Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up self-hosted GlitchTip in Yandex Cloud, instrument backend (Go) + frontend (Next.js) + kiosk desktop (Tauri/Rust + JS) with Sentry-compatible SDKs, expose k8s-style `/health/live` + `/health/ready` endpoints on the backend and `/api/health` on the Next.js apps, wire alerts to the existing Telegram channel, and document the on-call workflow.

**Architecture:** GlitchTip stack (web + workers + Postgres + Redis) in the production Kubernetes cluster, fronted by `errors.quokkaq.ru`. Three Sentry-DSN-keyed projects (backend/frontend/kiosk). Health checks done in parallel with a 2-second budget and 5-second result cache. Kiosk DSN proxied through a backend endpoint to allow rotation without re-shipping binaries.

**Tech Stack:** GlitchTip (open source, MIT), `getsentry/sentry-go` v0.27+, `@sentry/nextjs` v8+, `sentry` Rust crate, existing chi router / Next.js / Tauri.

**Source spec:** `docs/plan/2026-04-25-ops-track-health-and-error-tracking-design.md`

**Out of scope:** Public status page (Enterprise pack); broader Prometheus / Grafana rollout (covered partially by SCIM Plan 3); log aggregation; APM.

---

## File structure

### Created files

```
apps/backend/internal/health/
├── live.go
├── ready.go
└── checks/
    ├── postgres.go
    ├── redis.go
    ├── minio.go
    └── asynq.go

apps/backend/internal/observability/sentry/
├── init.go                    # SDK setup
├── redactor.go                # PII scrubbing
├── middleware.go              # HTTP error capture
└── asynq_handler.go           # Asynq error handler

apps/backend/internal/scim/handlers/  (or wherever — see kiosk endpoint)
└── kiosk_sentry_config.go     # GET /kiosk/sentry-config (DSN proxy)

apps/frontend/sentry.server.config.ts
apps/frontend/sentry.client.config.ts
apps/frontend/sentry.edge.config.ts
apps/frontend/app/api/health/route.ts
apps/frontend/lib/sentry/redactor.ts

apps/marketing/sentry.server.config.ts (mirror)
apps/marketing/app/api/health/route.ts

apps/kiosk-desktop/src-tauri/src/observability/
├── sentry_init.rs
└── redactor.rs

ops/glitchtip/
├── deployment.yaml             # k8s manifests OR docker-compose.yml
├── ingress.yaml
└── README.md                   # how to deploy / upgrade

docs/operations/
├── error-tracking-runbook.md
└── health-checks.md
```

### Modified files

| File | Change |
|---|---|
| `apps/backend/cmd/api/main.go` | Init Sentry SDK, register health endpoints, register Sentry-aware Asynq error handler |
| `apps/backend/internal/asynq/...` | Wrap task handlers with Sentry error capture |
| `apps/frontend/next.config.ts` | `withSentryConfig({ ... })` wrapper |
| `apps/frontend/app/layout.tsx` | Sentry user context (anonymous; no PII) |
| `apps/kiosk-desktop/src-tauri/src/lib.rs` | Init Sentry guard at startup |
| `apps/kiosk-desktop/src/...` | JS-side Sentry init, fetch DSN from backend |
| `.github/workflows/deploy-*.yml` | Pass `SENTRY_DSN_*` and source-map upload step |
| `apps/backend/Dockerfile` | Embed git SHA via build arg |
| `.env.example` | Add `SENTRY_DSN_BACKEND`, `SENTRY_DSN_FRONTEND`, `SENTRY_DSN_KIOSK_PROXY`, `HEALTH_VERBOSE` |

---

## Phase A — GlitchTip provisioning

### Task 1 — Deploy GlitchTip to staging cluster

**Files:**
- Create: `ops/glitchtip/deployment.yaml`
- Create: `ops/glitchtip/ingress.yaml`
- Create: `ops/glitchtip/README.md`

- [ ] **Step 1.1: Pick deployment shape**

Two viable paths:

**A. k8s manifests** (recommended if cluster is the standard infra):
```yaml
# deployment.yaml — three Deployments (web, worker, beat) + Postgres StatefulSet + Redis StatefulSet
# Image: glitchtip/glitchtip:latest (pin to a specific tag for reproducibility)
```

**B. docker-compose** if running on a single VM (faster start, less HA).

Pick A; document A in README.md. (If cluster doesn't exist for staging, fall back to B.)

- [ ] **Step 1.2: Configure persistent storage**

Yandex Cloud Storage Class (`yc-network-ssd`) for Postgres PVC; size 10Gi initial. Backup via the cluster's existing snapshot policy.

- [ ] **Step 1.3: Wire DNS + ingress**

`errors.staging.quokkaq.ru` → ingress controller. TLS via cert-manager (existing).

- [ ] **Step 1.4: Apply manifests**

```bash
kubectl apply -f ops/glitchtip/ -n glitchtip-staging
kubectl rollout status deploy/glitchtip-web -n glitchtip-staging
```

Verify web UI loads at `https://errors.staging.quokkaq.ru`.

- [ ] **Step 1.5: Create projects + DSNs**

Via web UI: create org "QuokkaQ" → projects `quokkaq-backend`, `quokkaq-frontend`, `quokkaq-kiosk`. Capture each DSN, store in vault as `SENTRY_DSN_BACKEND_STAGING`, etc.

- [ ] **Step 1.6: Smoke ingestion**

```bash
curl -X POST 'https://errors.staging.quokkaq.ru/api/<project_id>/store/' \
  -H "X-Sentry-Auth: Sentry sentry_key=<dsn-public-key>" \
  -d '{"message": "smoke test", "level": "info"}'
```

Expect `200 OK`, event visible in web UI.

- [ ] **Step 1.7: Commit deployment manifests**

```bash
git add ops/glitchtip/
git commit -m "ops(glitchtip): staging deployment manifests"
```

### Task 2 — Production GlitchTip deploy

- [ ] **Step 2.1: Same manifests applied to prod cluster** with prod DNS / certs / DSNs in prod vault.
- [ ] **Step 2.2: Smoke ingestion via prod-tagged event from a one-off pod.**

```bash
git commit -am "ops(glitchtip): production deployment"
```

### Task 3 — Network policies + access controls

- [ ] **Step 3.1: NetworkPolicy: only backend / frontend / kiosk-VPN can POST to GlitchTip ingestion port**
- [ ] **Step 3.2: Web UI public over TLS, behind GlitchTip's built-in auth (or SSO via existing IdP if straightforward)**
- [ ] **Step 3.3: Document access policy in `ops/glitchtip/README.md`**

```bash
git commit -am "ops(glitchtip): network policy + access controls"
```

---

## Phase B — Backend health endpoints

### Task 4 — Health checks abstraction + dep checks

**Files:**
- Create: `apps/backend/internal/health/checks/postgres.go`
- Create: `apps/backend/internal/health/checks/redis.go`
- Create: `apps/backend/internal/health/checks/minio.go`
- Create: `apps/backend/internal/health/checks/asynq.go`
- Tests for each.

- [ ] **Step 4.1: Define `Check` interface**

`apps/backend/internal/health/check.go`:
```go
package health

import (
	"context"
	"time"
)

// Check reports the health of one external dependency.
// Implementations must respect ctx deadline (default 2s).
type Check interface {
	Name() string
	Probe(ctx context.Context) Result
}

type Result struct {
	Status    string        `json:"status"`              // "ok" | "fail"
	LatencyMs int64         `json:"latency_ms,omitempty"`
	Error     string        `json:"error,omitempty"`     // omitted when Status=ok
	Latency   time.Duration `json:"-"`
}
```

- [ ] **Step 4.2: Implement Postgres check**

`checks/postgres.go`:
```go
package checks

import (
	"context"
	"time"

	"gorm.io/gorm"

	"github.com/quokkaq/backend/internal/health"
)

type Postgres struct{ db *gorm.DB }

func NewPostgres(db *gorm.DB) *Postgres { return &Postgres{db: db} }

func (p *Postgres) Name() string { return "postgres" }

func (p *Postgres) Probe(ctx context.Context) health.Result {
	start := time.Now()
	sqlDB, err := p.db.DB()
	if err != nil {
		return health.Result{Status: "fail", Error: err.Error()}
	}
	if err := sqlDB.PingContext(ctx); err != nil {
		return health.Result{Status: "fail", Error: err.Error(), LatencyMs: time.Since(start).Milliseconds()}
	}
	return health.Result{Status: "ok", LatencyMs: time.Since(start).Milliseconds()}
}
```

- [ ] **Step 4.3: Mirror for Redis (PING), MinIO (HeadBucket), Asynq (separate Redis ping if pool different)**

Each follows the same pattern.

- [ ] **Step 4.4: Test each check (unit + integration)**

Unit: pass a mock client that returns canned errors. Integration (build tag): real Postgres / Redis / MinIO containers, verify ok.

- [ ] **Step 4.5: Commit**

```bash
cd apps/backend && go test ./internal/health/checks/ -v
git add apps/backend/internal/health/
git commit -m "feat(health): dep checks for postgres / redis / minio / asynq"
```

### Task 5 — Aggregator + caching

**Files:**
- Create: `apps/backend/internal/health/ready.go`
- Create: `apps/backend/internal/health/ready_test.go`

- [ ] **Step 5.1: Aggregator that runs checks in parallel with deadline + caches result**

`ready.go`:
```go
package health

import (
	"context"
	"sync"
	"time"
)

type ReadinessAggregator struct {
	checks    []Check
	cacheTTL  time.Duration
	mu        sync.Mutex
	last      *AggregatedResult
	lastAt    time.Time
}

type AggregatedResult struct {
	Status string                  `json:"status"` // "ok" | "degraded"
	Checks map[string]Result       `json:"checks"`
}

func NewReadinessAggregator(checks []Check, cacheTTL time.Duration) *ReadinessAggregator {
	return &ReadinessAggregator{checks: checks, cacheTTL: cacheTTL}
}

func (r *ReadinessAggregator) Get(ctx context.Context) AggregatedResult {
	r.mu.Lock()
	if r.last != nil && time.Since(r.lastAt) < r.cacheTTL {
		out := *r.last
		r.mu.Unlock()
		return out
	}
	r.mu.Unlock()

	probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	results := make(map[string]Result, len(r.checks))
	var wg sync.WaitGroup
	var mu sync.Mutex
	for _, c := range r.checks {
		wg.Add(1)
		go func(c Check) {
			defer wg.Done()
			res := c.Probe(probeCtx)
			mu.Lock()
			results[c.Name()] = res
			mu.Unlock()
		}(c)
	}
	wg.Wait()

	out := AggregatedResult{Status: "ok", Checks: results}
	for _, res := range results {
		if res.Status != "ok" {
			out.Status = "degraded"
			break
		}
	}
	r.mu.Lock()
	r.last, r.lastAt = &out, time.Now()
	r.mu.Unlock()
	return out
}
```

- [ ] **Step 5.2: Test (concurrent calls during cache window dedupe to one set of probes)**

```go
func TestReadinessAggregator_CachesResult(t *testing.T) {
	probeCount := 0
	check := stubCheck{name: "x", probe: func() Result {
		probeCount++
		return Result{Status: "ok"}
	}}
	agg := NewReadinessAggregator([]Check{check}, 5*time.Second)

	for i := 0; i < 3; i++ {
		_ = agg.Get(context.Background())
	}
	require.Equal(t, 1, probeCount)
}
```

- [ ] **Step 5.3: Commit**

```bash
git add apps/backend/internal/health/ready.go apps/backend/internal/health/ready_test.go
git commit -m "feat(health): readiness aggregator with parallel probes + cache"
```

### Task 6 — `/health/live` + `/health/ready` HTTP handlers

**Files:**
- Create: `apps/backend/internal/health/handlers.go`
- Create: `apps/backend/internal/health/handlers_test.go`

- [ ] **Step 6.1: Liveness handler (no deps)**

```go
type Handlers struct {
	startedAt time.Time
	version   string
	gitSHA    string
	ready     *ReadinessAggregator
	verbose   bool
}

func (h *Handlers) Live(w http.ResponseWriter, r *http.Request) {
	body := map[string]any{
		"status":         "ok",
		"version":        h.version,
		"git_sha":        h.gitSHA,
		"uptime_seconds": int(time.Since(h.startedAt).Seconds()),
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	}
	writeJSON(w, 200, body)
}

func (h *Handlers) Ready(w http.ResponseWriter, r *http.Request) {
	res := h.ready.Get(r.Context())
	status := 200
	if res.Status == "degraded" {
		status = 503
	}
	body := map[string]any{"status": res.Status}
	if h.verbose {
		body["checks"] = res.Checks
	}
	writeJSON(w, status, body)
}
```

- [ ] **Step 6.2: Tests**

Cover: 200 with all-ok, 503 with one fail, verbose-off in prod hides `checks` body.

- [ ] **Step 6.3: Commit**

```bash
git add apps/backend/internal/health/handlers.go apps/backend/internal/health/handlers_test.go
git commit -m "feat(health): /health/live and /health/ready handlers"
```

### Task 7 — Wire in `cmd/api/main.go`

- [ ] **Step 7.1: Construct + register**

```go
healthAgg := health.NewReadinessAggregator(
    []health.Check{
        checks.NewPostgres(db),
        checks.NewRedis(redisClient),
        checks.NewMinIO(minioClient),
        checks.NewAsynq(asynqClient),
    },
    5*time.Second,
)
healthH := &health.Handlers{
    StartedAt: time.Now(),
    Version:   buildInfo.Version,
    GitSHA:    buildInfo.GitSHA,
    Ready:     healthAgg,
    Verbose:   os.Getenv("HEALTH_VERBOSE") == "true",
}
router.Get("/health/live", healthH.Live)
router.Get("/health/ready", healthH.Ready)
```

- [ ] **Step 7.2: Smoke test against running server**

```bash
curl -s http://localhost:3001/health/live | jq .
curl -s http://localhost:3001/health/ready | jq .
```

- [ ] **Step 7.3: Commit**

```bash
git commit -am "feat(health): register endpoints in cmd/api/main.go"
```

---

## Phase C — Frontend health endpoints

### Task 8 — Next.js `/api/health` route (frontend + marketing)

**Files:**
- Create: `apps/frontend/app/api/health/route.ts`
- Create: `apps/marketing/app/api/health/route.ts`

- [ ] **Step 8.1: Implement (mirror backend shape)**

```ts
// apps/frontend/app/api/health/route.ts
import { NextResponse } from 'next/server';

const startedAt = Date.now();

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
    git_sha: process.env.NEXT_PUBLIC_GIT_SHA ?? '',
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
}
```

(Next.js apps don't have meaningful "ready" semantics — they're stateless and depend on backend. A separate `/api/ready` could ping the backend's `/health/ready`, but for v1 we keep `/api/health` only.)

- [ ] **Step 8.2: Mirror to marketing app**

- [ ] **Step 8.3: Commit**

```bash
git commit -am "feat(frontend-health): /api/health route on frontend + marketing"
```

---

## Phase D — Backend error tracking (Sentry / GlitchTip)

### Task 9 — SDK init + redactor

**Files:**
- Create: `apps/backend/internal/observability/sentry/init.go`
- Create: `apps/backend/internal/observability/sentry/redactor.go`
- Create: `apps/backend/internal/observability/sentry/redactor_test.go`

- [ ] **Step 9.1: Init**

```go
package sentry

import (
	"os"

	gosentry "github.com/getsentry/sentry-go"
)

type Config struct {
	DSN         string
	Environment string
	Release     string
	Verbose     bool
}

func Init(cfg Config) error {
	if cfg.DSN == "" {
		return nil // no-op in dev
	}
	return gosentry.Init(gosentry.ClientOptions{
		Dsn:              cfg.DSN,
		Environment:      cfg.Environment,
		Release:          cfg.Release,
		SampleRate:       1.0,
		TracesSampleRate: 0,
		AttachStacktrace: true,
		SendDefaultPII:   false,
		BeforeSend:       RedactEvent,
		Debug:            cfg.Verbose,
	})
}

func Flush() { gosentry.Flush(2 * time.Second) }
```

- [ ] **Step 9.2: PII redactor**

```go
// RedactEvent removes PII from outgoing Sentry events.
// Call sites: BeforeSend hook, called by SDK on every event.
func RedactEvent(event *gosentry.Event, _ *gosentry.EventHint) *gosentry.Event {
	if event.Request != nil {
		// Strip Authorization, Cookie headers
		delete(event.Request.Headers, "Authorization")
		delete(event.Request.Headers, "Cookie")
		// Strip request body wholesale — may contain emails/phones/passport data
		event.Request.Data = ""
	}
	// Strip PII keys from extra
	for _, k := range []string{"email", "phone", "password", "passport_number"} {
		delete(event.Extra, k)
	}
	// Strip user PII; keep user_id only
	if event.User.Email != "" {
		event.User.Email = ""
	}
	if event.User.IPAddress != "" {
		event.User.IPAddress = "" // we don't need IPs
	}
	// Scrub breadcrumbs that look like log lines containing emails — basic regex
	for i := range event.Breadcrumbs {
		event.Breadcrumbs[i].Message = scrubEmailLike(event.Breadcrumbs[i].Message)
	}
	return event
}

var emailRegex = regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)

func scrubEmailLike(s string) string {
	return emailRegex.ReplaceAllString(s, "[email-redacted]")
}
```

- [ ] **Step 9.3: Test redactor**

```go
func TestRedactEvent_StripsAuthHeader(t *testing.T) {
	event := &gosentry.Event{Request: &gosentry.Request{
		Headers: map[string]string{"Authorization": "Bearer secret", "Content-Type": "application/json"},
	}}
	out := RedactEvent(event, nil)
	require.NotContains(t, out.Request.Headers, "Authorization")
	require.Contains(t, out.Request.Headers, "Content-Type")
}

func TestRedactEvent_StripsRequestBody(t *testing.T) { /* ... */ }
func TestRedactEvent_StripsEmailsInBreadcrumbs(t *testing.T) { /* ... */ }
func TestRedactEvent_StripsUserEmailButKeepsID(t *testing.T) { /* ... */ }
```

- [ ] **Step 9.4: Commit**

```bash
git add apps/backend/internal/observability/sentry/
git commit -m "feat(observability): Sentry SDK init + PII redactor"
```

### Task 10 — HTTP middleware that captures panics + 5xx

**Files:**
- Create: `apps/backend/internal/observability/sentry/middleware.go`

- [ ] **Step 10.1: Middleware**

```go
func RecoveryMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					hub := gosentry.GetHubFromContext(r.Context())
					if hub == nil {
						hub = gosentry.CurrentHub().Clone()
					}
					hub.RecoverWithContext(r.Context(), rec)
					http.Error(w, "Internal Server Error", 500)
				}
			}()
			rw := &captureStatusWriter{ResponseWriter: w, status: 200}
			next.ServeHTTP(rw, r)

			// Capture 5xx (excluding 503 readiness — those are not "errors")
			if rw.status >= 500 && rw.status != 503 {
				gosentry.WithScope(func(scope *gosentry.Scope) {
					scope.SetTag("route_template", chiPathTemplate(r))
					scope.SetTag("status_code", strconv.Itoa(rw.status))
					gosentry.CaptureMessage("HTTP " + strconv.Itoa(rw.status) + " " + r.Method + " " + r.URL.Path)
				})
			}
		})
	}
}
```

- [ ] **Step 10.2: Wire into router (in `cmd/api/main.go`, OUTSIDE auth/rate-limit middlewares so panics in those are caught)**

- [ ] **Step 10.3: Tests**

Trigger a panic in a downstream handler → verify Sentry SDK received an event (use `httptest.NewRecorder` + `gosentry.NewMockTransport`).

- [ ] **Step 10.4: Commit**

```bash
git commit -am "feat(observability): HTTP recovery middleware → Sentry"
```

### Task 11 — Asynq error handler

**Files:**
- Create: `apps/backend/internal/observability/sentry/asynq_handler.go`

- [ ] **Step 11.1: Implement**

```go
// AsynqErrorHandler is registered with asynq.Server as the global error handler.
// Forwards every job failure to Sentry with task type / payload as tags.
func AsynqErrorHandler(ctx context.Context, task *asynq.Task, err error) {
	gosentry.WithScope(func(scope *gosentry.Scope) {
		scope.SetTag("asynq_task_type", task.Type())
		scope.SetTag("retry_count", strconv.Itoa(task.ResultWriter().TaskID() != "" ? /* derive */ 0 : 0))
		gosentry.CaptureException(err)
	})
}
```

- [ ] **Step 11.2: Wire as `asynq.Server` `ErrorHandler` option**

- [ ] **Step 11.3: Test (enqueue a deliberately-failing task, verify Sentry capture)**

- [ ] **Step 11.4: Commit**

```bash
git commit -am "feat(observability): Asynq error handler → Sentry"
```

### Task 12 — Init in `cmd/api/main.go` + env wiring

- [ ] **Step 12.1: Wire**

```go
sentry.Init(sentry.Config{
    DSN:         os.Getenv("SENTRY_DSN_BACKEND"),
    Environment: os.Getenv("ENVIRONMENT"),
    Release:     buildInfo.GitSHA,
})
defer sentry.Flush()

router.Use(sentryMiddleware.RecoveryMiddleware())
asynqServer := asynq.NewServer(...,
    asynq.Config{
        ErrorHandler: asynq.ErrorHandlerFunc(sentryMiddleware.AsynqErrorHandler),
    })
```

- [ ] **Step 12.2: Add env vars to `.env.example`**

```
SENTRY_DSN_BACKEND=
ENVIRONMENT=development
```

- [ ] **Step 12.3: CI build flag for git SHA**

In Dockerfile / build target:
```dockerfile
ARG GIT_SHA
RUN go build -ldflags="-X main.gitSHA=$GIT_SHA" -o /bin/server ./cmd/api
```

GitHub Actions deploy workflow passes `GIT_SHA: ${{ github.sha }}`.

- [ ] **Step 12.4: Commit**

```bash
git commit -am "feat(observability): wire Sentry init + release tagging in backend"
```

---

## Phase E — Frontend error tracking

### Task 13 — Sentry SDK install + config

**Files:**
- Create: `apps/frontend/sentry.server.config.ts`
- Create: `apps/frontend/sentry.client.config.ts`
- Create: `apps/frontend/sentry.edge.config.ts`
- Create: `apps/frontend/lib/sentry/redactor.ts`
- Modify: `apps/frontend/next.config.ts`

- [ ] **Step 13.1: Install**

```bash
cd apps/frontend && pnpm add @sentry/nextjs
```

- [ ] **Step 13.2: Wizard or manual config**

```ts
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';
import { redactEvent } from '@/lib/sentry/redactor';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_FRONTEND,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_GIT_SHA,
  sampleRate: 1.0,
  tracesSampleRate: 0,
  beforeSend: redactEvent,
  // Disable session replay for v1 — privacy first
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
```

- [ ] **Step 13.3: Redactor (parity with backend)**

```ts
// lib/sentry/redactor.ts
import type { Event } from '@sentry/nextjs';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function redactEvent(event: Event): Event | null {
  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.Cookie;
  }
  if (event.request?.data) {
    event.request.data = '[redacted]';
  }
  // Strip user PII
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  // Scrub breadcrumbs
  event.breadcrumbs = event.breadcrumbs?.map((b) => ({
    ...b,
    message: b.message?.replace(EMAIL_RE, '[email-redacted]'),
  }));
  return event;
}
```

- [ ] **Step 13.4: `next.config.ts` wrapper**

```ts
import { withSentryConfig } from '@sentry/nextjs';
const nextConfig = { /* existing */ };
export default withSentryConfig(nextConfig, {
  org: 'quokkaq',
  project: 'quokkaq-frontend',
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

- [ ] **Step 13.5: Source-map upload in CI**

In `.github/workflows/deploy-frontend.yml`, after build:
```yaml
- name: Upload source maps to GlitchTip
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_URL: https://errors.quokkaq.ru
    SENTRY_ORG: quokkaq
    SENTRY_PROJECT: quokkaq-frontend
  run: pnpm --filter frontend exec sentry-cli releases new "$GITHUB_SHA"
       && pnpm --filter frontend exec sentry-cli releases files "$GITHUB_SHA" upload-sourcemaps .next
       && pnpm --filter frontend exec sentry-cli releases finalize "$GITHUB_SHA"
```

- [ ] **Step 13.6: Commit**

```bash
git add apps/frontend/sentry.* apps/frontend/lib/sentry/ apps/frontend/next.config.ts apps/frontend/package.json apps/frontend/pnpm-lock.yaml
git commit -m "feat(frontend): Sentry SDK + PII redactor + source maps in CI"
```

### Task 14 — Mirror to marketing app

- [ ] **Step 14.1: Identical to Task 13 but for `apps/marketing`** (separate DSN: `quokkaq-marketing` project, or shared with frontend — pick during impl).

```bash
git commit -am "feat(marketing): Sentry SDK"
```

---

## Phase F — Kiosk Desktop error tracking

### Task 15 — Backend `/kiosk/sentry-config` DSN proxy endpoint

**Files:**
- Create: `apps/backend/internal/kiosk/sentry_config_handler.go`
- Create: `apps/backend/internal/kiosk/sentry_config_handler_test.go`

The kiosk does not embed the DSN — it fetches it from this endpoint after authenticating with its existing device API key.

- [ ] **Step 15.1: Implement**

```go
type SentryConfigResponse struct {
	DSN         string `json:"dsn"`
	Environment string `json:"environment"`
	Release     string `json:"release"`
}

func (h *KioskHandler) GetSentryConfig(w http.ResponseWriter, r *http.Request) {
	// Auth: existing kiosk device auth middleware (verify device API key)
	// Returns DSN scoped to kiosk project — read from env / vault
	resp := SentryConfigResponse{
		DSN:         os.Getenv("SENTRY_DSN_KIOSK_PROXY"),
		Environment: os.Getenv("ENVIRONMENT"),
		Release:     authctx.KioskRelease(r.Context()), // from device profile
	}
	writeJSON(w, 200, resp)
}
```

- [ ] **Step 15.2: Test (auth required, returns DSN, masked when no DSN configured)**

- [ ] **Step 15.3: Commit**

```bash
git commit -am "feat(kiosk-backend): /kiosk/sentry-config DSN proxy"
```

### Task 16 — Rust-side Sentry init

**Files:**
- Modify: `apps/kiosk-desktop/src-tauri/Cargo.toml` (add `sentry = "0.32"`)
- Create: `apps/kiosk-desktop/src-tauri/src/observability/sentry_init.rs`
- Create: `apps/kiosk-desktop/src-tauri/src/observability/redactor.rs`
- Modify: `apps/kiosk-desktop/src-tauri/src/lib.rs` — init at startup

- [ ] **Step 16.1: Init function fetched from backend**

```rust
// observability/sentry_init.rs
use sentry::ClientOptions;

pub fn init_from_backend(api_base: &str, device_key: &str) -> Option<sentry::ClientInitGuard> {
    let cfg = match fetch_sentry_config(api_base, device_key) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Sentry config fetch failed: {e:?}");
            return None;
        }
    };
    Some(sentry::init((
        cfg.dsn,
        ClientOptions {
            release: Some(cfg.release.into()),
            environment: Some(cfg.environment.into()),
            before_send: Some(std::sync::Arc::new(crate::observability::redactor::redact_event)),
            attach_stacktrace: true,
            ..Default::default()
        },
    )))
}

#[derive(serde::Deserialize)]
struct SentryConfig {
    dsn: String,
    environment: String,
    release: String,
}

fn fetch_sentry_config(api_base: &str, device_key: &str) -> Result<SentryConfig, ureq::Error> {
    ureq::get(&format!("{api_base}/kiosk/sentry-config"))
        .set("Authorization", &format!("Bearer {device_key}"))
        .timeout(std::time::Duration::from_secs(5))
        .call()?
        .into_json::<SentryConfig>()
        .map_err(Into::into)
}
```

- [ ] **Step 16.2: Redactor (parity with Go redactor — auth header, request body, breadcrumb emails)**

- [ ] **Step 16.3: Wire in `lib.rs`**

```rust
fn main() {
    let device_key = load_device_key();
    let api_base = load_api_base();
    let _sentry_guard = observability::sentry_init::init_from_backend(&api_base, &device_key);
    tauri::Builder::default()
        // existing setup
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 16.4: Commit**

```bash
git commit -am "feat(kiosk): Rust-side Sentry init via backend DSN proxy"
```

### Task 17 — JS-side (webview) Sentry init

**Files:**
- Modify: `packages/kiosk-lib/src/...` — add Sentry browser SDK init that also fetches via Tauri command.

- [ ] **Step 17.1: Use `@sentry/browser` (since kiosk-desktop loads remote URL — Sentry needs to attach to that page's window)**

The webview is loaded from `https://app.quokkaq.ru/kiosk` (frontend route), which already has `@sentry/nextjs` from Task 13. Add kiosk-specific tags via Sentry's scope:

```ts
// In the kiosk page's mount logic
import * as Sentry from '@sentry/nextjs';
import { invoke } from '@tauri-apps/api/core';

if (window.__TAURI_INTERNALS__) {
  const config = await invoke<{ tenant_slug: string; kiosk_id: string }>('get_kiosk_meta');
  Sentry.getCurrentScope().setTags({
    surface: 'kiosk',
    tenant_slug: config.tenant_slug,
    kiosk_id: config.kiosk_id,
  });
}
```

- [ ] **Step 17.2: Commit**

```bash
git commit -am "feat(kiosk-frontend): Sentry tags for kiosk-surface events"
```

### Task 18 — Trigger test errors from each surface, verify in GlitchTip

- [ ] **Step 18.1: Add `cmd debug-error` to backend (gated by env)**, frontend `/__sentry-test`, kiosk dev menu — each fires a deliberate exception.

- [ ] **Step 18.2: Run each, screenshot the GlitchTip event listing in the runbook.**

- [ ] **Step 18.3: Commit**

```bash
git commit -am "test(observability): debug error trigger endpoints"
```

---

## Phase G — Alerts + runbook

### Task 19 — GlitchTip alert rules

- [ ] **Step 19.1: Configure 5 rules from spec §4** via web UI (or via API if GlitchTip exposes one) — new issue, regression, frequency spike, critical service (SCIM endpoints), kiosk fleet.
- [ ] **Step 19.2: Webhook → existing internal alert pipeline (Telegram bot endpoint)**
- [ ] **Step 19.3: Trip each rule manually, verify Telegram delivery**

```bash
git commit -am "ops(observability): GlitchTip alert rules + Telegram delivery"
```

### Task 20 — Runbook + CLAUDE.md update

**Files:**
- Create: `docs/operations/error-tracking-runbook.md`
- Create: `docs/operations/health-checks.md`
- Modify: `CLAUDE.md`

- [ ] **Step 20.1: Error-tracking runbook**

Sections:
- GlitchTip URL + access policy
- How to triage a new alert (5 steps from "alert fires" to "issue closed")
- How to find correlated logs in Yandex Cloud Logging
- How to fetch a release's source maps
- Common false-positives and how to silence them
- How to roll back a bad deploy detected via regression alert

- [ ] **Step 20.2: Health-checks doc**

Sections:
- Endpoint contract (live vs ready)
- What each dep check does
- How to add a new dep check (template)
- LB / k8s probe configuration

- [ ] **Step 20.3: CLAUDE.md**

Add to "Observability" section:
```markdown
- **Error tracking:** self-hosted GlitchTip at `errors.quokkaq.ru`. Backend / frontend / kiosk all instrumented via Sentry-compatible SDKs. PII is scrubbed at SDK level (see `internal/observability/sentry/redactor.go`).
- **Health endpoints:** `/health/live` (process alive) and `/health/ready` (deps ok) on backend; `/api/health` on Next.js apps. See `docs/operations/health-checks.md`.
```

- [ ] **Step 20.4: Commit**

```bash
git add docs/operations/error-tracking-runbook.md docs/operations/health-checks.md CLAUDE.md
git commit -m "docs(observability): runbook + health-checks reference + CLAUDE.md"
```

---

## Self-review (done by author)

### Spec coverage

| Spec section | Plan task(s) | Status |
|---|---|---|
| §1 GlitchTip topology | Tasks 1–3 | ✅ |
| §2 Health endpoints contract | Tasks 4–8 | ✅ |
| §3.1 Backend SDK + redactor | Tasks 9–12 | ✅ |
| §3.2 Frontend SDK + source maps | Tasks 13–14 | ✅ |
| §3.3 Kiosk SDK (Rust + JS) + DSN proxy | Tasks 15–18 | ✅ |
| §3.4 Release tagging | Task 12 (backend), Task 13 (frontend), Task 16 (kiosk) | ✅ |
| §3.5 Standard tags | Embedded in each SDK init task | ✅ |
| §4 Alerts | Task 19 | ✅ |
| §5 Security & PII | Task 9 (backend redactor), Task 13 (frontend redactor), Task 16 (kiosk redactor) | ✅ |
| §6 Rollout | Sequential phases A → G | ✅ |

### Findings

- **F1 — Asynq retry-count tag.** Task 11 step 11.1 has a placeholder for retry count; the actual API depends on `asynq.Task` shape in the pinned version. Engineer verifies and adjusts.
- **F2 — Sentry CLI auth token storage.** Task 13 step 13.5 uses `SENTRY_AUTH_TOKEN` from CI secrets. Add this secret to all relevant deploy workflows; rotate yearly.
- **F3 — Network-policy details.** Task 3 says "only backend / frontend / kiosk-VPN can POST". The kiosk-VPN piece needs verification — kiosks in the field may not have a VPN tunnel. If not, GlitchTip ingestion needs to be public; mitigate via DSN-only auth (which is acceptable; DSNs are write-only keys).
- **F4 — Release tagging on the Rust kiosk.** Task 16 uses `sentry::release_name!()` macro which reads from `Cargo.toml`. Engineer confirms this works in the Tauri build pipeline (it should — but Tauri's `tauri build` may strip env vars).

### Conclusion

After 20 tasks: GlitchTip is hosted in our infra, backend / frontend / kiosk all report errors with PII redaction, releases are tagged for clean grouping, alerts route to existing Telegram channel, and on-call has a runbook.

Health checks are formal: `/health/live` for liveness probes, `/health/ready` with parallel dep checks + 5s cache for readiness probes, `/api/health` on Next.js apps.

Together these unblock: the Enterprise pack public status page (Task 25 of SCIM Plan 3 references it), a more confident Plan 3 rollout (errors visible in real time), and any future reliability investments.

---

## Execution

**Plan saved to `docs/plan/2026-04-25-ops-track-health-and-error-tracking-plan.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — Phases B (health) and Phase D (backend Sentry) can run in parallel; Phase E (frontend) and Phase F (kiosk) can run in parallel after Phase A is up. Phase G is the closing.
2. **Inline Execution** — strict sequential order. Total wall-clock time ≈ 1–2 weeks of focused work.

Plan does not depend on the SCIM track and can ship independently. Once both this plan and SCIM Plan 1 ship, the SCIM Plan 3 alerts (spec §8.6) light up automatically since their Prometheus metrics now flow through the same observability stack.