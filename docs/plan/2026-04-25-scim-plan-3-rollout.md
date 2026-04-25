# SCIM 2.0 — Plan 3: Testing, Docs, Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the working backend (Plan 1) and end-to-end provisioning experience (Plan 2) to GA — RFC conformance verified against real IdP validators, load-tested at target throughput, E2E-tested through the UI, fully documented (admin guide + per-IdP guides + troubleshooting + reference), instrumented (Prometheus / Grafana / OTel spans visible), and rolled out through alpha → beta → GA phases.

**Architecture:** No new application code — Plan 3 is testing, instrumentation finalization, documentation, and rollout playbook execution. The exception is metrics emission (Prometheus counters / histograms / gauges per spec §6.4) which Plans 1 and 2 left as stubs / hooks.

**Tech Stack:** k6 (load testing), Playwright (E2E), Microsoft SCIM Validator (conformance), Okta SCIM Tester (conformance), Prometheus client_golang (metrics), Grafana JSON dashboards, MDX docs site (existing `apps/marketing`).

**Source spec:** `docs/plan/2026-04-25-scim-2.0-enterprise-provisioning-design.md`
**Predecessors:** `2026-04-25-scim-plan-1-foundation.md` and `2026-04-25-scim-plan-2-mapping-and-ui.md` (both must ship first)

---

## File structure

### Created files

```
apps/backend/internal/scim/metrics/
├── metrics.go                          # Prometheus collectors
└── metrics_test.go

apps/backend/internal/scim/tracing/
├── attributes.go                       # OTel span attribute helpers

apps/backend/test/conformance/
├── microsoft_validator_test.go         # build tag: conformance
├── okta_tester_test.go
└── fixtures/
    ├── okta-user-create.json
    ├── okta-group-create.json
    └── (more from Plan 1 Task 8.3)

apps/backend/test/load/
├── scim_users_burst.js                 # k6
├── scim_groups_churn.js
├── scim_users_paginated.js
└── scim_recompute_storm.js

apps/frontend/e2e/scim/
├── tokens.spec.ts                      # Playwright
├── mappings.spec.ts
├── full-flow.spec.ts

docs/wiki/en/scim/                       # public-facing docs
├── setup.mdx
├── reference.mdx                       # auto-generated from openapi-scim.yaml
├── troubleshooting.mdx
└── idp-guides/
    ├── okta.mdx
    ├── keycloak.mdx
    └── entra-id.mdx

docs/wiki/ru/scim/                       # mirror in Russian
├── setup.mdx
├── reference.mdx
├── troubleshooting.mdx
└── idp-guides/
    ├── okta.mdx
    ├── keycloak.mdx
    └── entra-id.mdx

docs/operations/
└── scim-runbook.md                     # internal on-call playbook

ops/grafana/
└── scim-dashboards.json                # exported Grafana dashboards
```

### Modified files

| File | Change |
|---|---|
| `CLAUDE.md` | Add reference to `internal/scim/` module + the three plan docs |
| `apps/backend/internal/scim/middleware/auth.go` | Emit `scim_token_misuse_total` counter on each rejection branch |
| `apps/backend/internal/scim/handlers/users.go`, `groups.go` | Emit `scim_requests_total` + `scim_request_duration_seconds` (likely via shared mw) |
| `apps/backend/internal/scim/jobs/*.go` | Emit `scim_recompute_jobs_queue_size` gauge from queue inspector + duration histograms |
| `.github/workflows/ci.yml` | Add `scim-conformance` job; gate `e2e` builds |

---

## Phase 3.A — RFC conformance tests

### Task 1 — Microsoft SCIM Validator integration

The Microsoft validator runs as a hosted tool (`scimvalidator.microsoft.com`) and an open-source binary (`MicrosoftSCIMValidator`). We use the binary for CI; the hosted tool is a manual smoke before each release.

**Files:**
- Create: `apps/backend/test/conformance/microsoft_validator_test.go`
- Create: `apps/backend/test/conformance/Makefile`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1.1: Pin a version + script the runner**

`Makefile` snippet:
```make
VALIDATOR_VERSION ?= v2.3
VALIDATOR_BIN := tools/scim-validator/MicrosoftSCIMValidator
.PHONY: scim-conformance-microsoft
scim-conformance-microsoft: $(VALIDATOR_BIN)
	$(VALIDATOR_BIN) --endpoint $(SCIM_ENDPOINT) --token $(SCIM_TOKEN) --output report.json
$(VALIDATOR_BIN):
	# fetch from $(VALIDATOR_VERSION) release artifact, verify checksum
	./scripts/fetch-validator.sh $(VALIDATOR_VERSION)
```

- [ ] **Step 1.2: Go test that wraps the binary**

`microsoft_validator_test.go`:
```go
//go:build conformance

package conformance

import (
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/quokkaq/backend/internal/scim/repository"
	"github.com/quokkaq/backend/internal/scim/service"
	"github.com/quokkaq/backend/internal/testharness"
)

func TestMicrosoftValidator_AllSpecsPass(t *testing.T) {
	srv := testharness.StartBackend(t, testharness.Opts{
		EnvOverrides: map[string]string{"SCIM_ENABLED": "true"},
	})
	defer srv.Close()

	companyID := srv.SeedCompany(t, "conf-ms")
	srv.EnablePlanFeature(t, companyID, "scim_provisioning")
	srv.SetScimSettings(t, companyID, true, true, false, 365)

	tokenSvc := service.NewTokenService(repository.NewTokenRepo(srv.DB))
	out, err := tokenSvc.Generate(srv.Ctx, service.GenerateTokenInput{
		CompanyID: companyID, Name: "conformance",
	})
	require.NoError(t, err)

	endpoint := srv.BaseURL + "/scim/v2/conf-ms"
	cmd := exec.Command("./tools/scim-validator/MicrosoftSCIMValidator",
		"--endpoint", endpoint,
		"--token", out.RawToken,
		"--output", "/tmp/scim-report.json",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	require.NoError(t, cmd.Run(), "validator should exit 0 on full pass")

	body, err := os.ReadFile("/tmp/scim-report.json")
	require.NoError(t, err)
	var report struct {
		PassedCount int                    `json:"passed"`
		FailedCount int                    `json:"failed"`
		Failures    []map[string]any       `json:"failures"`
	}
	require.NoError(t, json.Unmarshal(body, &report))
	if report.FailedCount > 0 {
		t.Fatalf("validator reports %d failures: %s", report.FailedCount, strings.Join(failureSummaries(report.Failures), "; "))
	}
}

func failureSummaries(fs []map[string]any) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, fmt.Sprint(f["name"], ": ", f["detail"]))
	}
	return out
}
```

- [ ] **Step 1.3: CI integration**

`.github/workflows/ci.yml` add:
```yaml
scim-conformance:
  if: github.event_name == 'pull_request' && contains(github.event.pull_request.changed_files, 'apps/backend/internal/scim/')
  runs-on: ubuntu-latest
  services:
    postgres: { /* same as backend job */ }
    redis: { /* same */ }
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
    - run: make -C apps/backend/test/conformance scim-conformance-microsoft
```

(Initial decision per spec §8.2: **blocking on PR for changes inside `internal/scim/`**, **informational on main**. Adjust `if:` conditions accordingly.)

- [ ] **Step 1.4: Commit**

```bash
git commit -am "test(scim): Microsoft SCIM Validator conformance job"
```

### Task 2 — Okta SCIM Tester integration

Okta's tester is web-based — record-replay against a fixed test app. Captures requests sent by Okta over a live `ngrok`-like tunnel and replays them deterministically in CI.

**Files:**
- Create: `apps/backend/test/conformance/okta_tester_test.go`
- Create: `apps/backend/test/conformance/fixtures/okta/*.har` (HAR-formatted recordings)

- [ ] **Step 2.1: Record a session manually (one-time setup)**

Engineer creates an Okta dev account, configures a "SCIM 2.0 Test App" pointing at a tunneled local backend, runs all Okta validation tests through the UI, captures HAR via DevTools, saves to `fixtures/okta/full-suite.har`.

- [ ] **Step 2.2: Replay test**

```go
//go:build conformance

func TestOktaTester_HAR_Replay(t *testing.T) {
	srv := testharness.StartBackend(t, testharness.Opts{...})
	defer srv.Close()
	// Seed company, token (same as Task 1).

	har := loadHAR(t, "fixtures/okta/full-suite.har")
	for _, entry := range har.Log.Entries {
		// Replay request against srv, compare expected response shape.
		// Allow some flexibility (timestamps, IDs) but assert status codes
		// match Okta's expectations.
	}
}
```

- [ ] **Step 2.3: Commit**

```bash
git commit -am "test(scim): Okta SCIM Tester HAR replay"
```

### Task 3 — Audit-event coverage check (Plan 2 F1)

**Files:**
- Create: `apps/backend/internal/scim/audit_coverage_test.go` (build tag `integration`)

Asserts every event listed in spec §6.3 actually fires for the corresponding code path.

- [ ] **Step 3.1: Table-driven test mapping operations to expected events**

```go
//go:build integration

func TestAuditCoverage_AllSpecEventsFire(t *testing.T) {
	srv := testharness.StartBackend(t, testharness.Opts{...})
	defer srv.Close()
	scenarios := []struct {
		name        string
		trigger     func(t *testing.T, srv *testharness.Server)
		expectEvent string
	}{
		{"create user via SCIM",   triggerCreateUser,  "scim.user.created"},
		{"update user via SCIM",   triggerUpdateUser,  "scim.user.updated"},
		{"deactivate user",        triggerDeactivate,  "scim.user.deactivated"},
		{"anonymize user",         triggerAnonymize,   "scim.user.anonymized"},
		{"reactivate user",        triggerReactivate,  "scim.user.reactivated"},
		{"link existing on POST",  triggerAutoLink,    "scim.user.linked_existing"},
		{"recompute grants",       triggerRecompute,   "scim.user.grants_recomputed"},
		{"create group",           triggerCreateGroup, "scim.group.created"},
		{"update group",           triggerUpdateGroup, "scim.group.updated"},
		{"delete group",           triggerDeleteGroup, "scim.group.deleted"},
		{"add member",             triggerAddMember,   "scim.group.membership_changed"},
		{"generate token",         triggerGenToken,    "scim.token.generated"},
		{"rotate token",           triggerRotateToken, "scim.token.rotated"},
		{"revoke token",           triggerRevokeToken, "scim.token.revoked"},
		{"change mapping",         triggerChangeMap,   "scim.mapping.changed"},
	}
	for _, s := range scenarios {
		t.Run(s.name, func(t *testing.T) {
			before := srv.AuditEventCount(t, s.expectEvent)
			s.trigger(t, srv)
			require.Eventually(t, func() bool {
				return srv.AuditEventCount(t, s.expectEvent) > before
			}, 5*time.Second, 100*time.Millisecond, "expected event %q not emitted", s.expectEvent)
		})
	}
}
```

If any scenario fails, find the missing audit write in the relevant service and add it.

- [ ] **Step 3.2: Commit**

```bash
git commit -am "test(scim): assert all spec §6.3 audit events fire"
```

---

## Phase 3.B — Load testing

### Task 4 — k6 install and base harness

**Files:**
- Create: `apps/backend/test/load/Makefile`
- Create: `apps/backend/test/load/lib/auth.js` (shared k6 helper)

- [ ] **Step 4.1: Helper library**

`lib/auth.js`:
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.SCIM_BASE_URL || 'http://localhost:3001';
export const TENANT_SLUG = __ENV.SCIM_SLUG || 'load-test';
export const TOKEN = __ENV.SCIM_TOKEN;

export function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/scim+json',
  };
}

export function assertStatus(resp, expected, ctx) {
  return check(resp, {
    [`${ctx} status ${expected}`]: (r) => r.status === expected,
  });
}
```

- [ ] **Step 4.2: Commit**

```bash
git commit -am "test(scim-load): k6 base harness + auth helper"
```

### Task 5 — Burst POST /Users scenario

**Files:**
- Create: `apps/backend/test/load/scim_users_burst.js`

Simulates spec §8.4 row 1: "10 000 users in IdP, new tenant" — 100 concurrent VUs each POSTing 100 users. Target: p95 < 200 ms, p99 < 500 ms, no 5xx.

- [ ] **Step 5.1: Implement**

```javascript
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, TENANT_SLUG, headers, assertStatus } from './lib/auth.js';

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 10000,
      maxDuration: '5m',
    },
  },
  thresholds: {
    'http_req_duration{name:create_user}': ['p(95)<200', 'p(99)<500'],
    'http_req_failed': ['rate<0.001'],
  },
};

export default function () {
  const id = `${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    userName: `load+${id}@x.ru`,
    externalId: `ext-${id}`,
    name: { givenName: 'Load', familyName: 'Test' },
    active: true,
  });
  const resp = http.post(
    `${BASE_URL}/scim/v2/${TENANT_SLUG}/Users`,
    body,
    { headers: headers(), tags: { name: 'create_user' } },
  );
  assertStatus(resp, 201, 'POST /Users');
}
```

- [ ] **Step 5.2: Run + record baseline**

```bash
SCIM_TOKEN=... k6 run apps/backend/test/load/scim_users_burst.js | tee baselines/users_burst.txt
```

Commit the baseline file so future runs catch regressions.

- [ ] **Step 5.3: Commit**

```bash
git commit -am "test(scim-load): burst POST /Users scenario + baseline"
```

### Task 6 — Sustained PATCH /Groups churn

**Files:** `apps/backend/test/load/scim_groups_churn.js`

500 concurrent VUs, each loops add/remove member operations on randomly selected groups for 5 minutes. Target: p95 < 150 ms, p99 < 400 ms.

- [ ] **Step 6.1: Implement, run, commit**

### Task 7 — Paginated GET /Users

**Files:** `apps/backend/test/load/scim_users_paginated.js`

30 rps sustained, walking through `?startIndex=&count=100`. Target: p95 < 100 ms.

- [ ] **Step 7.1: Implement, run, commit**

### Task 8 — Recompute storm

**Files:** `apps/backend/test/load/scim_recompute_storm.js`

Pre-seed a group with 1000 members. Trigger a mapping change via the admin API. Measure: throughput (users/sec), queue size growth, async drain time. Target: 100 users/sec sustained, queue does not grow linearly with input rate.

- [ ] **Step 8.1: Implement, run, commit**

### Task 9 — Aggregate report + thresholds in CI

- [ ] **Step 9.1: CI job that runs k6 against the staging environment nightly, posts results to a Slack/Telegram channel; fails if any threshold misses**

```bash
git commit -am "test(scim-load): nightly k6 against staging with threshold gate"
```

---

## Phase 3.C — Playwright E2E tests

### Task 10 — Playwright base config

**Files:**
- Create: `apps/frontend/playwright.config.ts` (if not present from Plan 2 ops spec)
- Create: `apps/frontend/e2e/lib/scim-fixtures.ts`
- Modify: `apps/frontend/package.json` — add `e2e:scim` target

- [ ] **Step 10.1: Decide if Playwright already exists**

Plan 2 / ops spec may have introduced Playwright. If so, just add SCIM-specific fixtures. If not, install and configure.

- [ ] **Step 10.2: Fixtures: pre-create SCIM-enabled tenant, generate token, seed users via backend SCIM API**

```ts
import { test as base } from '@playwright/test';

export const test = base.extend<{ scimTenant: ScimTenantContext }>({
  scimTenant: async ({}, use) => {
    const ctx = await createScimTenant({
      slug: `e2e-${Date.now()}`,
      planFeatures: ['scim_provisioning'],
    });
    await use(ctx);
    await ctx.teardown();
  },
});
```

- [ ] **Step 10.3: Commit**

```bash
git commit -am "test(frontend-e2e): SCIM Playwright fixtures"
```

### Task 11 — Tokens flow E2E

**Files:** `apps/frontend/e2e/scim/tokens.spec.ts`

Covers: enable SCIM via Overview page → navigate to Tokens → generate (modal reveals raw token, copy works, "I have saved" gate works) → rotate (creates new, old becomes pending_revocation) → revoke (immediate).

- [ ] **Step 11.1: Implement, run, commit**

### Task 12 — Mappings flow E2E

**Files:** `apps/frontend/e2e/scim/mappings.spec.ts`

Covers: create a group via SCIM API (fixture) → page shows "needs configuration" → admin opens MappingEditor, picks operator role + unit + services → save → toast "Recomputing" appears → completes → group moves to "Configured mappings" section.

- [ ] **Step 12.1: Implement, run, commit**

### Task 13 — Full provisioning flow E2E

**Files:** `apps/frontend/e2e/scim/full-flow.spec.ts`

Covers: enable SCIM → generate token → use that token to POST a user via API (simulating IdP) → user appears in Users page with `Managed by IdP` badge → configure mapping → user gains role → activity feed shows all events → deactivate user via API → Users page shows inactive.

- [ ] **Step 13.1: Implement, run, commit**

```bash
git commit -am "test(frontend-e2e): full SCIM provisioning flow"
```

---

## Phase 3.D — Metrics & tracing finalization

### Task 14 — Prometheus metrics package

**Files:**
- Create: `apps/backend/internal/scim/metrics/metrics.go`
- Create: `apps/backend/internal/scim/metrics/metrics_test.go`

All metrics from spec §6.4 declared in one place, registered with the existing OTel-Prometheus bridge.

- [ ] **Step 14.1: Define collectors**

```go
package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	RequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "scim_requests_total",
		Help: "Total SCIM requests by method, route template, status, tenant.",
	}, []string{"method", "path_template", "status_code", "company_id"})

	RequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "scim_request_duration_seconds",
		Help:    "SCIM request latency.",
		Buckets: prometheus.ExponentialBuckets(0.005, 2, 12),
	}, []string{"method", "path_template", "status_code"})

	ProvisioningEvents = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "scim_provisioning_events_total",
		Help: "Audit-tracked SCIM provisioning events by type and tenant.",
	}, []string{"event_type", "company_id"})

	TokenMisuse = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "scim_token_misuse_total",
		Help: "Auth-failure counter for SCIM tokens, broken down by reason.",
	}, []string{"company_id", "type"}) // type: slug_mismatch | revoked_token | invalid_signature | expired

	RecomputeQueueSize = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "scim_recompute_jobs_queue_size",
		Help: "Number of pending scim.recompute_user_grants tasks in Asynq.",
	})

	RecomputeDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "scim_recompute_duration_seconds",
		Help:    "Per-user recompute job latency.",
		Buckets: prometheus.ExponentialBuckets(0.001, 2, 14),
	})

	ActiveTenants = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "scim_active_tenants",
		Help: "Tenants with at least one active SCIM token.",
	})

	FilterComplexity = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "scim_filter_complexity_seconds",
		Help:    "Time spent parsing + translating SCIM filter expressions.",
		Buckets: prometheus.ExponentialBuckets(0.0001, 2, 14),
	})
)

// Register attaches all collectors to the given registry. Called once at startup.
func Register(reg prometheus.Registerer) {
	reg.MustRegister(RequestsTotal, RequestDuration, ProvisioningEvents,
		TokenMisuse, RecomputeQueueSize, RecomputeDuration, ActiveTenants, FilterComplexity)
}
```

- [ ] **Step 14.2: Wire emit calls into existing code**

| Where | Metric |
|---|---|
| `middleware/auth.go` (Plan 1) | `TokenMisuse.WithLabelValues(companyID, "slug_mismatch").Inc()` on each rejection branch |
| `middleware/request_log.go` (Plan 1) | `RequestsTotal` + `RequestDuration` keyed off captured status |
| `service/recompute_service.go` (Plan 2) | `RecomputeDuration.Observe(...)` |
| `service/user_service.go`, `group_service.go`, `mapping_service.go` | `ProvisioningEvents.WithLabelValues(eventType, companyID).Inc()` next to each audit_log write |
| `filter/translator.go` (Plan 1) | `FilterComplexity.Observe(...)` from Translate |
| Background goroutine that polls `asynq.Inspector` every 30s | `RecomputeQueueSize.Set(...)` |
| Daily cron | `ActiveTenants.Set(count)` from a tenants-with-active-tokens query |

Each integration is small (1–3 lines) — make a single PR that touches all sites.

- [ ] **Step 14.3: Test with fake registry**

```go
func TestMetrics_RegisterAllCollectors(t *testing.T) {
	reg := prometheus.NewRegistry()
	Register(reg)
	// Assert metric families present
	mfs, err := reg.Gather()
	require.NoError(t, err)
	names := make(map[string]bool)
	for _, mf := range mfs {
		names[mf.GetName()] = true
	}
	for _, n := range []string{"scim_requests_total", "scim_request_duration_seconds", "scim_provisioning_events_total", "scim_token_misuse_total", "scim_recompute_jobs_queue_size", "scim_recompute_duration_seconds", "scim_active_tenants", "scim_filter_complexity_seconds"} {
		require.True(t, names[n], "missing metric %q", n)
	}
}
```

- [ ] **Step 14.4: Commit**

```bash
git commit -am "feat(scim): add Prometheus metrics + emission sites"
```

### Task 15 — OTel span attributes finalization

**Files:**
- Create: `apps/backend/internal/scim/tracing/attributes.go`
- Modify: `internal/scim/middleware/auth.go`, handlers, services

- [ ] **Step 15.1: Define attribute key constants**

```go
package tracing

const (
	AttrTenantSlug   = "scim.tenant_slug"
	AttrTokenID      = "scim.token_id"
	AttrMethod       = "scim.method"
	AttrPathTemplate = "scim.path_template"
	AttrResourceType = "scim.resource_type"
	AttrResourceID   = "scim.resource_id"
	AttrErrScimType  = "scim.error.scim_type"
)
```

- [ ] **Step 15.2: Set attributes in handlers + middleware**

```go
span := trace.SpanFromContext(ctx)
span.SetAttributes(
	attribute.String(tracing.AttrTenantSlug, slug),
	attribute.String(tracing.AttrTokenID, tokenID.String()),
	attribute.String(tracing.AttrPathTemplate, "/Users/{id}"),
)
```

For Asynq jobs (recompute, anonymize), pass parent span context through the task payload — Asynq supports this via `asynq.WithContext`.

- [ ] **Step 15.3: Commit**

```bash
git commit -am "feat(scim): finalize OTel span attributes for E2E tracing"
```

### Task 16 — Grafana dashboards

**Files:**
- Create: `ops/grafana/scim-dashboards.json`

Three dashboards from spec §8.6 — exported as JSON via Grafana UI or built declaratively.

- [ ] **Step 16.1: SCIM Operations dashboard**

Panels:
- Requests/sec by status code (stacked area)
- Latency p50 / p95 / p99 (line)
- Error rate (1m, 5m sliding window)
- Top 10 tenants by request volume

- [ ] **Step 16.2: SCIM Tokens dashboard**

Panels:
- Active tokens (gauge)
- Rotations / revocations per day (bar)
- `scim_token_misuse_total` rate by `type` (line) — alert source

- [ ] **Step 16.3: SCIM Provisioning Stats dashboard**

Panels:
- Events per type per hour (stacked bar)
- Recompute queue size (gauge + line)
- Anonymization queue depth (line)
- Per-tenant active SCIM users (table)

- [ ] **Step 16.4: Configure alerts (5 from spec §8.6)**

In Grafana → Alerting → New rule. Document thresholds and severity in `ops/grafana/scim-alerts.md`.

- [ ] **Step 16.5: Commit**

```bash
git add ops/grafana/
git commit -m "ops(scim): Grafana dashboards + alerts"
```

---

## Phase 3.E — Public docs (`docs.quokkaq.ru/scim`)

### Task 17 — Admin setup guide

**Files:**
- Create: `docs/wiki/en/scim/setup.mdx`
- Create: `docs/wiki/ru/scim/setup.mdx`

- [ ] **Step 17.1: Author both locales**

Sections:
1. What SCIM gives you (one-paragraph value pitch)
2. Prerequisites (tenant on Business plan or higher, IdP supports SCIM 2.0)
3. Enable SCIM (screenshot: Overview page)
4. Generate token (screenshot: TokenRevealModal — make sure it's a real-looking-but-fake token)
5. Configure your IdP (link to per-IdP guides)
6. Configure group mappings
7. Verify provisioning (look for activity events)
8. Common pitfalls (forward-link to troubleshooting)

- [ ] **Step 17.2: Add to marketing nav + commit**

```bash
git commit -am "docs(scim): admin setup guide (en+ru)"
```

### Task 18 — Per-IdP guides (Okta / Keycloak / Entra ID)

**Files:** 6 files under `docs/wiki/{en,ru}/scim/idp-guides/`

Each guide: screenshot-heavy step-by-step, ending with "click Test Provisioning, all green = ready".

- [ ] **Step 18.1: Okta guide (en + ru)**

Steps from Okta: Apps → Browse App Catalog → SCIM 2.0 Test App → Provisioning tab → Configure API Integration → endpoint URL + Bearer token → enable Create / Update / Deactivate / Push Groups → save → assignments + group push.

- [ ] **Step 18.2: Keycloak guide (en + ru)**

Setup with `keycloak-scim` extension or via custom Provider Federation. Include working quokkaq-side mapping from Keycloak group attribute to QuokkaQ role.

- [ ] **Step 18.3: Microsoft Entra ID guide (en + ru)**

Enterprise Apps → New application → Non-gallery app → Provisioning → Mode "Automatic" → Tenant URL + Secret Token → Test Connection → mappings.

- [ ] **Step 18.4: Commit**

```bash
git commit -am "docs(scim): IdP-specific guides for Okta, Keycloak, Entra ID"
```

### Task 19 — Reference (auto-generated from `openapi-scim.yaml`)

**Files:**
- Create: `apps/backend/configs/openapi/openapi-scim.yaml` (separate from main spec)
- Create: `docs/wiki/{en,ru}/scim/reference.mdx`

- [ ] **Step 19.1: Generate `openapi-scim.yaml`**

From the SCIM handlers' Swag annotations or by hand (since SCIM doesn't quite fit the project's auto-generated spec — it has its own media type). Hand-authoring is acceptable since the surface area is RFC-defined.

- [ ] **Step 19.2: Render via Redoc or Stoplight in MDX**

```mdx
import { ApiReference } from '@/components/ApiReference';

<ApiReference spec="/openapi-scim.yaml" />
```

- [ ] **Step 19.3: Commit**

```bash
git commit -am "docs(scim): API reference rendered from openapi-scim.yaml"
```

### Task 20 — Troubleshooting

**Files:** `docs/wiki/{en,ru}/scim/troubleshooting.mdx`

- [ ] **Step 20.1: Inventory common errors** (table-driven)

| Symptom | Cause | Fix |
|---|---|---|
| 401 Unauthorized | Wrong slug or revoked token | Check token in Tokens page; re-generate |
| 403 Forbidden | Token-slug mismatch | Verify endpoint URL exactly matches the slug from /settings/sso/scim |
| 409 uniqueness | Same userName already exists | Enable auto-link OR delete the duplicate manually |
| Empty grants after mapping | Recompute pending | Wait 30s; check Activity → "grants_recomputed" event |
| Anonymized user comes back via IdP | IdP still has active assignment | Remove from IdP first, then optionally reactivate in QuokkaQ |
| 410 Gone | User was anonymized; cannot reactivate | Create a new user resource |
| 429 rate limited | Burst exceeds 30 rps | Distribute over time; reduce IdP sync frequency |

- [ ] **Step 20.2: Commit**

```bash
git commit -am "docs(scim): troubleshooting guide"
```

---

## Phase 3.F — Internal docs

### Task 21 — On-call runbook

**Files:** `docs/operations/scim-runbook.md`

- [ ] **Step 21.1: Author the runbook**

Sections:
- Architecture overview (1-paragraph + link to design doc)
- Dashboards (links to Grafana from Task 16)
- Common alerts and what to do for each (5 alerts from §8.6)
- How to revoke a leaked token (UI + DB sql)
- How to investigate "stranded users" (mappings missing? recompute stuck?)
- How to roll back: env flag, plan feature, both
- Escalation: who owns SCIM after-hours

- [ ] **Step 21.2: Review with on-call team, commit**

```bash
git commit -am "docs(scim): on-call runbook"
```

### Task 22 — Update `CLAUDE.md`

**Files:** `CLAUDE.md`

- [ ] **Step 22.1: Add SCIM module to architecture map**

In the "Apps and packages" section add:
```markdown
- `apps/backend/internal/scim` — SCIM 2.0 enterprise provisioning. RFC 7643 / 7644 compliant. See `docs/plan/2026-04-25-scim-2.0-enterprise-provisioning-design.md` for the design and `docs/plan/2026-04-25-scim-plan-{1,2,3}-*.md` for phased implementation history.
- `apps/backend/internal/scim_admin` — Admin management API for the SCIM frontend (under `/api/v1/admin/scim/*`).
```

In the "API contract workflow" section add a note that SCIM endpoints follow RFC, not the project's general OpenAPI conventions:
```markdown
SCIM endpoints under `/scim/v2/*` are excluded from the main OpenAPI spec — they follow RFC 7644 with their own media type (`application/scim+json`). A separate `openapi-scim.yaml` documents them.
```

- [ ] **Step 22.2: Commit**

```bash
git commit -am "docs: add SCIM module reference to CLAUDE.md"
```

---

## Phase 3.G — Phased rollout

### Task 23 — Phase 1 alpha (T0 + week 1–2)

- [ ] **Step 23.1: Enable on staging**

Set `SCIM_ENABLED=true` in staging environment. Run conformance + integration suites against staging.

- [ ] **Step 23.2: Internal QA tenant**

Create staging tenant with self-hosted Keycloak. Run all Plan 3.A + 3.C tests.

- [ ] **Step 23.3: Sign-off checklist**

- All tests green (unit, integration, conformance, E2E)
- Metrics flowing into Grafana
- Alerts wired and tested by deliberately tripping each
- On-call team has read the runbook

### Task 24 — Phase 2 limited beta (T0 + week 3–4)

- [ ] **Step 24.1: Production env: `SCIM_ENABLED=true`**

But `scim_provisioning` plan feature off for all tenants. SCIM endpoints return 404 to everyone.

- [ ] **Step 24.2: Pick 1–2 beta tenants**

Coordinate with sales / customer success: tenants with active SCIM ask, willing to engage with us during incidents.

- [ ] **Step 24.3: Enable per-tenant**

Manually flip `scim_provisioning` for chosen tenants. Walk them through `/settings/sso/scim` setup.

- [ ] **Step 24.4: Daily monitoring**

Daily review: `scim_token_misuse_total`, `scim_request_duration_seconds` p99, recompute queue size, support tickets.

- [ ] **Step 24.5: Sign-off after 2 weeks without P1**

If P1 happens: extend beta, fix, re-test.

### Task 25 — Phase 3 GA (T0 + week 5+)

- [ ] **Step 25.1: Open `scim_provisioning` to plan tier ≥ Business**

Update plan-feature catalogue to include `scim_provisioning` in `business`, `enterprise` plan templates. Existing tenants on those plans get SCIM available immediately.

- [ ] **Step 25.2: Publish docs at `docs.quokkaq.ru/scim`**

Promote MDX docs (Tasks 17–20) from staging.quokkaq.ru/docs to docs.quokkaq.ru/scim.

- [ ] **Step 25.3: Marketing announcement**

Blog post + sales enablement deck. Coordinate with marketing team.

- [ ] **Step 25.4: Post-GA review**

After 2 weeks GA: review metrics, any P1/P2 incidents, customer feedback. Logged as decision input for Phase 2 candidates from spec §8.8.

---

## Self-review (done by author)

### Spec coverage (Plan 3 portion)

| Spec section | Plan 3 task(s) | Status |
|---|---|---|
| §8.1 Test pyramid (unit, integration) | Plans 1 + 2; Plan 3 adds conformance + E2E + load | ✅ |
| §8.2 RFC conformance — external validators | Tasks 1, 2 | ✅ |
| §8.3 Test fixtures | Plan 1 Task 8.3 (recorded payloads); Plan 3 Task 2.1 (Okta HAR) | ✅ |
| §8.4 Load testing (k6) | Tasks 4–9 | ✅ |
| §8.5 Rollout plan | Tasks 23–25 | ✅ |
| §8.6 Post-launch monitoring & alerts | Tasks 14, 16 | ✅ |
| §8.7 Documentation deliverables | Tasks 17–22 | ✅ |
| §8.9 Definition of Done | Implicit — every checkbox in Plan 3 maps to one DoD line | ✅ |
| §6.4 metrics | Task 14 | ✅ |
| §6.5 tracing | Task 15 | ✅ |
| Audit-event coverage (Plan 2 F1) | Task 3 | ✅ |

### Findings

- **F1 — `e2e:scim` Playwright target.** Task 10 says "if Playwright doesn't exist, install". Plan 3 doesn't ship Playwright as a project capability — only the SCIM tests. If the project doesn't already have Playwright (verify in Task 10.1), the parallel ops spec (`docs/plan/2026-04-25-ops-track-*`) was supposed to ship it. **Action:** if absent, allocate first task of Plan 3.C to install Playwright; otherwise import existing config.
- **F2 — Microsoft validator binary version.** Pinned at v2.3 in Task 1.1 — verify this is the latest stable when implementing. Newer versions may add new test cases that change conformance behaviour.
- **F3 — Okta HAR replay.** Task 2 depends on a manually-recorded HAR file. The recording is not committed in Plan 3 itself (the dev account isn't shared); the engineer who first runs Task 2 records and commits to the repo. Document the procedure inside the file.
- **F4 — Per-tenant rollout (Task 24.3) bypasses normal provisioning.** Manually flipping `scim_provisioning` for a tenant is fine for beta but should not become the standard path. Confirm during GA (Task 25.1) that the normal plan-tier-driven flow takes over.
- **F5 — Recompute queue size gauge requires Asynq Inspector.** Task 14.2 says "Background goroutine that polls asynq.Inspector every 30s". Verify the project's Asynq version exposes the inspector API (`asynq.NewInspector(...)`). Older versions may not.

### Type consistency

- Metric names match spec §6.4 verbatim. ✅
- OTel attribute keys consistent across handlers + jobs (Task 15). ✅
- Doc paths under `docs/wiki/{en,ru}/scim/` match the existing wiki structure (verified during impl). ✅
- All audit-event names tested in Task 3 match those emitted by Plan 1 + 2 services. ✅

### Conclusion

Plan 3 takes the working SCIM provisioning experience to GA: external IdPs are validated for conformance, the system has known load characteristics, the UI works end-to-end, ops have dashboards + alerts + a runbook, and customers have docs. After Tasks 1–25 ship: SCIM is a fully-supported QuokkaQ feature.

The Phase-2 candidates from spec §8.8 (OAuth client credentials, IP allowlist, /Bulk, /.search, custom schema, IdP dialect adapters, BYOK, audit→SIEM, GDPR Art.20 export, dry-run mode) remain available as future incremental plans — each can be brainstormed individually using the same flow that produced the SCIM design.

---

## Execution

**Plan 3 saved to `docs/plan/2026-04-25-scim-plan-3-rollout.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task. Most Plan 3 tasks are checklist-style (run k6, write docs, configure dashboards), so subagents are efficient — multiple can run in parallel after the metrics package (Task 14) lands.
2. **Inline Execution** — execute via `superpowers:executing-plans`, batch with checkpoints.

Sequencing: Plan 1 → Plan 2 → Plan 3. Within Plan 3:
- 3.A and 3.B can run in parallel after 3.D Task 14 lands (load tests need metrics to validate)
- 3.C requires Plan 2's UI to be deployed to staging
- 3.D Task 14 is the metrics foundation for everything else
- 3.E (docs) can start immediately after 3.D
- 3.F follows 3.E
- 3.G is the rollout — strictly sequential, gated by sign-offs

**Total estimated effort across all 3 plans:** ~10–12 person-weeks of focused engineering, 2–3 calendar months including review cycles, beta period, and customer feedback iteration.
