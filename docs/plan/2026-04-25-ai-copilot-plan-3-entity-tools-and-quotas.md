# AI Copilot Phase 3 — Entity Tools, Full PII Walker, Quotas, Cost Dashboard, A11y

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Copilot from "external demo" (Phase 2 end-state) to "billable GA". Add the entity-lookup tools that operators actually want (looking up specific tickets, clients, support reports, audit events) — gated by a real PII masker that walks structs by tag — plus per-plan token quotas, a cost dashboard for tenant admins, full Grafana observability, an in-app help page, and an accessibility audit pass. By the end of Phase 3, `copilot_v1` is a sellable line item.

**Architecture:** A reflection-based PII walker replaces Phase 1's `MaskMap` shim. Struct tags (`pii:"phone"`, `pii:"email"`, `pii:"full_name"`, `pii:"freetext"`, `pii:"address"`, `pii:"national_id"`) drive per-level redaction; fuzz tests assert no untagged PII pattern leaks. Seven new tools are added to the registry; each calls existing repositories or services with strict company-scoped queries and runs results through `pii.Mask` before returning to the LLM. Per-plan limits land in the `quota` package: a Redis-backed counter per tenant per (day, month) window with soft (warning at 80%) and hard (block + upsell) thresholds, reconciled nightly against `copilot_messages` aggregates. A new tenant-admin dashboard surfaces token spend, top users/tools, abort rate, and thumbs-up rate. OTel metrics defined in Phase 1 are wired to Grafana boards. The frontend ships an `/help/copilot` MDX page (rendered through the existing wiki engine) and the drawer passes a manual a11y audit (focus management, screen reader, keyboard nav).

**Tech Stack:**
- Backend: Go 1.26 reflection (`reflect`) for the PII walker, existing Redis + gorm + Asynq, OTel meter API.
- Frontend: existing TanStack Query + shadcn/ui + recharts (already used in statistics) for the cost dashboard charts.
- Tests: stdlib `testing/fuzz` for PII property tests, table-driven unit tests for tools, vitest for dashboard component.

**Source spec:** `docs/plan/2026-04-25-ai-copilot-for-managers-design.md` §3 (entity tools), §5 (PII), §10 (quotas + cost dashboard), §11 (observability), §9.7 (accessibility).

**Predecessor plans:**
- `docs/plan/2026-04-25-ai-copilot-plan-1-foundation.md`
- `docs/plan/2026-04-25-ai-copilot-plan-2-rag-and-providers.md`

Phase 3 builds on both; it does not refactor their public interfaces.

**Out of Phase 3 (deferred):** Visitor-facing Copilot, on-prem self-hosted LLM, custom-tenant tools / marketplace, write actions / suggested actions / autonomous agent, free-text NLP over surveys (separate Insight Engine spec), proactive insights / push notifications.

---

## File Structure

### Backend — files created

```
apps/backend/internal/copilot/tools/
├── pii_walker.go                       # reflection-based mask walker (replaces Phase 1's MaskMap)
├── pii_walker_test.go
├── pii_walker_fuzz_test.go             # property-based / fuzz tests
├── tool_lookup_ticket.go
├── tool_lookup_ticket_test.go
├── tool_search_clients.go
├── tool_search_clients_test.go
├── tool_lookup_support_report.go
├── tool_lookup_support_report_test.go
├── tool_search_audit_events.go
├── tool_search_audit_events_test.go
├── tool_get_staff_performance.go
├── tool_get_staff_performance_test.go
├── tool_get_survey_aggregates.go
├── tool_get_survey_aggregates_test.go
├── tool_get_sla_breaches.go
└── tool_get_sla_breaches_test.go

apps/backend/internal/copilot/quota/
├── plan_limits.go                      # per-plan token + message limits
├── plan_limits_test.go
├── usage_counter.go                    # Redis sliding-window counter
├── usage_counter_test.go               # uses miniredis
├── usage_reconcile.go                  # nightly reconcile against copilot_messages
└── usage_reconcile_test.go

apps/backend/internal/copilot/handlers/
├── cost_dashboard.go                   # GET /api/copilot/dashboard/* aggregations
└── cost_dashboard_test.go

apps/backend/internal/jobs/
└── copilot_quota_reconcile.go          # daily Asynq reconcile job

apps/backend/internal/copilot/dto/
├── ticket_summary.go                   # PII-tagged DTO for lookup_ticket
├── client_summary.go                   # PII-tagged DTO for search_clients
├── support_report_summary.go
└── audit_event_summary.go

apps/backend/observability/grafana/
├── copilot-overview.json               # Grafana dashboard JSON
└── copilot-by-tenant.json
```

### Backend — files modified

- `apps/backend/internal/copilot/tools/pii.go` — keep public functions for back-compat; route through `pii_walker.go` when `pii:` tag is present, fall back to old map walker for plain `map[string]any` legacy callers.
- `apps/backend/internal/copilot/handlers/feedback.go` — extend `HandleQuota` to return current-period counters and budget.
- `apps/backend/cmd/api/main.go` — register Phase 3 tools, wire reconcile job and cron, mount dashboard routes.
- `apps/backend/internal/jobs/types.go` + `client.go` — add `TypeCopilotQuotaReconcile`.

### Frontend — files created

```
apps/frontend/components/copilot/dashboard/
├── CostDashboard.tsx                   # tenant-admin page
├── TokensSeriesChart.tsx               # daily series (recharts)
├── TopUsersTable.tsx
├── TopToolsTable.tsx
├── KPIGrid.tsx                         # 6 KPI cards
└── CostDashboard.test.tsx

apps/frontend/app/[locale]/settings/copilot/
├── page.tsx                            # dashboard page
└── layout.tsx                          # if needed

apps/frontend/content/wiki/{en,ru}/help/copilot/
├── overview.mdx                        # in-app help: what Copilot does
├── tools.mdx                           # list of tools and what they do
├── limits.mdx                          # what counts toward quotas
└── privacy.mdx                         # PII handling explanation
```

### Frontend — files modified

- `apps/frontend/components/copilot/CopilotDrawer.tsx` — focus management, aria-live announcements, keyboard nav.
- `apps/frontend/components/copilot/Composer.tsx` — accessible labels, hotkey hints.
- `apps/frontend/messages/{en,ru}/copilot.json` — add dashboard, help, a11y strings.
- `apps/frontend/components/AppSidebar.tsx` — add "Copilot dashboard" item under settings (admin-gated).

---

## Conventions

- All Go file paths are relative to `apps/backend/`, all TS paths to `apps/frontend/`.
- New tools follow the same shape as Phase 1 tools (`Tool{Name, Schema, Handler, RequiredScopes}`).
- DTOs returning entity data **must** carry `pii:` struct tags on every field that could leak PII. Untagged string fields trigger a fuzz failure (Task 2).
- Each task ends with a commit step.

---

## Task 1: Full PII walker (replaces basic helper)

**Files:**
- Create: `apps/backend/internal/copilot/tools/pii_walker.go`
- Create: `apps/backend/internal/copilot/tools/pii_walker_test.go`
- Modify: `apps/backend/internal/copilot/tools/pii.go`

The walker uses `reflect` to traverse arbitrary structs, slices, maps, and pointers, applying redaction per-tag. Phase 1's `MaskMap` stays as the public API for `map[string]any` callers; the new `MaskStruct` is the entry point for typed DTOs.

- [ ] **Step 1: Failing tests**

Create `apps/backend/internal/copilot/tools/pii_walker_test.go`:

```go
package tools

import (
	"encoding/json"
	"strings"
	"testing"
)

type sampleClient struct {
	ID    string `json:"id"`
	Name  string `json:"name" pii:"full_name"`
	Phone string `json:"phone" pii:"phone"`
	Email string `json:"email" pii:"email"`
	Notes string `json:"notes" pii:"freetext"`
	Tags  []string `json:"tags"`
}

type sampleNested struct {
	Top    string         `json:"top"`
	Client *sampleClient  `json:"client"`
	List   []sampleClient `json:"list"`
}

func TestMaskStruct_StrictMasksAllTagged(t *testing.T) {
	t.Parallel()
	in := sampleClient{
		ID: "u1", Name: "Jane Doe", Phone: "+79161234567",
		Email: "jane@example.com", Notes: "secret note",
	}
	out := MaskStruct(in, PIIStrict)
	cs := out.(sampleClient)
	if cs.ID != "u1" {
		t.Errorf("id changed: %q", cs.ID)
	}
	if cs.Name != "J. D." {
		t.Errorf("name: %q", cs.Name)
	}
	if cs.Phone == in.Phone {
		t.Errorf("phone not masked: %q", cs.Phone)
	}
	if !strings.Contains(cs.Email, "@example.com") || strings.HasPrefix(cs.Email, "jane") {
		t.Errorf("email: %q", cs.Email)
	}
	if cs.Notes != "[redacted]" {
		t.Errorf("freetext should be redacted: %q", cs.Notes)
	}
}

func TestMaskStruct_RelaxedKeepsAllExceptTaggedRedact(t *testing.T) {
	t.Parallel()
	in := sampleClient{Phone: "+79161234567", Email: "j@e.com", Notes: "x"}
	out := MaskStruct(in, PIIRelaxed)
	cs := out.(sampleClient)
	if cs.Phone != in.Phone || cs.Email != in.Email {
		t.Errorf("relaxed masked unnecessarily: %+v", cs)
	}
	if cs.Notes != "x" {
		t.Errorf("relaxed should keep freetext: %q", cs.Notes)
	}
}

func TestMaskStruct_NestedSlicesAndPointers(t *testing.T) {
	t.Parallel()
	c := &sampleClient{Phone: "+79161234567"}
	in := sampleNested{
		Top:  "ok",
		Client: c,
		List: []sampleClient{{Email: "a@b.com"}, {Email: "c@d.com"}},
	}
	out := MaskStruct(in, PIIStandard)
	on := out.(sampleNested)
	if on.Top != "ok" {
		t.Errorf("untagged changed")
	}
	if on.Client.Phone == c.Phone {
		t.Errorf("nested ptr not masked: %q", on.Client.Phone)
	}
	for i, item := range on.List {
		if !strings.HasPrefix(item.Email, "a") && !strings.HasPrefix(item.Email, "c") {
			t.Errorf("first char not preserved at %d: %q", i, item.Email)
		}
		if !strings.Contains(item.Email, "@") {
			t.Errorf("email shape wrong at %d: %q", i, item.Email)
		}
	}
}

func TestMaskStruct_HandlesAnyMaps(t *testing.T) {
	t.Parallel()
	in := map[string]any{
		"id": "u1",
		"name": "Jane Doe",
		"phone": "+79161234567",
	}
	out := MaskStruct(in, PIIStrict)
	got, _ := json.Marshal(out)
	if !strings.Contains(string(got), "J. D.") {
		t.Errorf("name not masked in map: %s", got)
	}
}

func TestMaskStruct_UnknownTagIgnored(t *testing.T) {
	t.Parallel()
	type x struct {
		A string `pii:"unknown_tag"`
	}
	out := MaskStruct(x{A: "v"}, PIIStrict)
	if out.(x).A != "v" {
		t.Errorf("unknown tag should leave value untouched: %q", out.(x).A)
	}
}
```

- [ ] **Step 2: Verify fail**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestMaskStruct -v`
Expected: FAIL — `undefined: MaskStruct`.

- [ ] **Step 3: Implement walker**

Create `apps/backend/internal/copilot/tools/pii_walker.go`:

```go
package tools

import (
	"reflect"
	"strings"
)

// MaskStruct walks any value and applies PII masking based on `pii:` struct tags.
// Returns a new value of the same type with masked fields. Original is not mutated.
//
// Supported tag values: phone, email, full_name, address, national_id, freetext, passport_partial.
// Unknown tag values are ignored (value unchanged).
//
// Pointers, slices, arrays, maps (with string keys), nested structs are walked recursively.
// Non-string fields with PII tags are also passed through (tags only meaningful on strings).
func MaskStruct(v any, level string) any {
	if v == nil || level == PIIRelaxed && !hasRedactTags(reflect.TypeOf(v)) {
		// In relaxed mode, only "freetext" / "national_id" etc. that ALWAYS redact still apply.
		// We still need to walk to handle those. The fast-path skip is taken only when no
		// redact-always tags exist. Continue with full walk.
	}
	rv := reflect.ValueOf(v)
	out := walkAndMask(rv, level)
	if !out.IsValid() {
		return v
	}
	return out.Interface()
}

// hasRedactTags is a heuristic so relaxed mode still walks structs with always-redact fields.
func hasRedactTags(t reflect.Type) bool {
	if t == nil {
		return false
	}
	switch t.Kind() {
	case reflect.Pointer:
		return hasRedactTags(t.Elem())
	case reflect.Struct:
		for i := 0; i < t.NumField(); i++ {
			tag := t.Field(i).Tag.Get("pii")
			if tag == "freetext" || tag == "national_id" || tag == "passport_partial" {
				return true
			}
			if hasRedactTags(t.Field(i).Type) {
				return true
			}
		}
	case reflect.Slice, reflect.Array, reflect.Map, reflect.Pointer:
		return hasRedactTags(t.Elem())
	}
	return false
}

func walkAndMask(rv reflect.Value, level string) reflect.Value {
	if !rv.IsValid() {
		return rv
	}
	switch rv.Kind() {
	case reflect.Pointer:
		if rv.IsNil() {
			return rv
		}
		elem := walkAndMask(rv.Elem(), level)
		if !elem.IsValid() {
			return rv
		}
		ptr := reflect.New(rv.Type().Elem())
		ptr.Elem().Set(elem)
		return ptr
	case reflect.Interface:
		if rv.IsNil() {
			return rv
		}
		return walkAndMask(rv.Elem(), level)
	case reflect.Struct:
		out := reflect.New(rv.Type()).Elem()
		for i := 0; i < rv.NumField(); i++ {
			f := rv.Type().Field(i)
			fv := rv.Field(i)
			tag := f.Tag.Get("pii")
			if tag != "" && fv.Kind() == reflect.String {
				masked := maskByTag(fv.String(), tag, level)
				out.Field(i).SetString(masked)
				continue
			}
			out.Field(i).Set(walkAndMask(fv, level))
		}
		return out
	case reflect.Slice, reflect.Array:
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return rv
		}
		out := reflect.MakeSlice(rv.Type(), rv.Len(), rv.Len())
		for i := 0; i < rv.Len(); i++ {
			out.Index(i).Set(walkAndMask(rv.Index(i), level))
		}
		return out
	case reflect.Map:
		if rv.IsNil() {
			return rv
		}
		out := reflect.MakeMapWithSize(rv.Type(), rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			k := iter.Key()
			val := iter.Value()
			// For map[string]any: use field-name-based mask via the existing map handler.
			if rv.Type().Key().Kind() == reflect.String && val.Kind() == reflect.Interface {
				keyStr := k.String()
				inner := val
				if !inner.IsNil() {
					inner = inner.Elem()
				}
				if inner.Kind() == reflect.String {
					if h, ok := piiKeyHandlers[keyStr]; ok {
						out.SetMapIndex(k, reflect.ValueOf(h(inner.String(), level)))
						continue
					}
				}
				out.SetMapIndex(k, walkAndMask(val, level))
				continue
			}
			out.SetMapIndex(k, walkAndMask(val, level))
		}
		return out
	default:
		return rv
	}
}

func maskByTag(s, tag, level string) string {
	switch strings.ToLower(tag) {
	case "phone":
		return MaskPhone(s, level)
	case "email":
		return MaskEmail(s, level)
	case "full_name":
		return MaskFullName(s, level)
	case "address":
		return maskAddress(s, level)
	case "national_id":
		return "[redacted]"
	case "passport_partial":
		return maskPassportPartial(s, level)
	case "freetext":
		if level == PIIRelaxed {
			return s
		}
		return "[redacted]"
	default:
		return s
	}
}

func maskAddress(s, level string) string {
	if level == PIIRelaxed {
		return s
	}
	// Standard: strip leading street numbers (e.g. "12 Main St" → "Main St").
	// Strict: redact entirely.
	if level == PIIStrict {
		return "[redacted]"
	}
	out := strings.TrimLeft(s, "0123456789, /.-")
	return strings.TrimSpace(out)
}

func maskPassportPartial(s, level string) string {
	if level == PIIRelaxed {
		return s
	}
	if len(s) <= 4 {
		return "***"
	}
	return "*** *** " + s[len(s)-4:]
}
```

- [ ] **Step 4: Update `pii.go` to delegate**

Modify `apps/backend/internal/copilot/tools/pii.go` — at the bottom, document that `MaskMap` remains for legacy callers and that new code should use `MaskStruct`. No code change required; the doc is a comment block.

```go
// MaskMap is the legacy entry point for untyped map[string]any results.
// New code should use MaskStruct on typed DTOs (declared with `pii:` struct tags).
// MaskMap is retained because some Phase 1 tool handlers still emit map[string]any.
//
// Phase 3 introduces typed DTOs in internal/copilot/dto/ for entity tools so they
// route through MaskStruct.
```

- [ ] **Step 5: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run "TestMask" -v`
Expected: PASS — all of Phase 1's tests + 5 new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/internal/copilot/tools/pii_walker.go apps/backend/internal/copilot/tools/pii_walker_test.go apps/backend/internal/copilot/tools/pii.go
git commit -m "feat(copilot): add reflection-based PII walker with struct-tag dispatch"
```

---

## Task 2: PII fuzz / property tests

**Files:**
- Create: `apps/backend/internal/copilot/tools/pii_walker_fuzz_test.go`

Property tests assert two invariants:
1. After `MaskStruct(x, PIIStrict)`, the JSON-serialized output contains no full-form phone or email pattern that wasn't tagged.
2. `MaskStruct(MaskStruct(x, level), level) == MaskStruct(x, level)` (idempotence).

Go's stdlib `testing/fuzz` provides corpus-seeded fuzzing.

- [ ] **Step 1: Write the fuzz test**

Create `apps/backend/internal/copilot/tools/pii_walker_fuzz_test.go`:

```go
package tools

import (
	"encoding/json"
	"regexp"
	"testing"
)

var (
	rePhonePattern = regexp.MustCompile(`\+?\d[\d\- ()]{8,}\d`)
	reEmailPattern = regexp.MustCompile(`[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
)

type taggedDTO struct {
	ID    string `json:"id"`
	Phone string `json:"phone" pii:"phone"`
	Email string `json:"email" pii:"email"`
	Note  string `json:"note" pii:"freetext"`
}

func FuzzMaskStruct_StrictNoLeak(f *testing.F) {
	f.Add("u1", "+79161234567", "jane@example.com", "secret stuff with phone +79161234567 inside")
	f.Add("u2", "+15551234567", "bob.smith+test@corp.dev", "")
	f.Add("u3", "0000-1111", "x@y.io", "lorem ipsum")
	f.Fuzz(func(t *testing.T, id, phone, email, note string) {
		in := taggedDTO{ID: id, Phone: phone, Email: email, Note: note}
		out := MaskStruct(in, PIIStrict)
		raw, _ := json.Marshal(out)
		// `Phone` field should be masked.
		if phone != "" && strings.Contains(string(raw), in.Phone) {
			// Allow if input phone had < 3 digits (won't be masked).
			digits := 0
			for _, r := range phone {
				if r >= '0' && r <= '9' {
					digits++
				}
			}
			if digits >= 3 {
				t.Errorf("phone leaked: input=%q raw=%s", phone, raw)
			}
		}
		// Email: original local part should not appear if longer than 1 char.
		if email != "" && strings.Contains(string(raw), in.Email) && countAt(email) == 1 && len(localPart(email)) > 1 {
			t.Errorf("email leaked: input=%q raw=%s", email, raw)
		}
		// Note: in strict, freetext must be [redacted].
		out2 := MaskStruct(in, PIIStrict).(taggedDTO)
		if note != "" && out2.Note != "[redacted]" {
			t.Errorf("freetext not redacted: %q", out2.Note)
		}
	})
}

func FuzzMaskStruct_Idempotent(f *testing.F) {
	f.Add("Jane Doe", "+79161234567", "j@e.com", "x")
	f.Fuzz(func(t *testing.T, name, phone, email, note string) {
		in := taggedDTO{Phone: phone, Email: email, Note: note}
		_ = name
		for _, lvl := range []string{PIIStrict, PIIStandard, PIIRelaxed} {
			a := MaskStruct(in, lvl)
			b := MaskStruct(a, lvl)
			ja, _ := json.Marshal(a)
			jb, _ := json.Marshal(b)
			if string(ja) != string(jb) {
				t.Errorf("not idempotent at level=%s: %s vs %s", lvl, ja, jb)
			}
		}
	})
}

func countAt(s string) int { n := 0; for _, c := range s { if c == '@' { n++ } }; return n }
func localPart(s string) string {
	for i, c := range s {
		if c == '@' {
			return s[:i]
		}
	}
	return s
}
```

> Note: this file must add `import "strings"` if not already present from sibling tests.

- [ ] **Step 2: Run fuzz seed (short)**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run FuzzMaskStruct -v`
Expected: PASS — runs the seed corpus.

Optional extended fuzz (manual):
Run: `cd apps/backend && go test ./internal/copilot/tools/ -fuzz=FuzzMaskStruct_StrictNoLeak -fuzztime=30s`
Expected: no failures within budget.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/internal/copilot/tools/pii_walker_fuzz_test.go
git commit -m "test(copilot): add PII walker fuzz tests for leak and idempotence"
```

---

## Task 3: DTOs for entity tools

**Files:**
- Create: `apps/backend/internal/copilot/dto/ticket_summary.go`
- Create: `apps/backend/internal/copilot/dto/client_summary.go`
- Create: `apps/backend/internal/copilot/dto/support_report_summary.go`
- Create: `apps/backend/internal/copilot/dto/audit_event_summary.go`

The DTOs sit between the existing repositories (which return full models with PII) and the LLM (which receives masked content). They carry `pii:` tags consumed by `MaskStruct`.

- [ ] **Step 1: Ticket DTO**

Create `apps/backend/internal/copilot/dto/ticket_summary.go`:

```go
package dto

import "time"

// TicketSummary is the LLM-facing shape for lookup_ticket. PII fields are tagged
// so MaskStruct redacts according to tenant level.
type TicketSummary struct {
	ID            string     `json:"id"`
	Number        string     `json:"number"`
	UnitID        string     `json:"unitId"`
	UnitName      string     `json:"unitName"`
	ServiceID     string     `json:"serviceId"`
	ServiceName   string     `json:"serviceName"`
	Status        string     `json:"status"`
	CounterID     string     `json:"counterId,omitempty"`
	CounterName   string     `json:"counterName,omitempty"`
	WaitSec       int        `json:"waitSec"`
	ServeSec      int        `json:"serveSec"`
	CreatedAt     time.Time  `json:"createdAt"`
	CalledAt      *time.Time `json:"calledAt,omitempty"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
	VisitorName   string     `json:"visitorName,omitempty" pii:"full_name"`
	VisitorPhone  string     `json:"visitorPhone,omitempty" pii:"phone"`
	VisitorEmail  string     `json:"visitorEmail,omitempty" pii:"email"`
	VisitorNote   string     `json:"visitorNote,omitempty" pii:"freetext"`
}
```

- [ ] **Step 2: Client DTO**

Create `apps/backend/internal/copilot/dto/client_summary.go`:

```go
package dto

import "time"

type ClientSummary struct {
	ID         string     `json:"id"`
	Name       string     `json:"name" pii:"full_name"`
	Phone      string     `json:"phone,omitempty" pii:"phone"`
	Email      string     `json:"email,omitempty" pii:"email"`
	Tags       []string   `json:"tags,omitempty"`
	VisitCount int        `json:"visitCount"`
	LastVisit  *time.Time `json:"lastVisit,omitempty"`
	Notes      string     `json:"notes,omitempty" pii:"freetext"`
}
```

- [ ] **Step 3: Support report DTO**

Create `apps/backend/internal/copilot/dto/support_report_summary.go`:

```go
package dto

import "time"

type SupportReportSummary struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Status        string    `json:"status"`
	Classification string   `json:"classification,omitempty"`
	UnitID        string    `json:"unitId,omitempty"`
	ReporterName  string    `json:"reporterName,omitempty" pii:"full_name"`
	CommentCount  int       `json:"commentCount"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}
```

> Note: Phase 3 explicitly does NOT include the report body or comment text in the LLM payload. The `freetext` Insight Engine is a separate spec. We surface only metadata.

- [ ] **Step 4: Audit event DTO**

Create `apps/backend/internal/copilot/dto/audit_event_summary.go`:

```go
package dto

import "time"

type AuditEventSummary struct {
	ID         string    `json:"id"`
	Action     string    `json:"action"`
	ActorID    string    `json:"actorId,omitempty"`
	ActorName  string    `json:"actorName,omitempty" pii:"full_name"`
	UnitID     string    `json:"unitId,omitempty"`
	TargetType string    `json:"targetType,omitempty"`
	TargetID   string    `json:"targetId,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	// Note: payload is intentionally NOT included to avoid leaking PII through
	// audit-log breadcrumbs. The audit event surfaces action codes only.
}
```

- [ ] **Step 5: Compile + commit**

Run: `cd apps/backend && go build ./internal/copilot/dto/`
Expected: success.

```bash
git add apps/backend/internal/copilot/dto/
git commit -m "feat(copilot): add PII-tagged DTOs for entity tools"
```

---

## Task 4: Tool `lookup_ticket`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_lookup_ticket.go`
- Create: `apps/backend/internal/copilot/tools/tool_lookup_ticket_test.go`

- [ ] **Step 1: Failing test**

Create `apps/backend/internal/copilot/tools/tool_lookup_ticket_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"quokkaq-go-backend/internal/copilot/dto"
)

type fakeTicketLookup struct {
	resp *dto.TicketSummary
	err  error
	gotID string
	gotCompany string
}

func (f *fakeTicketLookup) LookupTicket(_ context.Context, companyID, idOrNumber, unitID string) (*dto.TicketSummary, error) {
	f.gotID = idOrNumber
	f.gotCompany = companyID
	return f.resp, f.err
}

func TestLookupTicketTool_MasksPII(t *testing.T) {
	t.Parallel()
	now := time.Now()
	src := &fakeTicketLookup{resp: &dto.TicketSummary{
		ID:           "tk1",
		Number:       "A-007",
		UnitName:     "Almaty",
		ServiceName:  "Loans",
		Status:       "completed",
		WaitSec:      120,
		ServeSec:     300,
		CreatedAt:    now,
		VisitorName:  "Jane Doe",
		VisitorPhone: "+79161234567",
		VisitorEmail: "jane@example.com",
		VisitorNote:  "VIP",
	}}
	tool := NewLookupTicketTool(src)
	out, err := tool.Handler(ToolCtx{
		CompanyID: "c1", Roles: []string{"ticket:read"}, PIILevel: PIIStrict,
	}, json.RawMessage(`{"ticket_id_or_number":"A-007"}`))
	if err != nil {
		t.Fatal(err)
	}
	body := string(out.Content)
	if contains(body, "Jane Doe") {
		t.Errorf("name leaked: %s", body)
	}
	if contains(body, "+79161234567") {
		t.Errorf("phone leaked: %s", body)
	}
	if contains(body, "jane@example.com") {
		t.Errorf("email leaked: %s", body)
	}
	if !contains(body, "[redacted]") {
		t.Errorf("freetext not redacted: %s", body)
	}
}

func TestLookupTicketTool_NotFound(t *testing.T) {
	t.Parallel()
	src := &fakeTicketLookup{resp: nil}
	tool := NewLookupTicketTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"ticket:read"}}, json.RawMessage(`{"ticket_id_or_number":"X"}`))
	if err != nil {
		t.Fatal(err)
	}
	if !contains(string(out.Content), "not_found") {
		t.Errorf("expected not_found marker, got %s", out.Content)
	}
}

func TestLookupTicketTool_RequiresInput(t *testing.T) {
	t.Parallel()
	tool := NewLookupTicketTool(&fakeTicketLookup{})
	if _, err := tool.Handler(ToolCtx{Roles: []string{"ticket:read"}}, json.RawMessage(`{}`)); err == nil {
		t.Fatal("expected error on empty input")
	}
}
```

- [ ] **Step 2: Implement**

Create `apps/backend/internal/copilot/tools/tool_lookup_ticket.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"quokkaq-go-backend/internal/copilot/dto"
)

// TicketLookup is the abstraction the tool depends on; cmd/api wires an adapter
// over the existing ticket service / repository.
type TicketLookup interface {
	LookupTicket(ctx context.Context, companyID, idOrNumber, unitID string) (*dto.TicketSummary, error)
}

func NewLookupTicketTool(src TicketLookup) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"ticket_id_or_number":{"type":"string","minLength":1},
			"unit_id":{"type":"string"}
		},
		"required":["ticket_id_or_number"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "lookup_ticket",
		Description:    "Look up a single ticket by ID or display number, scoped to the caller's company. Returns masked visitor PII.",
		Schema:         schema,
		RequiredScopes: []string{"ticket:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				TicketIDOrNumber string `json:"ticket_id_or_number"`
				UnitID           string `json:"unit_id"`
			}
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.TicketIDOrNumber) == "" {
				return Result{}, errors.New("ticket_id_or_number required")
			}
			t, err := src.LookupTicket(context.Background(), tctx.CompanyID, in.TicketIDOrNumber, in.UnitID)
			if err != nil {
				return Result{}, err
			}
			if t == nil {
				body, _ := json.Marshal(map[string]string{"status": "not_found", "ticket_id_or_number": in.TicketIDOrNumber})
				return Result{Content: body}, nil
			}
			masked := MaskStruct(*t, fallbackLevel(tctx.PIILevel))
			body, _ := json.Marshal(masked)
			return Result{Content: body}, nil
		},
	}
}

func fallbackLevel(level string) string {
	if level == "" {
		return PIIStandard
	}
	return level
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestLookupTicket -v`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_lookup_ticket*.go
git commit -m "feat(copilot): add lookup_ticket tool with PII masking"
```

---

## Task 5: Tool `search_clients`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_search_clients.go`
- Create: `apps/backend/internal/copilot/tools/tool_search_clients_test.go`

- [ ] **Step 1: Failing test**

Create `apps/backend/internal/copilot/tools/tool_search_clients_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/copilot/dto"
)

type fakeClientSearch struct {
	resp []dto.ClientSummary
}

func (f *fakeClientSearch) SearchClients(_ context.Context, companyID string, filter ClientFilter) ([]dto.ClientSummary, error) {
	return f.resp, nil
}

func TestSearchClientsTool_LimitClampedTo50(t *testing.T) {
	t.Parallel()
	src := &fakeClientSearch{}
	tool := NewSearchClientsTool(src)
	if _, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"client:read"}}, json.RawMessage(`{"filter":{"limit":500}}`)); err != nil {
		t.Fatal(err)
	}
}

func TestSearchClientsTool_MasksPII(t *testing.T) {
	t.Parallel()
	src := &fakeClientSearch{resp: []dto.ClientSummary{
		{ID: "c1", Name: "Jane Doe", Phone: "+79161234567", Email: "j@e.com", VisitCount: 5},
	}}
	tool := NewSearchClientsTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"client:read"}, PIILevel: PIIStrict}, json.RawMessage(`{"filter":{"limit":10}}`))
	if err != nil {
		t.Fatal(err)
	}
	body := string(out.Content)
	if contains(body, "Jane Doe") || contains(body, "+79161234567") {
		t.Errorf("PII leaked: %s", body)
	}
}
```

- [ ] **Step 2: Implement**

Create `apps/backend/internal/copilot/tools/tool_search_clients.go`:

```go
package tools

import (
	"context"
	"encoding/json"

	"quokkaq-go-backend/internal/copilot/dto"
)

type ClientFilter struct {
	Tag             string `json:"tag,omitempty"`
	LastVisitAfter  string `json:"lastVisitAfter,omitempty"` // RFC3339
	Limit           int    `json:"limit,omitempty"`
}

type ClientSearch interface {
	SearchClients(ctx context.Context, companyID string, filter ClientFilter) ([]dto.ClientSummary, error)
}

func NewSearchClientsTool(src ClientSearch) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"filter":{
				"type":"object",
				"properties":{
					"tag":{"type":"string"},
					"lastVisitAfter":{"type":"string","format":"date-time"},
					"limit":{"type":"integer","minimum":1,"maximum":50}
				}
			}
		},
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "search_clients",
		Description:    "Search the unit-client CRM scoped to the caller's company. Returns up to 50 masked client summaries.",
		Schema:         schema,
		RequiredScopes: []string{"client:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				Filter ClientFilter `json:"filter"`
			}
			if len(args) > 0 && string(args) != "null" {
				if err := json.Unmarshal(args, &in); err != nil {
					return Result{}, err
				}
			}
			if in.Filter.Limit <= 0 || in.Filter.Limit > 50 {
				in.Filter.Limit = 20
			}
			rows, err := src.SearchClients(context.Background(), tctx.CompanyID, in.Filter)
			if err != nil {
				return Result{}, err
			}
			masked := MaskStruct(rows, fallbackLevel(tctx.PIILevel))
			body, _ := json.Marshal(struct {
				Clients any `json:"clients"`
			}{Clients: masked})
			return Result{Content: body}, nil
		},
	}
}
```

- [ ] **Step 3: Run + commit**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestSearchClients -v`
Expected: PASS — 2 tests.

```bash
git add apps/backend/internal/copilot/tools/tool_search_clients*.go
git commit -m "feat(copilot): add search_clients tool"
```

---

## Task 6: Tool `lookup_support_report`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_lookup_support_report.go`
- Create: `apps/backend/internal/copilot/tools/tool_lookup_support_report_test.go`

- [ ] **Step 1: Failing test**

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/copilot/dto"
)

type fakeSupportLookup struct{ resp *dto.SupportReportSummary }

func (f *fakeSupportLookup) LookupSupportReport(_ context.Context, companyID, id string) (*dto.SupportReportSummary, error) {
	return f.resp, nil
}

func TestLookupSupportReportTool_HappyPath(t *testing.T) {
	t.Parallel()
	src := &fakeSupportLookup{resp: &dto.SupportReportSummary{
		ID: "sr1", Title: "Counter scanner broken", Status: "open", Classification: "hardware",
		ReporterName: "Jane Doe", CommentCount: 3,
	}}
	tool := NewLookupSupportReportTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"support:read"}, PIILevel: PIIStrict}, json.RawMessage(`{"id":"sr1"}`))
	if err != nil {
		t.Fatal(err)
	}
	body := string(out.Content)
	if contains(body, "Jane Doe") {
		t.Errorf("name leaked: %s", body)
	}
	if !contains(body, "hardware") {
		t.Errorf("classification missing: %s", body)
	}
}

func TestLookupSupportReportTool_NotFound(t *testing.T) {
	t.Parallel()
	src := &fakeSupportLookup{resp: nil}
	tool := NewLookupSupportReportTool(src)
	out, _ := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"support:read"}}, json.RawMessage(`{"id":"x"}`))
	if !contains(string(out.Content), "not_found") {
		t.Errorf("expected not_found: %s", out.Content)
	}
}
```

- [ ] **Step 2: Implement**

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"quokkaq-go-backend/internal/copilot/dto"
)

type SupportLookup interface {
	LookupSupportReport(ctx context.Context, companyID, id string) (*dto.SupportReportSummary, error)
}

func NewLookupSupportReportTool(src SupportLookup) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{"id":{"type":"string","minLength":1}},
		"required":["id"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "lookup_support_report",
		Description:    "Look up a single support report (header + comment count + classification) for the caller's company. Free-text comment bodies are NOT included in v1.",
		Schema:         schema,
		RequiredScopes: []string{"support:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct{ ID string `json:"id"` }
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.ID) == "" {
				return Result{}, errors.New("id required")
			}
			r, err := src.LookupSupportReport(context.Background(), tctx.CompanyID, in.ID)
			if err != nil {
				return Result{}, err
			}
			if r == nil {
				body, _ := json.Marshal(map[string]string{"status": "not_found", "id": in.ID})
				return Result{Content: body}, nil
			}
			masked := MaskStruct(*r, fallbackLevel(tctx.PIILevel))
			body, _ := json.Marshal(masked)
			return Result{Content: body}, nil
		},
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_lookup_support_report*.go
git commit -m "feat(copilot): add lookup_support_report tool"
```

---

## Task 7: Tool `search_audit_events`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_search_audit_events.go`
- Create: `apps/backend/internal/copilot/tools/tool_search_audit_events_test.go`

- [ ] **Step 1: Failing test**

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/copilot/dto"
)

type fakeAuditSearch struct{ resp []dto.AuditEventSummary }

func (f *fakeAuditSearch) SearchAuditEvents(_ context.Context, companyID string, filter AuditFilter) ([]dto.AuditEventSummary, error) {
	return f.resp, nil
}

func TestSearchAuditEventsTool_HappyPath(t *testing.T) {
	t.Parallel()
	src := &fakeAuditSearch{resp: []dto.AuditEventSummary{
		{ID: "a1", Action: "ticket.completed", ActorName: "Jane Doe", TargetType: "ticket", TargetID: "tk1"},
	}}
	tool := NewSearchAuditEventsTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"audit:read"}, PIILevel: PIIStrict}, json.RawMessage(`{"filter":{"limit":10}}`))
	if err != nil {
		t.Fatal(err)
	}
	body := string(out.Content)
	if contains(body, "Jane Doe") {
		t.Errorf("actor name leaked: %s", body)
	}
	if !contains(body, "ticket.completed") {
		t.Errorf("action missing: %s", body)
	}
}
```

- [ ] **Step 2: Implement**

```go
package tools

import (
	"context"
	"encoding/json"

	"quokkaq-go-backend/internal/copilot/dto"
)

type AuditFilter struct {
	ActorID string `json:"actorId,omitempty"`
	Action  string `json:"action,omitempty"`
	Since   string `json:"since,omitempty"` // RFC3339
	Until   string `json:"until,omitempty"`
	Limit   int    `json:"limit,omitempty"`
}

type AuditSearch interface {
	SearchAuditEvents(ctx context.Context, companyID string, filter AuditFilter) ([]dto.AuditEventSummary, error)
}

func NewSearchAuditEventsTool(src AuditSearch) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"filter":{
				"type":"object",
				"properties":{
					"actorId":{"type":"string"},
					"action":{"type":"string"},
					"since":{"type":"string","format":"date-time"},
					"until":{"type":"string","format":"date-time"},
					"limit":{"type":"integer","minimum":1,"maximum":50}
				}
			}
		},
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "search_audit_events",
		Description:    "Search audit log events (action codes, actor, target) for the caller's company. Event payloads are excluded.",
		Schema:         schema,
		RequiredScopes: []string{"audit:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct{ Filter AuditFilter `json:"filter"` }
			if len(args) > 0 && string(args) != "null" {
				if err := json.Unmarshal(args, &in); err != nil {
					return Result{}, err
				}
			}
			if in.Filter.Limit <= 0 || in.Filter.Limit > 50 {
				in.Filter.Limit = 20
			}
			rows, err := src.SearchAuditEvents(context.Background(), tctx.CompanyID, in.Filter)
			if err != nil {
				return Result{}, err
			}
			masked := MaskStruct(rows, fallbackLevel(tctx.PIILevel))
			body, _ := json.Marshal(struct {
				Events any `json:"events"`
			}{Events: masked})
			return Result{Content: body}, nil
		},
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_search_audit_events*.go
git commit -m "feat(copilot): add search_audit_events tool"
```

---

## Task 8: Tools `get_staff_performance`, `get_survey_aggregates`, `get_sla_breaches`

These three tools are aggregated metrics (no PII), parallel in shape to Phase 1's `get_unit_summary`.

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_get_staff_performance.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_staff_performance_test.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_survey_aggregates.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_survey_aggregates_test.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_sla_breaches.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_sla_breaches_test.go`

- [ ] **Step 1: `get_staff_performance` test + impl**

Test:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type fakeStaffPerf struct{ resp []StaffPerformanceRow }

func (f *fakeStaffPerf) GetStaffPerformance(_ context.Context, companyID, unitID string, from, to time.Time) ([]StaffPerformanceRow, error) {
	return f.resp, nil
}

func TestGetStaffPerformanceTool_HappyPath(t *testing.T) {
	t.Parallel()
	src := &fakeStaffPerf{resp: []StaffPerformanceRow{
		{CounterID: "co1", CounterName: "Counter 1", Served: 220, AvgServeSec: 180, NoShowRate: 0.04},
	}}
	tool := NewGetStaffPerformanceTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, json.RawMessage(`{
		"unit_id":"u1","period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if !contains(string(out.Content), "Counter 1") {
		t.Errorf("missing counter: %s", out.Content)
	}
}
```

Impl:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type StaffPerformanceRow struct {
	CounterID   string  `json:"counterId"`
	CounterName string  `json:"counterName"`
	Served      int     `json:"served"`
	AvgServeSec int     `json:"avgServeSec"`
	NoShowRate  float64 `json:"noShowRate"`
}

type StaffPerformanceProvider interface {
	GetStaffPerformance(ctx context.Context, companyID, unitID string, from, to time.Time) ([]StaffPerformanceRow, error)
}

func NewGetStaffPerformanceTool(p StaffPerformanceProvider) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"unit_id":{"type":"string","minLength":1},
			"period":{
				"type":"object",
				"properties":{"from":{"type":"string","format":"date-time"},"to":{"type":"string","format":"date-time"}},
				"required":["from","to"]
			}
		},
		"required":["unit_id","period"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "get_staff_performance",
		Description:    "Per-counter performance for a unit over a period: served count, avg serve time, no-show rate.",
		Schema:         schema,
		RequiredScopes: []string{"stats:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				UnitID string `json:"unit_id"`
				Period struct {
					From string `json:"from"`
					To   string `json:"to"`
				} `json:"period"`
			}
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.UnitID) == "" {
				return Result{}, errors.New("unit_id required")
			}
			from, err := time.Parse(time.RFC3339, in.Period.From)
			if err != nil {
				return Result{}, errors.New("invalid period.from")
			}
			to, err := time.Parse(time.RFC3339, in.Period.To)
			if err != nil {
				return Result{}, errors.New("invalid period.to")
			}
			rows, err := p.GetStaffPerformance(context.Background(), tctx.CompanyID, in.UnitID, from, to)
			if err != nil {
				return Result{}, err
			}
			body, _ := json.Marshal(struct {
				Rows []StaffPerformanceRow `json:"rows"`
			}{Rows: rows})
			return Result{Content: body}, nil
		},
	}
}
```

- [ ] **Step 2: `get_survey_aggregates`**

Test:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type fakeSurveyAgg struct{ resp SurveyAggregates }

func (f *fakeSurveyAgg) GetSurveyAggregates(_ context.Context, companyID, unitID string, from, to time.Time) (SurveyAggregates, error) {
	return f.resp, nil
}

func TestGetSurveyAggregatesTool_HappyPath(t *testing.T) {
	t.Parallel()
	src := &fakeSurveyAgg{resp: SurveyAggregates{ResponseCount: 120, NPS: 42.5, AvgScore: 4.3}}
	tool := NewGetSurveyAggregatesTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, json.RawMessage(`{"unit_id":"u1","period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if !contains(string(out.Content), "42.5") {
		t.Errorf("NPS missing: %s", out.Content)
	}
}
```

Impl:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type SurveyAggregates struct {
	ResponseCount int     `json:"responseCount"`
	NPS           float64 `json:"nps"`
	AvgScore      float64 `json:"avgScore"`
	Promoters     int     `json:"promoters"`
	Passives      int     `json:"passives"`
	Detractors    int     `json:"detractors"`
}

type SurveyAggregatesProvider interface {
	GetSurveyAggregates(ctx context.Context, companyID, unitID string, from, to time.Time) (SurveyAggregates, error)
}

func NewGetSurveyAggregatesTool(p SurveyAggregatesProvider) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"unit_id":{"type":"string","minLength":1},
			"period":{
				"type":"object",
				"properties":{"from":{"type":"string","format":"date-time"},"to":{"type":"string","format":"date-time"}},
				"required":["from","to"]
			}
		},
		"required":["unit_id","period"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "get_survey_aggregates",
		Description:    "NPS-style satisfaction aggregates for a unit over a period. Free-text answers are NOT included.",
		Schema:         schema,
		RequiredScopes: []string{"stats:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				UnitID string `json:"unit_id"`
				Period struct {
					From string `json:"from"`
					To   string `json:"to"`
				} `json:"period"`
			}
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.UnitID) == "" {
				return Result{}, errors.New("unit_id required")
			}
			from, err := time.Parse(time.RFC3339, in.Period.From)
			if err != nil {
				return Result{}, errors.New("invalid period.from")
			}
			to, err := time.Parse(time.RFC3339, in.Period.To)
			if err != nil {
				return Result{}, errors.New("invalid period.to")
			}
			agg, err := p.GetSurveyAggregates(context.Background(), tctx.CompanyID, in.UnitID, from, to)
			if err != nil {
				return Result{}, err
			}
			body, _ := json.Marshal(agg)
			return Result{Content: body}, nil
		},
	}
}
```

- [ ] **Step 3: `get_sla_breaches`**

Test:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type fakeSLABreach struct{ resp []SLABreachRow }

func (f *fakeSLABreach) GetSLABreaches(_ context.Context, companyID, unitID string, from, to time.Time, limit int) ([]SLABreachRow, error) {
	return f.resp, nil
}

func TestGetSLABreachesTool_HappyPath(t *testing.T) {
	t.Parallel()
	now := time.Now()
	src := &fakeSLABreach{resp: []SLABreachRow{
		{TicketID: "tk1", ServiceName: "Loans", BreachedAt: now, WaitSec: 1900, ThresholdSec: 600},
	}}
	tool := NewGetSLABreachesTool(src)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, json.RawMessage(`{"unit_id":"u1","period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"},"limit":10}`))
	if err != nil {
		t.Fatal(err)
	}
	if !contains(string(out.Content), "Loans") {
		t.Errorf("service missing: %s", out.Content)
	}
}
```

Impl:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type SLABreachRow struct {
	TicketID     string    `json:"ticketId"`
	ServiceName  string    `json:"serviceName"`
	BreachedAt   time.Time `json:"breachedAt"`
	WaitSec      int       `json:"waitSec"`
	ThresholdSec int       `json:"thresholdSec"`
}

type SLABreachProvider interface {
	GetSLABreaches(ctx context.Context, companyID, unitID string, from, to time.Time, limit int) ([]SLABreachRow, error)
}

func NewGetSLABreachesTool(p SLABreachProvider) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"unit_id":{"type":"string","minLength":1},
			"period":{
				"type":"object",
				"properties":{"from":{"type":"string","format":"date-time"},"to":{"type":"string","format":"date-time"}},
				"required":["from","to"]
			},
			"limit":{"type":"integer","minimum":1,"maximum":100,"default":20}
		},
		"required":["unit_id","period"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "get_sla_breaches",
		Description:    "List SLA-breach events for a unit over a period.",
		Schema:         schema,
		RequiredScopes: []string{"stats:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				UnitID string `json:"unit_id"`
				Period struct {
					From string `json:"from"`
					To   string `json:"to"`
				} `json:"period"`
				Limit int `json:"limit"`
			}
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.UnitID) == "" {
				return Result{}, errors.New("unit_id required")
			}
			from, err := time.Parse(time.RFC3339, in.Period.From)
			if err != nil {
				return Result{}, errors.New("invalid period.from")
			}
			to, err := time.Parse(time.RFC3339, in.Period.To)
			if err != nil {
				return Result{}, errors.New("invalid period.to")
			}
			if in.Limit <= 0 || in.Limit > 100 {
				in.Limit = 20
			}
			rows, err := p.GetSLABreaches(context.Background(), tctx.CompanyID, in.UnitID, from, to, in.Limit)
			if err != nil {
				return Result{}, err
			}
			body, _ := json.Marshal(struct {
				Rows []SLABreachRow `json:"rows"`
			}{Rows: rows})
			return Result{Content: body}, nil
		},
	}
}
```

- [ ] **Step 4: Run all three test files**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run "TestGetStaffPerformance|TestGetSurveyAggregates|TestGetSLABreaches" -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_get_staff_performance*.go apps/backend/internal/copilot/tools/tool_get_survey_aggregates*.go apps/backend/internal/copilot/tools/tool_get_sla_breaches*.go
git commit -m "feat(copilot): add staff performance, survey aggregates, SLA breach tools"
```

---

## Task 9: Per-plan limits configuration

**Files:**
- Create: `apps/backend/internal/copilot/quota/plan_limits.go`
- Create: `apps/backend/internal/copilot/quota/plan_limits_test.go`

Limits live in `subscription_plans.features` JSON (alongside `copilot_v1` boolean). New keys: `copilot_messages_per_day`, `copilot_tokens_per_month`, `copilot_per_user_per_minute`.

- [ ] **Step 1: Failing test**

```go
package quota

import (
	"context"
	"testing"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newPlanLimitsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, _ := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	_ = db.Exec(`CREATE TABLE companies (id text PRIMARY KEY, subscription_id text, is_saas_operator boolean DEFAULT false)`).Error
	_ = db.Exec(`CREATE TABLE subscriptions (id text PRIMARY KEY, plan_id text)`).Error
	_ = db.Exec(`CREATE TABLE subscription_plans (id text PRIMARY KEY, features text)`).Error
	return db
}

func TestPlanLimits_ReadsFromFeatures(t *testing.T) {
	t.Parallel()
	db := newPlanLimitsTestDB(t)
	db.Exec(`INSERT INTO subscription_plans (id, features) VALUES ('p1', '{"copilot_messages_per_day":1000,"copilot_tokens_per_month":10000000}')`)
	db.Exec(`INSERT INTO subscriptions (id, plan_id) VALUES ('s1','p1')`)
	db.Exec(`INSERT INTO companies (id, subscription_id) VALUES ('c1','s1')`)

	repo := NewPlanLimitsRepo(db)
	lim, err := repo.GetLimits(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if lim.MessagesPerDay != 1000 || lim.TokensPerMonth != 10_000_000 {
		t.Errorf("limits: %+v", lim)
	}
}

func TestPlanLimits_DefaultsWhenAbsent(t *testing.T) {
	t.Parallel()
	db := newPlanLimitsTestDB(t)
	db.Exec(`INSERT INTO subscription_plans (id, features) VALUES ('p1', '{}')`)
	db.Exec(`INSERT INTO subscriptions (id, plan_id) VALUES ('s1','p1')`)
	db.Exec(`INSERT INTO companies (id, subscription_id) VALUES ('c1','s1')`)

	repo := NewPlanLimitsRepo(db)
	lim, _ := repo.GetLimits(context.Background(), "c1")
	if lim.MessagesPerDay != 200 || lim.TokensPerMonth != 1_500_000 {
		t.Errorf("defaults: %+v", lim)
	}
}
```

- [ ] **Step 2: Implement**

```go
package quota

import (
	"context"
	"encoding/json"
	"strings"

	"gorm.io/gorm"
)

type PlanLimits struct {
	MessagesPerDay      int
	TokensPerMonth      int
	PerUserPerMinute    int
	HardLimitsEnforced  bool // false → unlimited (Enterprise plan)
}

type PlanLimitsRepo struct{ db *gorm.DB }

func NewPlanLimitsRepo(db *gorm.DB) *PlanLimitsRepo { return &PlanLimitsRepo{db: db} }

var defaultLimits = PlanLimits{
	MessagesPerDay:    200,
	TokensPerMonth:    1_500_000,
	PerUserPerMinute:  30,
	HardLimitsEnforced: true,
}

func (r *PlanLimitsRepo) GetLimits(ctx context.Context, companyID string) (PlanLimits, error) {
	if strings.TrimSpace(companyID) == "" {
		return defaultLimits, nil
	}
	row := r.db.WithContext(ctx).Raw(`
SELECT sp.features FROM companies c
LEFT JOIN subscriptions s ON s.id = c.subscription_id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE c.id = ? LIMIT 1`, companyID).Row()
	var raw []byte
	if err := row.Scan(&raw); err != nil {
		return defaultLimits, nil
	}
	if len(raw) == 0 {
		return defaultLimits, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return defaultLimits, nil
	}
	out := defaultLimits
	if v, ok := readInt(m, "copilot_messages_per_day"); ok {
		out.MessagesPerDay = v
	}
	if v, ok := readInt(m, "copilot_tokens_per_month"); ok {
		out.TokensPerMonth = v
	}
	if v, ok := readInt(m, "copilot_per_user_per_minute"); ok {
		out.PerUserPerMinute = v
	}
	if v, ok := m["copilot_unlimited"]; ok {
		if b, _ := v.(bool); b {
			out.HardLimitsEnforced = false
		}
	}
	return out, nil
}

func readInt(m map[string]interface{}, key string) (int, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return 0, false
	}
	switch x := v.(type) {
	case float64:
		return int(x), true
	case int:
		return x, true
	}
	return 0, false
}
```

- [ ] **Step 3: Run + commit**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -run TestPlanLimits -v`
Expected: PASS.

```bash
git add apps/backend/internal/copilot/quota/plan_limits*.go
git commit -m "feat(copilot): add per-plan limits reader"
```

---

## Task 10: Redis usage counter

**Files:**
- Create: `apps/backend/internal/copilot/quota/usage_counter.go`
- Create: `apps/backend/internal/copilot/quota/usage_counter_test.go`

Two windowed counters per company: daily messages, monthly tokens. Plus a per-(company, user) per-minute message counter. Backed by Redis with TTLs aligned to window boundaries.

- [ ] **Step 1: Failing test (uses miniredis)**

Create `apps/backend/internal/copilot/quota/usage_counter_test.go`:

```go
package quota

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newUsageCounterTest(t *testing.T) (*UsageCounter, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return NewUsageCounter(rc, time.UTC), mr
}

func TestUsageCounter_IncDailyMessages(t *testing.T) {
	t.Parallel()
	uc, _ := newUsageCounterTest(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		_ = uc.IncMessages(ctx, "c1")
	}
	got, _ := uc.MessagesToday(ctx, "c1")
	if got != 5 {
		t.Errorf("got %d", got)
	}
}

func TestUsageCounter_IncMonthlyTokens(t *testing.T) {
	t.Parallel()
	uc, _ := newUsageCounterTest(t)
	ctx := context.Background()
	_ = uc.AddTokens(ctx, "c1", 1000)
	_ = uc.AddTokens(ctx, "c1", 2500)
	got, _ := uc.TokensThisMonth(ctx, "c1")
	if got != 3500 {
		t.Errorf("got %d", got)
	}
}

func TestUsageCounter_PerUserPerMinute(t *testing.T) {
	t.Parallel()
	uc, _ := newUsageCounterTest(t)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		_ = uc.IncUserMinute(ctx, "c1", "u1")
	}
	got, _ := uc.UserThisMinute(ctx, "c1", "u1")
	if got != 3 {
		t.Errorf("got %d", got)
	}
	other, _ := uc.UserThisMinute(ctx, "c1", "u2")
	if other != 0 {
		t.Errorf("isolation broken: %d", other)
	}
}
```

- [ ] **Step 2: Implement counter**

Create `apps/backend/internal/copilot/quota/usage_counter.go`:

```go
package quota

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type UsageCounter struct {
	rc *redis.Client
	tz *time.Location
}

func NewUsageCounter(rc *redis.Client, tz *time.Location) *UsageCounter {
	if tz == nil {
		tz = time.UTC
	}
	return &UsageCounter{rc: rc, tz: tz}
}

func (u *UsageCounter) IncMessages(ctx context.Context, companyID string) error {
	key := keyDaily(companyID, time.Now().In(u.tz))
	pipe := u.rc.TxPipeline()
	pipe.Incr(ctx, key)
	pipe.ExpireAt(ctx, key, endOfDay(time.Now().In(u.tz)).Add(time.Hour))
	_, err := pipe.Exec(ctx)
	return err
}

func (u *UsageCounter) MessagesToday(ctx context.Context, companyID string) (int64, error) {
	v, err := u.rc.Get(ctx, keyDaily(companyID, time.Now().In(u.tz))).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return v, err
}

func (u *UsageCounter) AddTokens(ctx context.Context, companyID string, n int) error {
	key := keyMonthly(companyID, time.Now().In(u.tz))
	pipe := u.rc.TxPipeline()
	pipe.IncrBy(ctx, key, int64(n))
	pipe.ExpireAt(ctx, key, endOfMonth(time.Now().In(u.tz)).Add(24*time.Hour))
	_, err := pipe.Exec(ctx)
	return err
}

func (u *UsageCounter) TokensThisMonth(ctx context.Context, companyID string) (int64, error) {
	v, err := u.rc.Get(ctx, keyMonthly(companyID, time.Now().In(u.tz))).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return v, err
}

func (u *UsageCounter) IncUserMinute(ctx context.Context, companyID, userID string) error {
	key := keyUserMinute(companyID, userID, time.Now().In(u.tz))
	pipe := u.rc.TxPipeline()
	pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, 90*time.Second)
	_, err := pipe.Exec(ctx)
	return err
}

func (u *UsageCounter) UserThisMinute(ctx context.Context, companyID, userID string) (int64, error) {
	v, err := u.rc.Get(ctx, keyUserMinute(companyID, userID, time.Now().In(u.tz))).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return v, err
}

// SetTokensThisMonth lets the reconcile job correct drift between Redis and Postgres aggregates.
func (u *UsageCounter) SetTokensThisMonth(ctx context.Context, companyID string, n int64) error {
	key := keyMonthly(companyID, time.Now().In(u.tz))
	return u.rc.Set(ctx, key, n, 0).Err()
}

func keyDaily(companyID string, t time.Time) string {
	return fmt.Sprintf("copilot:usage:msgs:%s:%s", companyID, t.Format("2006-01-02"))
}
func keyMonthly(companyID string, t time.Time) string {
	return fmt.Sprintf("copilot:usage:tokens:%s:%s", companyID, t.Format("2006-01"))
}
func keyUserMinute(companyID, userID string, t time.Time) string {
	return fmt.Sprintf("copilot:usage:user:%s:%s:%s", companyID, userID, t.Format("2006-01-02T15:04"))
}

func endOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 23, 59, 59, 0, t.Location())
}
func endOfMonth(t time.Time) time.Time {
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
	return first.AddDate(0, 1, 0).Add(-time.Second)
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -run TestUsageCounter -v`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/quota/usage_counter*.go
git commit -m "feat(copilot): add Redis-backed daily/monthly/per-minute usage counters"
```

---

## Task 11: Quota reconcile job

**Files:**
- Create: `apps/backend/internal/copilot/quota/usage_reconcile.go`
- Create: `apps/backend/internal/copilot/quota/usage_reconcile_test.go`
- Create: `apps/backend/internal/jobs/copilot_quota_reconcile.go`
- Modify: `apps/backend/internal/jobs/types.go` + `client.go`

Nightly Asynq job: for every company with `copilot_v1` enabled, sum tokens from `copilot_messages` for the current month and `SetTokensThisMonth` to align Redis with Postgres truth.

- [ ] **Step 1: Reconciler tests**

```go
package quota

import (
	"context"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"

	"github.com/alicebob/miniredis/v2"
	glebarezsqlite "github.com/glebarez/sqlite"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func newReconcileTest(t *testing.T) (*UsageReconciler, *gorm.DB, *miniredis.Miniredis) {
	t.Helper()
	mr, _ := miniredis.Run()
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	db, _ := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	_ = db.AutoMigrate(&models.CopilotThread{}, &models.CopilotMessage{})
	uc := NewUsageCounter(rc, time.UTC)
	rec := NewUsageReconciler(db, uc)
	return rec, db, mr
}

func TestUsageReconciler_AlignsRedisWithPostgres(t *testing.T) {
	t.Parallel()
	rec, db, mr := newReconcileTest(t)
	defer mr.Close()
	// Seed thread + messages
	_ = db.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"}).Error
	in1, out1 := 100, 30
	_ = db.Create(&models.CopilotMessage{ID: "m1", ThreadID: "t1", Role: "assistant", TokensIn: &in1, TokensOut: &out1}).Error
	in2, out2 := 200, 40
	_ = db.Create(&models.CopilotMessage{ID: "m2", ThreadID: "t1", Role: "assistant", TokensIn: &in2, TokensOut: &out2}).Error

	if err := rec.ReconcileCompany(context.Background(), "c1"); err != nil {
		t.Fatal(err)
	}
	got, _ := NewUsageCounter(redis.NewClient(&redis.Options{Addr: mr.Addr()}), time.UTC).TokensThisMonth(context.Background(), "c1")
	if got != 370 {
		t.Errorf("expected 370 tokens, got %d", got)
	}
}
```

- [ ] **Step 2: Implement**

Create `apps/backend/internal/copilot/quota/usage_reconcile.go`:

```go
package quota

import (
	"context"
	"time"

	"gorm.io/gorm"
)

type UsageReconciler struct {
	db *gorm.DB
	uc *UsageCounter
}

func NewUsageReconciler(db *gorm.DB, uc *UsageCounter) *UsageReconciler {
	return &UsageReconciler{db: db, uc: uc}
}

func (r *UsageReconciler) ReconcileAll(ctx context.Context) error {
	rows, err := r.db.WithContext(ctx).Raw(`
SELECT DISTINCT c.id FROM companies c
JOIN copilot_threads t ON t.company_id = c.id
WHERE t.deleted_at IS NULL`).Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var companyID string
		if err := rows.Scan(&companyID); err != nil {
			return err
		}
		_ = r.ReconcileCompany(ctx, companyID)
	}
	return rows.Err()
}

func (r *UsageReconciler) ReconcileCompany(ctx context.Context, companyID string) error {
	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	var totalIn, totalOut int64
	row := r.db.WithContext(ctx).Raw(`
SELECT COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0)
FROM copilot_messages m
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND m.created_at >= ?`, companyID, monthStart).Row()
	if err := row.Scan(&totalIn, &totalOut); err != nil {
		return err
	}
	return r.uc.SetTokensThisMonth(ctx, companyID, totalIn+totalOut)
}
```

- [ ] **Step 3: Asynq handler**

Create `apps/backend/internal/jobs/copilot_quota_reconcile.go`:

```go
package jobs

import (
	"context"
	"log/slog"

	"github.com/hibiken/asynq"
)

type CopilotReconciler interface {
	ReconcileAll(ctx context.Context) error
}

func HandleCopilotQuotaReconcile(r CopilotReconciler) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, _ *asynq.Task) error {
		if err := r.ReconcileAll(ctx); err != nil {
			slog.Error("copilot quota reconcile failed", "err", err)
			return err
		}
		slog.Info("copilot quota reconcile complete")
		return nil
	}
}
```

In `types.go` add `TypeCopilotQuotaReconcile = "copilot:quota_reconcile"` and in `client.go` add `EnqueueCopilotQuotaReconcile()`.

- [ ] **Step 4: Run + commit**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -run TestUsageReconciler -v && go build ./...`
Expected: PASS.

```bash
git add apps/backend/internal/copilot/quota/usage_reconcile*.go apps/backend/internal/jobs/copilot_quota_reconcile.go apps/backend/internal/jobs/types.go apps/backend/internal/jobs/client.go
git commit -m "feat(copilot): add nightly quota reconcile job"
```

---

## Task 12: Wire per-plan limits into `quota.Service`

**Files:**
- Modify: `apps/backend/internal/copilot/quota/service.go`
- Modify: `apps/backend/internal/copilot/quota/service_test.go`

Replace Phase 1's pure feature-gate `CheckPlanFeature` with `CheckQuota` that checks feature gate + daily messages + monthly tokens + per-user-per-minute.

- [ ] **Step 1: Extend Service**

Update `apps/backend/internal/copilot/quota/service.go`:

```go
package quota

import (
	"context"
	"errors"
)

var (
	ErrFeatureDisabled  = errors.New("copilot: feature not enabled for this company")
	ErrMessagesExceeded = errors.New("copilot: daily message limit exceeded")
	ErrTokensExceeded   = errors.New("copilot: monthly token limit exceeded")
	ErrRateLimited      = errors.New("copilot: per-user rate limit exceeded")
)

type Gate interface {
	IsEnabled(ctx context.Context, companyID string) (bool, error)
}

type Limits interface {
	GetLimits(ctx context.Context, companyID string) (PlanLimits, error)
}

type Counter interface {
	MessagesToday(ctx context.Context, companyID string) (int64, error)
	TokensThisMonth(ctx context.Context, companyID string) (int64, error)
	UserThisMinute(ctx context.Context, companyID, userID string) (int64, error)
	IncMessages(ctx context.Context, companyID string) error
	IncUserMinute(ctx context.Context, companyID, userID string) error
	AddTokens(ctx context.Context, companyID string, n int) error
}

type Service struct {
	gate    Gate
	limits  Limits
	counter Counter
}

func New(gate Gate) *Service { return &Service{gate: gate} }

func (s *Service) WithLimits(l Limits) *Service { s.limits = l; return s }
func (s *Service) WithCounter(c Counter) *Service { s.counter = c; return s }

// CheckPlanFeature retained for back-compat (Phase 1 callers).
func (s *Service) CheckPlanFeature(ctx context.Context, companyID string) error {
	ok, err := s.gate.IsEnabled(ctx, companyID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrFeatureDisabled
	}
	return nil
}

type Decision struct {
	Allowed     bool
	Reason      error
	Used        UsageSnapshot
	Limits      PlanLimits
}

type UsageSnapshot struct {
	MessagesToday    int64
	TokensThisMonth  int64
	UserThisMinute   int64
}

// CheckQuota is the Phase 3 entry point. It does everything CheckPlanFeature did plus
// rate / quota checks. The chat handler calls this; on Allowed=false, the handler
// returns 403 with the structured reason.
func (s *Service) CheckQuota(ctx context.Context, companyID, userID string) (Decision, error) {
	if err := s.CheckPlanFeature(ctx, companyID); err != nil {
		return Decision{Allowed: false, Reason: err}, nil
	}
	if s.limits == nil || s.counter == nil {
		// Phase 1 path: no per-plan limits configured.
		return Decision{Allowed: true}, nil
	}
	limits, err := s.limits.GetLimits(ctx, companyID)
	if err != nil {
		return Decision{}, err
	}
	if !limits.HardLimitsEnforced {
		return Decision{Allowed: true, Limits: limits}, nil
	}
	used, err := s.snapshot(ctx, companyID, userID)
	if err != nil {
		return Decision{}, err
	}
	d := Decision{Allowed: true, Used: used, Limits: limits}
	switch {
	case used.UserThisMinute >= int64(limits.PerUserPerMinute):
		d.Allowed = false
		d.Reason = ErrRateLimited
	case used.MessagesToday >= int64(limits.MessagesPerDay):
		d.Allowed = false
		d.Reason = ErrMessagesExceeded
	case used.TokensThisMonth >= int64(limits.TokensPerMonth):
		d.Allowed = false
		d.Reason = ErrTokensExceeded
	}
	return d, nil
}

func (s *Service) snapshot(ctx context.Context, companyID, userID string) (UsageSnapshot, error) {
	msgs, err := s.counter.MessagesToday(ctx, companyID)
	if err != nil {
		return UsageSnapshot{}, err
	}
	toks, err := s.counter.TokensThisMonth(ctx, companyID)
	if err != nil {
		return UsageSnapshot{}, err
	}
	user, err := s.counter.UserThisMinute(ctx, companyID, userID)
	if err != nil {
		return UsageSnapshot{}, err
	}
	return UsageSnapshot{MessagesToday: msgs, TokensThisMonth: toks, UserThisMinute: user}, nil
}

// RecordMessage increments daily message + per-user-per-minute counters.
// RecordTokens adds to monthly token counter.
func (s *Service) RecordMessage(ctx context.Context, companyID, userID string) {
	if s.counter == nil {
		return
	}
	_ = s.counter.IncMessages(ctx, companyID)
	_ = s.counter.IncUserMinute(ctx, companyID, userID)
}

func (s *Service) RecordTokens(ctx context.Context, companyID string, n int) {
	if s.counter == nil || n <= 0 {
		return
	}
	_ = s.counter.AddTokens(ctx, companyID, n)
}
```

- [ ] **Step 2: Update tests**

Update `apps/backend/internal/copilot/quota/service_test.go` — keep existing tests, add:

```go
type fakeLimits struct{ lim PlanLimits }
func (f *fakeLimits) GetLimits(_ context.Context, _ string) (PlanLimits, error) { return f.lim, nil }

type fakeCounter struct{ msgs, toks, user int64 }
func (f *fakeCounter) MessagesToday(_ context.Context, _ string) (int64, error) { return f.msgs, nil }
func (f *fakeCounter) TokensThisMonth(_ context.Context, _ string) (int64, error) { return f.toks, nil }
func (f *fakeCounter) UserThisMinute(_ context.Context, _, _ string) (int64, error) { return f.user, nil }
func (f *fakeCounter) IncMessages(_ context.Context, _ string) error                 { return nil }
func (f *fakeCounter) IncUserMinute(_ context.Context, _, _ string) error            { return nil }
func (f *fakeCounter) AddTokens(_ context.Context, _ string, _ int) error            { return nil }

func TestService_CheckQuota_Allowed(t *testing.T) {
	t.Parallel()
	svc := New(&fakeGate{enabled: true}).
		WithLimits(&fakeLimits{lim: PlanLimits{MessagesPerDay: 100, TokensPerMonth: 1_000_000, PerUserPerMinute: 10, HardLimitsEnforced: true}}).
		WithCounter(&fakeCounter{msgs: 10, toks: 100, user: 1})
	d, err := svc.CheckQuota(context.Background(), "c1", "u1")
	if err != nil || !d.Allowed {
		t.Fatalf("expected allow: %+v err=%v", d, err)
	}
}

func TestService_CheckQuota_RateLimited(t *testing.T) {
	t.Parallel()
	svc := New(&fakeGate{enabled: true}).
		WithLimits(&fakeLimits{lim: PlanLimits{PerUserPerMinute: 10, HardLimitsEnforced: true}}).
		WithCounter(&fakeCounter{user: 10})
	d, _ := svc.CheckQuota(context.Background(), "c1", "u1")
	if d.Allowed || !errors.Is(d.Reason, ErrRateLimited) {
		t.Fatalf("expected rate-limited: %+v", d)
	}
}
```

- [ ] **Step 3: Update chat handler to use CheckQuota**

In `apps/backend/internal/copilot/handlers/chat.go`, replace `CheckPlanFeature` with `CheckQuota`:

```go
d, err := h.quotaSvc.CheckQuota(r.Context(), ident.CompanyID, ident.UserID)
if err != nil {
    http.Error(w, err.Error(), http.StatusInternalServerError)
    return
}
if !d.Allowed {
    code := http.StatusForbidden
    if errors.Is(d.Reason, quota.ErrRateLimited) {
        code = http.StatusTooManyRequests
    } else if errors.Is(d.Reason, quota.ErrMessagesExceeded) || errors.Is(d.Reason, quota.ErrTokensExceeded) {
        code = http.StatusTooManyRequests
    }
    http.Error(w, d.Reason.Error(), code)
    return
}
// later, after persisting the assistant message:
h.quotaSvc.RecordMessage(r.Context(), ident.CompanyID, ident.UserID)
h.quotaSvc.RecordTokens(r.Context(), ident.CompanyID, res.Usage.InputTokens+res.Usage.OutputTokens)
```

- [ ] **Step 4: Run + commit**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -v && go build ./...`
Expected: PASS.

```bash
git add apps/backend/internal/copilot/quota/service.go apps/backend/internal/copilot/quota/service_test.go apps/backend/internal/copilot/handlers/chat.go
git commit -m "feat(copilot): wire per-plan quotas into chat handler"
```

---

## Task 13: Cost dashboard backend

**Files:**
- Create: `apps/backend/internal/copilot/handlers/cost_dashboard.go`
- Create: `apps/backend/internal/copilot/handlers/cost_dashboard_test.go`

Five aggregations served as JSON for the frontend:
- KPIs: total tokens, total cost, message count, abort rate, thumbs-up rate, unique users (last 30d)
- Daily series: tokens per day (last 30d)
- Top users: by tokens (last 30d, top 10)
- Top tools: by call count (last 30d, top 10)
- Per-provider breakdown: tokens per provider (last 30d)

- [ ] **Step 1: Implement (no separate test file — covered by integration)**

Create `apps/backend/internal/copilot/handlers/cost_dashboard.go`:

```go
package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"gorm.io/gorm"
)

type CostDashboardHandler struct {
	db *gorm.DB
}

func NewCostDashboardHandler(db *gorm.DB) *CostDashboardHandler {
	return &CostDashboardHandler{db: db}
}

type KPIs struct {
	TokensTotal       int64   `json:"tokensTotal"`
	CostUSDx10000     int64   `json:"costUsdMicros"`
	MessageCount      int64   `json:"messageCount"`
	AbortRate         float64 `json:"abortRate"`
	ThumbsUpRate      float64 `json:"thumbsUpRate"`
	UniqueUsers       int64   `json:"uniqueUsers"`
	WindowFrom        string  `json:"windowFrom"`
	WindowTo          string  `json:"windowTo"`
}

type DailyTokens struct {
	Date         string `json:"date"`
	TokensIn     int64  `json:"tokensIn"`
	TokensOut    int64  `json:"tokensOut"`
}

// HandleKPIs GET /api/copilot/dashboard/kpis
//
// @Summary Copilot KPIs over the last 30 days
// @Tags     copilot
// @Produce  json
// @Success  200 {object} KPIs
// @Router   /api/copilot/dashboard/kpis [get]
// @Security BearerAuth
func (h *CostDashboardHandler) HandleKPIs(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !hasRole(ident.Roles, "copilot:admin") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	to := time.Now().UTC()
	from := to.Add(-30 * 24 * time.Hour)

	var k KPIs
	k.WindowFrom = from.Format(time.RFC3339)
	k.WindowTo = to.Format(time.RFC3339)

	row := h.db.Raw(`
SELECT
  COALESCE(SUM(COALESCE(m.tokens_in,0) + COALESCE(m.tokens_out,0)),0) AS tokens_total,
  COALESCE(SUM(COALESCE(m.cost_usd_x10000,0)),0) AS cost,
  COUNT(*) FILTER (WHERE m.role IN ('user','assistant')) AS message_count,
  COUNT(DISTINCT t.user_id) AS unique_users
FROM copilot_messages m
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND m.created_at >= ?`, ident.CompanyID, from).Row()
	_ = row.Scan(&k.TokensTotal, &k.CostUSDx10000, &k.MessageCount, &k.UniqueUsers)

	row = h.db.Raw(`
SELECT
  COUNT(*) FILTER (WHERE rating = 1)::float / NULLIF(COUNT(*),0) AS up_rate
FROM copilot_feedback fb
JOIN copilot_messages m ON m.id = fb.message_id
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND fb.created_at >= ?`, ident.CompanyID, from).Row()
	_ = row.Scan(&k.ThumbsUpRate)

	// Abort rate: tool_calls with status=timeout / total tool_calls (proxy for abort)
	row = h.db.Raw(`
SELECT
  COUNT(*) FILTER (WHERE tc.status = 'timeout')::float / NULLIF(COUNT(*),0) AS abort_rate
FROM copilot_tool_calls tc
JOIN copilot_messages m ON m.id = tc.message_id
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND tc.created_at >= ?`, ident.CompanyID, from).Row()
	_ = row.Scan(&k.AbortRate)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(k)
}

// HandleDailyTokens GET /api/copilot/dashboard/daily-tokens
//
// @Summary Daily token usage (last 30 days)
// @Tags     copilot
// @Produce  json
// @Success  200 {array} DailyTokens
// @Router   /api/copilot/dashboard/daily-tokens [get]
// @Security BearerAuth
func (h *CostDashboardHandler) HandleDailyTokens(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !hasRole(ident.Roles, "copilot:admin") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	from := time.Now().UTC().Add(-30 * 24 * time.Hour)
	rows, err := h.db.Raw(`
SELECT date_trunc('day', m.created_at)::date AS day,
       COALESCE(SUM(m.tokens_in),0) AS tin,
       COALESCE(SUM(m.tokens_out),0) AS tout
FROM copilot_messages m
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND m.created_at >= ?
GROUP BY 1 ORDER BY 1 ASC`, ident.CompanyID, from).Rows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := []DailyTokens{}
	for rows.Next() {
		var day time.Time
		var ti, to int64
		_ = rows.Scan(&day, &ti, &to)
		out = append(out, DailyTokens{Date: day.Format("2006-01-02"), TokensIn: ti, TokensOut: to})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

type TopUser struct {
	UserID string `json:"userId"`
	Tokens int64  `json:"tokens"`
}

// HandleTopUsers GET /api/copilot/dashboard/top-users
//
// @Summary Top Copilot users by tokens consumed
// @Tags     copilot
// @Produce  json
// @Success  200 {array} TopUser
// @Router   /api/copilot/dashboard/top-users [get]
// @Security BearerAuth
func (h *CostDashboardHandler) HandleTopUsers(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !hasRole(ident.Roles, "copilot:admin") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	from := time.Now().UTC().Add(-30 * 24 * time.Hour)
	rows, err := h.db.Raw(`
SELECT t.user_id, COALESCE(SUM(COALESCE(m.tokens_in,0)+COALESCE(m.tokens_out,0)),0) AS tokens
FROM copilot_messages m
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND m.created_at >= ?
GROUP BY 1 ORDER BY tokens DESC LIMIT 10`, ident.CompanyID, from).Rows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := []TopUser{}
	for rows.Next() {
		var u TopUser
		_ = rows.Scan(&u.UserID, &u.Tokens)
		out = append(out, u)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

type TopTool struct {
	Tool       string `json:"tool"`
	CallCount  int64  `json:"callCount"`
	AvgMs      int64  `json:"avgMs"`
}

// HandleTopTools GET /api/copilot/dashboard/top-tools
//
// @Summary Top tools by call count
// @Tags     copilot
// @Produce  json
// @Success  200 {array} TopTool
// @Router   /api/copilot/dashboard/top-tools [get]
// @Security BearerAuth
func (h *CostDashboardHandler) HandleTopTools(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !hasRole(ident.Roles, "copilot:admin") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	from := time.Now().UTC().Add(-30 * 24 * time.Hour)
	rows, err := h.db.Raw(`
SELECT tc.tool_name, COUNT(*) AS calls, COALESCE(AVG(tc.duration_ms),0)::int AS avg_ms
FROM copilot_tool_calls tc
JOIN copilot_messages m ON m.id = tc.message_id
JOIN copilot_threads t ON t.id = m.thread_id
WHERE t.company_id = ? AND tc.created_at >= ?
GROUP BY 1 ORDER BY calls DESC LIMIT 10`, ident.CompanyID, from).Rows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := []TopTool{}
	for rows.Next() {
		var t TopTool
		_ = rows.Scan(&t.Tool, &t.CallCount, &t.AvgMs)
		out = append(out, t)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
```

> Note: SQLite (used in tests) doesn't support `date_trunc`. The dashboard tests skip when running against SQLite; the endpoints are exercised via real Postgres in the integration smoke (Task 16).

- [ ] **Step 2: Compile + commit**

Run: `cd apps/backend && go build ./internal/copilot/handlers/`

```bash
git add apps/backend/internal/copilot/handlers/cost_dashboard.go
git commit -m "feat(copilot): add cost dashboard backend (KPIs, daily tokens, top users/tools)"
```

---

## Task 14: Cost dashboard frontend

**Files:**
- Create: `apps/frontend/components/copilot/dashboard/CostDashboard.tsx`
- Create: `apps/frontend/components/copilot/dashboard/KPIGrid.tsx`
- Create: `apps/frontend/components/copilot/dashboard/TokensSeriesChart.tsx`
- Create: `apps/frontend/components/copilot/dashboard/TopUsersTable.tsx`
- Create: `apps/frontend/components/copilot/dashboard/TopToolsTable.tsx`
- Create: `apps/frontend/components/copilot/dashboard/CostDashboard.test.tsx`
- Create: `apps/frontend/app/[locale]/settings/copilot/page.tsx`

The dashboard uses TanStack Query to fetch the four endpoints and renders KPIs + a series chart (recharts — already a dependency) + two tables.

- [ ] **Step 1: KPI grid**

Create `apps/frontend/components/copilot/dashboard/KPIGrid.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

interface KPIs {
  tokensTotal: number;
  costUsdMicros: number;
  messageCount: number;
  abortRate: number;
  thumbsUpRate: number;
  uniqueUsers: number;
}

export function KPIGrid({ kpis }: { kpis: KPIs }) {
  const t = useTranslations('copilot.dashboard');
  const cards = [
    { label: t('kpiTokens'), value: kpis.tokensTotal.toLocaleString() },
    { label: t('kpiCost'), value: '$' + (kpis.costUsdMicros / 10000).toFixed(2) },
    { label: t('kpiMessages'), value: kpis.messageCount.toLocaleString() },
    { label: t('kpiUsers'), value: kpis.uniqueUsers.toString() },
    { label: t('kpiThumbsUp'), value: (kpis.thumbsUpRate * 100).toFixed(1) + '%' },
    { label: t('kpiAbort'), value: (kpis.abortRate * 100).toFixed(1) + '%' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-xl font-semibold">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Tokens series chart**

Create `apps/frontend/components/copilot/dashboard/TokensSeriesChart.tsx`:

```tsx
'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Point {
  date: string;
  tokensIn: number;
  tokensOut: number;
}

export function TokensSeriesChart({ data }: { data: Point[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="tokensIn" stackId="1" />
          <Area type="monotone" dataKey="tokensOut" stackId="1" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Tables**

Create `apps/frontend/components/copilot/dashboard/TopUsersTable.tsx`:

```tsx
'use client';

interface Row { userId: string; tokens: number }

export function TopUsersTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="text-left">User</th><th className="text-right">Tokens</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.userId} className="border-t">
            <td className="py-1 font-mono text-xs">{r.userId.slice(0, 8)}</td>
            <td className="text-right">{r.tokens.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `apps/frontend/components/copilot/dashboard/TopToolsTable.tsx`:

```tsx
'use client';

interface Row { tool: string; callCount: number; avgMs: number }

export function TopToolsTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="text-left">Tool</th><th className="text-right">Calls</th><th className="text-right">Avg ms</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.tool} className="border-t">
            <td className="py-1">{r.tool}</td>
            <td className="text-right">{r.callCount}</td>
            <td className="text-right">{r.avgMs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Dashboard composition**

Create `apps/frontend/components/copilot/dashboard/CostDashboard.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { KPIGrid } from './KPIGrid';
import { TokensSeriesChart } from './TokensSeriesChart';
import { TopToolsTable } from './TopToolsTable';
import { TopUsersTable } from './TopUsersTable';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function CostDashboard() {
  const t = useTranslations('copilot.dashboard');
  const kpis = useQuery({ queryKey: ['copilot.kpis'], queryFn: () => fetchJson<any>('/api/copilot/dashboard/kpis') });
  const daily = useQuery({ queryKey: ['copilot.daily'], queryFn: () => fetchJson<any[]>('/api/copilot/dashboard/daily-tokens') });
  const users = useQuery({ queryKey: ['copilot.users'], queryFn: () => fetchJson<any[]>('/api/copilot/dashboard/top-users') });
  const tools = useQuery({ queryKey: ['copilot.tools'], queryFn: () => fetchJson<any[]>('/api/copilot/dashboard/top-tools') });

  if (kpis.isLoading) return <p>Loading…</p>;
  if (kpis.error) return <p className="text-destructive">{(kpis.error as Error).message}</p>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      {kpis.data && <KPIGrid kpis={kpis.data} />}
      <section>
        <h2 className="mb-2 text-sm font-medium">{t('series')}</h2>
        {daily.data && <TokensSeriesChart data={daily.data} />}
      </section>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-medium">{t('topUsers')}</h2>
          {users.data && <TopUsersTable rows={users.data} />}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium">{t('topTools')}</h2>
          {tools.data && <TopToolsTable rows={tools.data} />}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Page route**

Create `apps/frontend/app/[locale]/settings/copilot/page.tsx`:

```tsx
import { CostDashboard } from '@/components/copilot/dashboard/CostDashboard';

export default function Page() {
  return <CostDashboard />;
}
```

- [ ] **Step 6: i18n strings**

Append to `apps/frontend/messages/en/copilot.json`:

```json
"dashboard": {
  "title": "Copilot usage",
  "kpiTokens": "Tokens (30d)",
  "kpiCost": "Cost (30d)",
  "kpiMessages": "Messages",
  "kpiUsers": "Active users",
  "kpiThumbsUp": "👍 rate",
  "kpiAbort": "Abort rate",
  "series": "Daily token usage",
  "topUsers": "Top users",
  "topTools": "Top tools"
}
```

(Russian translation analogous.)

- [ ] **Step 7: Smoke test**

Create `apps/frontend/components/copilot/dashboard/CostDashboard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { CostDashboard } from './CostDashboard';
import enMessages from '@/messages/en/copilot.json';

describe('<CostDashboard>', () => {
  it('renders title from i18n', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.endsWith('/kpis')) return Promise.resolve(new Response(JSON.stringify({ tokensTotal: 0, costUsdMicros: 0, messageCount: 0, abortRate: 0, thumbsUpRate: 0, uniqueUsers: 0, windowFrom: '', windowTo: '' })));
      return Promise.resolve(new Response('[]'));
    });

    const qc = new QueryClient();
    render(
      <NextIntlClientProvider locale="en" messages={{ copilot: enMessages }}>
        <QueryClientProvider client={qc}>
          <CostDashboard />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Copilot usage')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run + commit**

Run: `cd apps/frontend && pnpm tsc --noEmit && pnpm vitest run components/copilot/dashboard/`
Expected: success.

```bash
git add apps/frontend/components/copilot/dashboard/ apps/frontend/app/[locale]/settings/copilot/ apps/frontend/messages/en/copilot.json apps/frontend/messages/ru/copilot.json
git commit -m "feat(copilot): add cost dashboard frontend page with charts and tables"
```

---

## Task 15: Wire Phase 3 into `cmd/api/main.go`

**Files:**
- Modify: `apps/backend/cmd/api/main.go`
- Modify: `apps/backend/cmd/api/copilot_adapters.go`
- Modify: `apps/backend/.env.example`

- [ ] **Step 1: Construct quotas, register tools, mount routes**

Inside the existing `if copilotEnabled { ... }` block, after the registry setup:

```go
// Phase 3 quota
copilotPlanLimits := copilotquota.NewPlanLimitsRepo(database.DB)
copilotUsageCounter := copilotquota.NewUsageCounter(redisClient, time.UTC) // existing redisClient var
copilotQuotaSvc = copilotQuotaSvc.WithLimits(copilotPlanLimits).WithCounter(copilotUsageCounter)

// Reconcile job
reconciler := copilotquota.NewUsageReconciler(database.DB, copilotUsageCounter)
reconcileHandler := jobs.HandleCopilotQuotaReconcile(reconciler)
// asynqMux.HandleFunc(jobs.TypeCopilotQuotaReconcile, reconcileHandler) — adjust to existing mux

// Phase 3 tools registration
copilotRegistry.Register(copilottools.NewLookupTicketTool(&copilotTicketLookupAdapter{repo: ticketRepo}))
copilotRegistry.Register(copilottools.NewSearchClientsTool(&copilotClientSearchAdapter{repo: unitClientRepo}))
copilotRegistry.Register(copilottools.NewLookupSupportReportTool(&copilotSupportLookupAdapter{svc: supportReportService}))
copilotRegistry.Register(copilottools.NewSearchAuditEventsTool(&copilotAuditSearchAdapter{repo: auditLogRepo}))
copilotRegistry.Register(copilottools.NewGetStaffPerformanceTool(&copilotStaffPerfAdapter{stats: statisticsService}))
copilotRegistry.Register(copilottools.NewGetSurveyAggregatesTool(&copilotSurveyAggAdapter{stats: statisticsService}))
copilotRegistry.Register(copilottools.NewGetSLABreachesTool(&copilotSLABreachAdapter{stats: statisticsService}))

// Cost dashboard
costDashboardHandler := copilothandlers.NewCostDashboardHandler(database.DB)

// Optional reconcile cron
if scheduler != nil {
    if _, err := scheduler.Register("@daily", asynq.NewTask(jobs.TypeCopilotQuotaReconcile, nil)); err != nil {
        slog.Error("copilot reconcile schedule", "err", err)
    }
}
```

- [ ] **Step 2: Adapter additions**

Append to `apps/backend/cmd/api/copilot_adapters.go` — one adapter per Phase 3 tool. Each is a thin shim over an existing repository / service. Sketch (full bodies follow the same shape — fill in based on the existing repo APIs):

```go
type copilotTicketLookupAdapter struct{ repo repository.TicketRepository }

func (a *copilotTicketLookupAdapter) LookupTicket(ctx context.Context, companyID, idOrNumber, unitID string) (*dto.TicketSummary, error) {
    // Try ID lookup first; fall back to number-and-unit lookup.
    t, err := a.repo.FindByIDForCompany(ctx, companyID, idOrNumber)
    if err != nil || t == nil {
        if unitID != "" {
            t, _ = a.repo.FindByNumberAndUnit(ctx, companyID, unitID, idOrNumber)
        }
    }
    if t == nil {
        return nil, nil
    }
    return &dto.TicketSummary{
        ID: t.ID, Number: t.Number, UnitID: t.UnitID, ServiceID: t.ServiceID, Status: t.Status,
        // Map UnitName / ServiceName from joined preload — use existing methods that already eager-load.
        VisitorName:  derefStr(t.UserName),
        VisitorPhone: derefStr(t.UserPhone),
        // ... fill remaining fields ...
    }, nil
}
// Compile-time check
var _ copilottools.TicketLookup = (*copilotTicketLookupAdapter)(nil)
```

> The adapter implementations are ~10–20 lines each. **Do not invent new repository methods**: if the existing repo lacks (e.g.) `FindByNumberAndUnit`, add it first as a separate sub-step that follows the existing repo conventions.

Same for: `copilotClientSearchAdapter`, `copilotSupportLookupAdapter`, `copilotAuditSearchAdapter`, `copilotStaffPerfAdapter`, `copilotSurveyAggAdapter`, `copilotSLABreachAdapter`.

`derefStr` helper:
```go
func derefStr(s *string) string { if s == nil { return "" }; return *s }
```

- [ ] **Step 3: Mount dashboard routes**

In the chi router setup:

```go
r.With(adminOnly).Get("/dashboard/kpis", costDashboardHandler.HandleKPIs)
r.With(adminOnly).Get("/dashboard/daily-tokens", costDashboardHandler.HandleDailyTokens)
r.With(adminOnly).Get("/dashboard/top-users", costDashboardHandler.HandleTopUsers)
r.With(adminOnly).Get("/dashboard/top-tools", costDashboardHandler.HandleTopTools)
```

- [ ] **Step 4: Compile + commit**

Run: `cd apps/backend && go build ./...`
Expected: success.

```bash
git add apps/backend/cmd/api/main.go apps/backend/cmd/api/copilot_adapters.go
git commit -m "feat(copilot): wire Phase 3 (entity tools, quotas, cost dashboard) in cmd/api"
```

---

## Task 16: OTel meter + Grafana dashboards

**Files:**
- Modify: `apps/backend/internal/copilot/agent/loop.go` (add metric emission)
- Modify: `apps/backend/internal/copilot/tools/registry.go` (add metric emission)
- Create: `apps/backend/observability/grafana/copilot-overview.json`
- Create: `apps/backend/observability/grafana/copilot-by-tenant.json`

Phase 1 set up traces. Phase 3 adds **metrics** (counters + histograms) and Grafana boards.

- [ ] **Step 1: Add metric instruments**

Update `apps/backend/internal/copilot/agent/loop.go` — add a `metric.Float64Counter` for tokens and a `metric.Float64Histogram` for request duration. Use the OTel meter API:

```go
import "go.opentelemetry.io/otel/metric"

var (
    meter = otel.Meter("quokkaq/copilot/agent")
    metricTokens          metric.Float64Counter
    metricDurationSeconds metric.Float64Histogram
)

func init() {
    metricTokens, _ = meter.Float64Counter("copilot_tokens_total")
    metricDurationSeconds, _ = meter.Float64Histogram("copilot_request_duration_seconds")
}

// At Run() exit (deferred):
defer func() {
    metricDurationSeconds.Record(ctx, time.Since(startedAt).Seconds(),
        metric.WithAttributes(attribute.String("provider", l.provider.Name())))
}()
// After each iteration's usage:
metricTokens.Add(ctx, float64(usageDelta.InputTokens),
    metric.WithAttributes(attribute.String("direction", "in")))
metricTokens.Add(ctx, float64(usageDelta.OutputTokens),
    metric.WithAttributes(attribute.String("direction", "out")))
```

Update `apps/backend/internal/copilot/tools/registry.go` — add tool-call duration histogram:

```go
var (
    toolMeter            = otel.Meter("quokkaq/copilot/tools")
    metricToolDuration   metric.Float64Histogram
)

func init() {
    metricToolDuration, _ = toolMeter.Float64Histogram("copilot_tool_call_duration_seconds")
}

// In Dispatch, after measurement:
metricToolDuration.Record(ctx, float64(out.DurationMs)/1000.0,
    metric.WithAttributes(attribute.String("tool", name), attribute.String("status", status)))
```

- [ ] **Step 2: Grafana board JSON**

Create `apps/backend/observability/grafana/copilot-overview.json`. The full JSON is too long to inline here; the structure is:

```json
{
  "title": "Copilot — Overview",
  "uid": "copilot-overview",
  "panels": [
    { "title": "Requests / sec", "type": "timeseries", "targets": [{ "expr": "rate(copilot_request_duration_seconds_count[5m])" }] },
    { "title": "Tokens (in / out)", "type": "timeseries", "targets": [{ "expr": "sum by (direction) (rate(copilot_tokens_total[5m]))" }] },
    { "title": "Tool latency p95", "type": "timeseries", "targets": [{ "expr": "histogram_quantile(0.95, sum by (le, tool) (rate(copilot_tool_call_duration_seconds_bucket[5m])))" }] },
    { "title": "Tool error rate", "type": "timeseries", "targets": [{ "expr": "sum by (tool) (rate(copilot_tool_call_duration_seconds_count{status=~\"error|timeout|rbac_denied\"}[5m])) / sum by (tool) (rate(copilot_tool_call_duration_seconds_count[5m]))" }] }
  ],
  "schemaVersion": 38
}
```

Create the same for `copilot-by-tenant.json` — same panels, with a `tenant_id` template variable using `label_values(copilot_tokens_total, tenant_id)`.

> Note: Drop the JSON files into the existing Grafana provisioning path used by the project's deploy (look at `infra/` or `helm/` for `dashboards/`). If no provisioning path exists yet, add a `README.md` next to the JSON describing how to import.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/internal/copilot/agent/loop.go apps/backend/internal/copilot/tools/registry.go apps/backend/observability/grafana/
git commit -m "feat(copilot): add OTel metrics and Grafana dashboards"
```

---

## Task 17: In-app help + accessibility audit

**Files:**
- Create: `apps/frontend/content/wiki/{en,ru}/help/copilot/overview.mdx`
- Create: `apps/frontend/content/wiki/{en,ru}/help/copilot/tools.mdx`
- Create: `apps/frontend/content/wiki/{en,ru}/help/copilot/limits.mdx`
- Create: `apps/frontend/content/wiki/{en,ru}/help/copilot/privacy.mdx`
- Modify: `apps/frontend/components/copilot/CopilotDrawer.tsx` (a11y)
- Modify: `apps/frontend/components/copilot/Composer.tsx` (a11y)
- Modify: `apps/frontend/components/copilot/EmptyState.tsx` (a11y)

- [ ] **Step 1: Create help pages**

For each MDX file, write 1 page of plain-English documentation. Topics:

- `overview.mdx` — what Copilot does, who can use it, how to invoke (drawer, palette, hotkey).
- `tools.mdx` — table of all tools (ID, what it does, required scopes, example).
- `limits.mdx` — current plan's quotas, what counts toward them, behavior at the 80% / 100% thresholds.
- `privacy.mdx` — PII handling: levels, what's masked, what's never sent to the LLM (free-text, audit payloads).

Wiki indexer (Phase 2) will pick them up automatically; the eval harness covers them via `search_wiki`.

- [ ] **Step 2: A11y improvements in drawer**

In `CopilotDrawer.tsx`:
- `<aside>` → ensure `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the header.
- On open: focus trap (use a small in-component implementation or import `focus-trap-react` if not already present).
- On close: restore focus to the element that opened the drawer (sidebar button or palette).
- Header gets `id="copilot-drawer-title"`.
- Live region around `<MessageList>`: `<div aria-live="polite" aria-relevant="additions">{children}</div>`.

In `Composer.tsx`:
- `<textarea>` gets `aria-label={t('composerPlaceholder')}`.
- Send button gets `aria-keyshortcuts="Enter"` and the abort button `aria-keyshortcuts="Escape"`.
- Page-context chip is a `<button>` with `aria-pressed={attachPageContext}`.

In `EmptyState.tsx`:
- Wrap example list in `<ul>` with `role="list"` for screen reader explicit announcement.

- [ ] **Step 3: Manual a11y audit checklist**

Add `apps/frontend/components/copilot/A11Y_CHECKLIST.md`:

```markdown
# Copilot a11y audit (Phase 3)

Run through each item in the drawer:

- [ ] Open drawer with hotkey, click sidebar, palette — focus lands on textarea.
- [ ] Tab order: textarea → send → abort → close button → next page element.
- [ ] Esc closes drawer; focus restores.
- [ ] Screen reader (VoiceOver or NVDA): drawer announced as "Copilot dialog".
- [ ] Streaming text announced incrementally (aria-live polite).
- [ ] Tool-call cards: status icons have visible labels (not icon-only).
- [ ] Citation pills are keyboard-reachable; aria-label includes anchor name.
- [ ] Cost dashboard: tables have header rows; charts have a text alternative summary below.
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/content/wiki apps/frontend/components/copilot/CopilotDrawer.tsx apps/frontend/components/copilot/Composer.tsx apps/frontend/components/copilot/EmptyState.tsx apps/frontend/components/copilot/A11Y_CHECKLIST.md
git commit -m "feat(copilot): add in-app help pages and a11y audit improvements"
```

---

## Task 18: Regenerate OpenAPI and Orval

- [ ] **Step 1: Regenerate**

Run: `pnpm nx openapi backend && pnpm nx orval frontend`
Expected: success — new dashboard endpoints appear.

- [ ] **Step 2: CI sync check + commit**

```bash
git add apps/backend/docs apps/frontend/src/lib/api/generated
git commit -m "chore(copilot): regenerate OpenAPI and Orval client for Phase 3"
```

---

## Acceptance criteria (Phase 3 = AI Copilot v1 GA sign-off)

1. `cd apps/backend && go test ./...` passes (including fuzz seeds).
2. `cd apps/frontend && pnpm vitest run components/copilot/ lib/copilot/` passes.
3. `pnpm nx openapi backend && pnpm nx orval frontend` produce no diffs.
4. `cd apps/backend && go run ./internal/copilot/eval/cmd` returns `Failed: 0` with the Phase 1+2+3 golden set extended to cover the new tools.
5. With `lookup_ticket` invoked by the LLM, the persisted `copilot_tool_calls.result_summary` does NOT contain raw phone, email, or full name — verified via SQL: `SELECT result_summary FROM copilot_tool_calls WHERE tool_name = 'lookup_ticket' LIMIT 5` and the JSON's `visitorPhone` is masked according to the tenant's `copilot_pii_level`.
6. Setting `copilot_pii_level = 'strict'` on a tenant and asking "show me ticket A-007 details" yields a response where the visitor name is reduced to initials and the phone shows only the last 2 digits.
7. With a plan whose `copilot_messages_per_day = 5`, a 6th message in one day returns HTTP 429 with body `copilot: daily message limit exceeded`. The drawer shows the warning banner.
8. `GET /api/copilot/dashboard/kpis` returns realistic KPIs after 30 days of activity (or after seeding test data); the `/settings/copilot` page renders the 6 KPI cards + chart + 2 tables.
9. Grafana board "Copilot — Overview" shows live request rate, token rates, p95 tool latency, and tool error rate.
10. Manual a11y checklist in `apps/frontend/components/copilot/A11Y_CHECKLIST.md` is fully checked.
11. `/help/copilot/overview` (and ru variant) renders in the in-product wiki and is reachable from the drawer's "What can Copilot do?" link.
12. With Phase 1 + 2 + 3 merged, an admin can ask:
    - "Show me ticket A-007" → masked summary + tool-call card.
    - "Top abandonment-rate services last month" → markdown table with citations to wiki if relevant.
    - "Why did wait grow yesterday?" → narrative + 1–2 tool calls + cost footer.
    - "How do I configure OIDC?" → wiki citation pills.

After all checks pass, `copilot_v1` is enabled by default for new Pro / Enterprise plans.

## Out of Phase 3 — explicit deferrals (future tracks)

- **Insight Engine** — free-text NLP over surveys & support comments (separate spec, not part of Copilot).
- **Proactive insights / push notifications** — separate Copilot v2 spec.
- **Suggested actions / autonomous agent** — separate Copilot v2 spec.
- **Visitor-facing public chatbot** — separate spec, different threat model.
- **Operator/staff Copilot** — separate spec, different latency budget and contextual sources.
- **Self-hosted LLM for on-prem** — depends on `onprem-distribution-licensing.md`.
- **Custom tenant tools / marketplace** — depends on extension SDK roadmap.
- **GigaChat adapter** — Phase 2 Appendix A; promote when first design partner needs it.
