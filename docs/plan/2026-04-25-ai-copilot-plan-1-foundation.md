# AI Copilot Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the minimum end-to-end AI Copilot in QuokkaQ — a Postgres-persisted chat surface, an LLM gateway with an Anthropic adapter, a tool registry with four read-only metrics tools, and a sidebar drawer in the frontend that streams answers — so that an admin can ask "How was unit X yesterday?" and get a streamed answer that called 1–2 tools.

**Architecture:** Server-orchestrated tool-use. Backend Go service `internal/copilot/...` holds the LLM gateway, agent loop, tool registry, and conversation persistence. Frontend `components/copilot/...` renders a right-side drawer that consumes Server-Sent Events from the backend. Anthropic Claude is the only provider in Phase 1 — gateway is interface-based so YandexGPT/GigaChat can land in Phase 2 without refactoring callers.

**Tech Stack:**
- Backend: Go 1.26, chi v5, gorm, hibiken/asynq, OpenTelemetry, slog, github.com/anthropics/anthropic-sdk-go
- Persistence: PostgreSQL 16 (existing), Redis (existing)
- Frontend: Next.js 16, React 19, TanStack Query v5, react-markdown, next-intl
- Tests: stdlib `testing` + glebarezsqlite for backend, vitest for frontend, testplane for E2E

**Source spec:** `docs/plan/2026-04-25-ai-copilot-for-managers-design.md`. Tenants in this codebase are modeled as `Company` — the spec's `tenant_id` becomes `company_id` everywhere in implementation.

**Out of Phase 1 (handled in Phase 2/3):** wiki KB / pgvector indexing, second LLM provider, command-palette integration, citation pills, entity-lookup tools (`lookup_ticket` / `search_clients` / `lookup_support_report` / `search_audit_events`), per-plan token quotas, cost dashboard, full PII tag walker, eval harness, accessibility audit. Phase 1 ships a basic PII helper and a basic plan-feature gate; the richer versions land in Phase 3.

---

## File Structure

### Backend — files created

```
apps/backend/internal/copilot/
├── gateway/
│   ├── types.go                        # ChatMessage, CreateMessageRequest, Message, Usage, ProviderFeatures, ToolDefinition, ToolCall, ToolChoice
│   ├── provider.go                     # LLMProvider interface, StreamSink interface
│   ├── anthropic.go                    # AnthropicProvider implementation
│   ├── anthropic_test.go               # contract test against mock HTTP
│   ├── pricing.go                      # per-provider rate table (USD micros / 1k tokens)
│   └── stub.go                         # in-memory stub for agent-loop tests (test build tag)
├── agent/
│   ├── loop.go                         # Run(ctx, in) error — orchestrator
│   ├── streaming.go                    # SSE event types & emitter
│   ├── policy.go                       # MAX_ITER, timeouts, abort flag check
│   └── loop_test.go                    # integration test driving stub provider
├── tools/
│   ├── types.go                        # Tool, ToolCtx, Result, Citation, Limit
│   ├── registry.go                     # Register, Filter, Dispatch
│   ├── registry_test.go
│   ├── pii.go                          # basic Mask helper (Phase 1)
│   ├── pii_test.go
│   ├── rbac.go                         # guard helper that checks roles in ToolCtx
│   ├── tool_list_units.go
│   ├── tool_list_units_test.go
│   ├── tool_get_unit_summary.go
│   ├── tool_get_unit_summary_test.go
│   ├── tool_get_service_breakdown.go
│   ├── tool_get_service_breakdown_test.go
│   ├── tool_get_hourly_load.go
│   └── tool_get_hourly_load_test.go
├── conversation/
│   ├── service.go                      # CreateThread, AppendMessage, ListThreads, GetThread, RenameThread, SoftDelete, PurgeExpired
│   └── service_test.go
├── quota/
│   ├── service.go                      # CheckPlanFeature (Phase 1: feature gate only)
│   └── service_test.go
└── handlers/
    ├── chat.go                         # POST /api/copilot/threads/:id/messages — SSE
    ├── threads.go                      # CRUD threads + list + rename + delete
    ├── feedback.go                     # POST feedback
    └── helpers.go                      # extract company/user/role from request
```

```
apps/backend/internal/models/
├── copilot_thread.go                   # CopilotThread gorm model
├── copilot_message.go                  # CopilotMessage gorm model
├── copilot_tool_call.go                # CopilotToolCall gorm model
└── copilot_feedback.go                 # CopilotFeedback gorm model

apps/backend/internal/repository/
├── copilot_thread_repository.go
├── copilot_thread_repository_test.go
├── copilot_message_repository.go
└── copilot_message_repository_test.go

apps/backend/internal/jobs/
└── copilot_retention.go                # Asynq retention purge job + handler
```

### Backend — files modified

- `apps/backend/internal/subscriptionfeatures/gates.go` — add `CompanyHasCopilotV1`.
- `apps/backend/pkg/database/migratable_models.go` — register 4 new models in dependency order.
- `apps/backend/internal/jobs/client.go` — add `EnqueueCopilotRetentionPurge()` to `JobClient`.
- `apps/backend/internal/jobs/types.go` — add `TypeCopilotRetentionPurge` constant.
- `apps/backend/cmd/api/main.go` — wire copilot deps, mount routes, register Asynq handler, schedule daily retention.
- `apps/backend/.env.example` — add `COPILOT_*` env vars.

### Frontend — files created

```
apps/frontend/components/copilot/
├── CopilotProvider.tsx                 # context: open/closed, current thread id, page context capture
├── CopilotDrawer.tsx                   # right-aligned drawer
├── Composer.tsx                        # textarea + send + page-context chip
├── MessageList.tsx                     # virtualized-friendly list
├── MessageBubble.tsx                   # markdown + citations + tool-call cards + streaming cursor
├── ToolCallCard.tsx                    # collapsible tool-call summary
├── EmptyState.tsx                      # 6 example queries
├── PageContextChip.tsx                 # dismissible chip showing attached page context
└── hooks/
    ├── useCopilotStream.ts             # SSE consumer
    ├── usePageContext.ts               # snapshots pathname + visible entity ids
    └── index.ts
```

```
apps/frontend/lib/copilot/
├── sse-events.ts                       # SSE event type discriminated union
└── page-context.ts                     # serialization helper + tests

apps/frontend/messages/en/copilot.json
apps/frontend/messages/ru/copilot.json
```

### Frontend — files modified

- `apps/frontend/app/[locale]/app-layout.tsx` — wrap children in `<CopilotProvider>`, mount `<CopilotDrawer>`.
- `apps/frontend/components/AppSidebar.tsx` — add "Ask Copilot" trigger button (opens drawer; gated by feature flag from `/api/copilot/quota`).

### Generated artifacts (regenerated, not hand-edited)

- `apps/backend/docs/openapi.json` — regenerated by `pnpm nx openapi backend`.
- `apps/frontend/src/lib/api/generated/**` — regenerated by `pnpm nx orval frontend`.

---

## Conventions used in this plan

- All Go file paths are relative to `apps/backend/`.
- All TS file paths are relative to `apps/frontend/`.
- `t.Parallel()` is used in unit tests by default; integration tests that share Redis/Postgres opt out.
- In-memory tests use `glebarezsqlite` per existing convention; full integration tests use docker-compose Postgres from `apps/backend/docker-compose.yml`.
- Commits are conventional: `feat(copilot): ...`, `test(copilot): ...`, `chore(copilot): ...`.
- Each task ends with a commit step; never amend across tasks.

---

## Task 1: Plan-feature gate `CompanyHasCopilotV1`

**Files:**
- Modify: `apps/backend/internal/subscriptionfeatures/gates.go`
- Create: `apps/backend/internal/subscriptionfeatures/gates_copilot_test.go`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/internal/subscriptionfeatures/gates_copilot_test.go`:

```go
package subscriptionfeatures

import (
	"context"
	"testing"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newCopilotTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	stmts := []string{
		`CREATE TABLE companies (id text PRIMARY KEY, subscription_id text, is_saas_operator boolean DEFAULT false)`,
		`CREATE TABLE subscriptions (id text PRIMARY KEY, plan_id text)`,
		`CREATE TABLE subscription_plans (id text PRIMARY KEY, features text)`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func TestCompanyHasCopilotV1_truthyFeatureFlag(t *testing.T) {
	t.Parallel()
	db := newCopilotTestDB(t)
	db.Exec(`INSERT INTO subscription_plans (id, features) VALUES ('p1', '{"copilot_v1": true}')`)
	db.Exec(`INSERT INTO subscriptions (id, plan_id) VALUES ('s1', 'p1')`)
	db.Exec(`INSERT INTO companies (id, subscription_id) VALUES ('c1', 's1')`)

	ok, err := CompanyHasCopilotV1(context.Background(), db, "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("expected copilot_v1 enabled when feature flag is true")
	}
}

func TestCompanyHasCopilotV1_absentFeatureDefaultsFalse(t *testing.T) {
	t.Parallel()
	db := newCopilotTestDB(t)
	db.Exec(`INSERT INTO subscription_plans (id, features) VALUES ('p1', '{}')`)
	db.Exec(`INSERT INTO subscriptions (id, plan_id) VALUES ('s1', 'p1')`)
	db.Exec(`INSERT INTO companies (id, subscription_id) VALUES ('c1', 's1')`)

	ok, err := CompanyHasCopilotV1(context.Background(), db, "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected copilot_v1 disabled when flag absent")
	}
}

func TestCompanyHasCopilotV1_saasOperatorAlwaysAllowed(t *testing.T) {
	t.Parallel()
	db := newCopilotTestDB(t)
	db.Exec(`INSERT INTO companies (id, is_saas_operator) VALUES ('platform', true)`)
	ok, err := CompanyHasCopilotV1(context.Background(), db, "platform")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("saas operator company should always have copilot")
	}
}

func TestCompanyHasCopilotV1_emptyCompanyID(t *testing.T) {
	t.Parallel()
	db := newCopilotTestDB(t)
	ok, err := CompanyHasCopilotV1(context.Background(), db, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("empty company id should be rejected")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && go test ./internal/subscriptionfeatures/ -run TestCompanyHasCopilotV1 -v`
Expected: FAIL with `undefined: CompanyHasCopilotV1`.

- [ ] **Step 3: Implement the gate**

Append to `apps/backend/internal/subscriptionfeatures/gates.go` (mirror the shape of `CompanyHasOutboundWebhooks`):

```go
// CompanyHasCopilotV1 is true when plan.features.copilot_v1 is truthy; absent → false.
// SaaS operator companies always have access.
func CompanyHasCopilotV1(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	if strings.TrimSpace(companyID) == "" {
		return false, nil
	}
	if op, err := companyIsSaaSOperator(ctx, db, companyID); err == nil && op {
		return true, nil
	}
	raw, err := loadPlanFeaturesJSON(ctx, db, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return false, nil
	}
	v, ok := m["copilot_v1"]
	if !ok || v == nil {
		return false, nil
	}
	return planFeatureTruthy(v), nil
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd apps/backend && go test ./internal/subscriptionfeatures/ -run TestCompanyHasCopilotV1 -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/subscriptionfeatures/gates.go apps/backend/internal/subscriptionfeatures/gates_copilot_test.go
git commit -m "feat(copilot): add copilot_v1 plan-feature gate"
```

---

## Task 2: Postgres models for copilot tables

**Files:**
- Create: `apps/backend/internal/models/copilot_thread.go`
- Create: `apps/backend/internal/models/copilot_message.go`
- Create: `apps/backend/internal/models/copilot_tool_call.go`
- Create: `apps/backend/internal/models/copilot_feedback.go`
- Modify: `apps/backend/pkg/database/migratable_models.go`

- [ ] **Step 1: Write `CopilotThread` model**

Create `apps/backend/internal/models/copilot_thread.go`:

```go
package models

import "time"

type CopilotThread struct {
	ID         string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID  string     `gorm:"not null;index:idx_copilot_threads_company_user_updated,priority:1" json:"companyId"`
	UserID     string     `gorm:"not null;index:idx_copilot_threads_company_user_updated,priority:2" json:"userId"`
	Title      *string    `json:"title,omitempty"`
	Locale     string     `gorm:"not null;size:8;default:'en'" json:"locale"`
	CreatedAt  time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt  time.Time  `gorm:"default:now();index:idx_copilot_threads_company_user_updated,priority:3,sort:desc" json:"updatedAt"`
	DeletedAt  *time.Time `gorm:"index" json:"deletedAt,omitempty"`

	Company Company `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	User    User    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (CopilotThread) TableName() string { return "copilot_threads" }
```

- [ ] **Step 2: Write `CopilotMessage` model**

Create `apps/backend/internal/models/copilot_message.go`:

```go
package models

import (
	"time"

	"gorm.io/datatypes"
)

// CopilotMessage roles: "user" | "assistant" | "tool" | "system".
type CopilotMessage struct {
	ID            string         `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	ThreadID      string         `gorm:"not null;index:idx_copilot_messages_thread_created,priority:1" json:"threadId"`
	Role          string         `gorm:"not null;size:16" json:"role"`
	Content       datatypes.JSON `gorm:"type:jsonb;not null" json:"content"`
	TokensIn      *int           `json:"tokensIn,omitempty"`
	TokensOut     *int           `json:"tokensOut,omitempty"`
	Provider      *string        `gorm:"size:32" json:"provider,omitempty"`
	Model         *string        `gorm:"size:64" json:"model,omitempty"`
	CostUSDx10000 *int           `gorm:"column:cost_usd_x10000" json:"costUsdMicros,omitempty"`
	CreatedAt     time.Time      `gorm:"default:now();index:idx_copilot_messages_thread_created,priority:2" json:"createdAt"`

	Thread CopilotThread `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (CopilotMessage) TableName() string { return "copilot_messages" }
```

- [ ] **Step 3: Write `CopilotToolCall` model**

Create `apps/backend/internal/models/copilot_tool_call.go`:

```go
package models

import (
	"time"

	"gorm.io/datatypes"
)

// CopilotToolCall.Status: "ok" | "rbac_denied" | "invalid_args" | "error" | "timeout".
type CopilotToolCall struct {
	ID            string         `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	MessageID     string         `gorm:"not null;index" json:"messageId"`
	ToolName      string         `gorm:"not null;size:64" json:"toolName"`
	ArgsRedacted  datatypes.JSON `gorm:"type:jsonb" json:"argsRedacted,omitempty"`
	ResultSummary datatypes.JSON `gorm:"type:jsonb" json:"resultSummary,omitempty"`
	DurationMs    int            `json:"durationMs"`
	Status        string         `gorm:"not null;size:32" json:"status"`
	ErrorMessage  *string        `gorm:"type:text" json:"errorMessage,omitempty"`
	CreatedAt     time.Time      `gorm:"default:now()" json:"createdAt"`

	Message CopilotMessage `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (CopilotToolCall) TableName() string { return "copilot_tool_calls" }
```

- [ ] **Step 4: Write `CopilotFeedback` model**

Create `apps/backend/internal/models/copilot_feedback.go`:

```go
package models

import "time"

type CopilotFeedback struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	MessageID string    `gorm:"not null;index" json:"messageId"`
	UserID    string    `gorm:"not null" json:"userId"`
	Rating    int16     `gorm:"not null" json:"rating"` // -1, 0, +1
	Comment   *string   `gorm:"type:text" json:"comment,omitempty"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`

	Message CopilotMessage `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	User    User           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (CopilotFeedback) TableName() string { return "copilot_feedback" }
```

- [ ] **Step 5: Register models in `migratable_models.go`**

Open `apps/backend/pkg/database/migratable_models.go`. After the existing list (e.g., near `&models.AuditLog{}`), append the four new models in dependency order (Thread → Message → ToolCall, Feedback). Add at the appropriate location:

```go
// AI Copilot
&models.CopilotThread{},
&models.CopilotMessage{},
&models.CopilotToolCall{},
&models.CopilotFeedback{},
```

- [ ] **Step 6: Verify compile + auto-migrate runs**

Run: `cd apps/backend && go build ./...`
Expected: success.

Optional sanity-check (requires docker-compose Postgres): `cd apps/backend && go run ./cmd/api &` then verify in psql:
```sql
\d copilot_threads
\d copilot_messages
\d copilot_tool_calls
\d copilot_feedback
```
Expected: all four tables present with the indexes from gorm tags.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/internal/models/copilot_*.go apps/backend/pkg/database/migratable_models.go
git commit -m "feat(copilot): add Postgres models and migration registration"
```

---

## Task 3: Repository layer for threads and messages

**Files:**
- Create: `apps/backend/internal/repository/copilot_thread_repository.go`
- Create: `apps/backend/internal/repository/copilot_thread_repository_test.go`
- Create: `apps/backend/internal/repository/copilot_message_repository.go`
- Create: `apps/backend/internal/repository/copilot_message_repository_test.go`

- [ ] **Step 1: Write failing thread-repo tests**

Create `apps/backend/internal/repository/copilot_thread_repository_test.go`:

```go
package repository

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newCopilotRepoTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.CopilotThread{}, &models.CopilotMessage{}, &models.CopilotToolCall{}, &models.CopilotFeedback{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestCopilotThreadRepository_CreateAndFindByID(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	r := NewCopilotThreadRepositoryWithDB(db)
	thread := &models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"}

	if err := r.Create(thread); err != nil {
		t.Fatal(err)
	}
	found, err := r.FindByID("c1", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != "t1" || found.CompanyID != "c1" {
		t.Fatalf("unexpected thread: %+v", found)
	}
}

func TestCopilotThreadRepository_TenantIsolation(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	r := NewCopilotThreadRepositoryWithDB(db)
	_ = r.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"})

	if _, err := r.FindByID("other-co", "t1"); err == nil {
		t.Fatal("expected error when accessing thread under wrong company")
	}
}

func TestCopilotThreadRepository_ListExcludesSoftDeleted(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	r := NewCopilotThreadRepositoryWithDB(db)
	_ = r.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"})
	_ = r.Create(&models.CopilotThread{ID: "t2", CompanyID: "c1", UserID: "u1", Locale: "en"})
	now := time.Now()
	_ = db.Model(&models.CopilotThread{}).Where("id = ?", "t2").Update("deleted_at", now).Error

	threads, err := r.ListByUser("c1", "u1", 50, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(threads) != 1 || threads[0].ID != "t1" {
		t.Fatalf("expected only t1, got %+v", threads)
	}
}

func TestCopilotThreadRepository_SoftDelete(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	r := NewCopilotThreadRepositoryWithDB(db)
	_ = r.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"})

	if err := r.SoftDelete("c1", "t1"); err != nil {
		t.Fatal(err)
	}
	var t models.CopilotThread
	_ = db.Unscoped().First(&t, "id = ?", "t1")
	if t.DeletedAt == nil {
		t.Fatal("expected DeletedAt to be set")
	}
}
```

- [ ] **Step 2: Run test, verify fail**

Run: `cd apps/backend && go test ./internal/repository/ -run TestCopilotThreadRepository -v`
Expected: FAIL with `undefined: NewCopilotThreadRepositoryWithDB`.

- [ ] **Step 3: Implement the thread repository**

Create `apps/backend/internal/repository/copilot_thread_repository.go`:

```go
package repository

import (
	"errors"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type CopilotThreadRepository interface {
	Create(thread *models.CopilotThread) error
	FindByID(companyID, threadID string) (*models.CopilotThread, error)
	ListByUser(companyID, userID string, limit int, cursorUpdatedAt string) ([]models.CopilotThread, error)
	Rename(companyID, threadID, title string) error
	SoftDelete(companyID, threadID string) error
	Touch(threadID string, at time.Time) error
}

type copilotThreadRepository struct {
	db *gorm.DB
}

func NewCopilotThreadRepository() CopilotThreadRepository {
	return &copilotThreadRepository{db: database.DB}
}

// NewCopilotThreadRepositoryWithDB is for tests.
func NewCopilotThreadRepositoryWithDB(db *gorm.DB) CopilotThreadRepository {
	return &copilotThreadRepository{db: db}
}

func (r *copilotThreadRepository) Create(thread *models.CopilotThread) error {
	return r.db.Create(thread).Error
}

func (r *copilotThreadRepository) FindByID(companyID, threadID string) (*models.CopilotThread, error) {
	var thread models.CopilotThread
	err := r.db.
		Where("company_id = ? AND id = ? AND deleted_at IS NULL", companyID, threadID).
		First(&thread).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, gorm.ErrRecordNotFound
	}
	if err != nil {
		return nil, err
	}
	return &thread, nil
}

func (r *copilotThreadRepository) ListByUser(companyID, userID string, limit int, cursorUpdatedAt string) ([]models.CopilotThread, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := r.db.
		Where("company_id = ? AND user_id = ? AND deleted_at IS NULL", companyID, userID).
		Order("updated_at DESC").
		Limit(limit)
	if cursorUpdatedAt != "" {
		q = q.Where("updated_at < ?", cursorUpdatedAt)
	}
	var threads []models.CopilotThread
	if err := q.Find(&threads).Error; err != nil {
		return nil, err
	}
	return threads, nil
}

func (r *copilotThreadRepository) Rename(companyID, threadID, title string) error {
	return r.db.Model(&models.CopilotThread{}).
		Where("company_id = ? AND id = ? AND deleted_at IS NULL", companyID, threadID).
		Updates(map[string]interface{}{"title": title, "updated_at": time.Now()}).Error
}

func (r *copilotThreadRepository) SoftDelete(companyID, threadID string) error {
	now := time.Now()
	return r.db.Model(&models.CopilotThread{}).
		Where("company_id = ? AND id = ? AND deleted_at IS NULL", companyID, threadID).
		Update("deleted_at", now).Error
}

func (r *copilotThreadRepository) Touch(threadID string, at time.Time) error {
	return r.db.Model(&models.CopilotThread{}).
		Where("id = ?", threadID).
		Update("updated_at", at).Error
}
```

- [ ] **Step 4: Verify thread tests pass**

Run: `cd apps/backend && go test ./internal/repository/ -run TestCopilotThreadRepository -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write failing message-repo tests**

Create `apps/backend/internal/repository/copilot_message_repository_test.go`:

```go
package repository

import (
	"testing"

	"quokkaq-go-backend/internal/models"

	"gorm.io/datatypes"
)

func TestCopilotMessageRepository_AppendAndList(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	tr := NewCopilotThreadRepositoryWithDB(db)
	_ = tr.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"})

	mr := NewCopilotMessageRepositoryWithDB(db)
	a := &models.CopilotMessage{ID: "m1", ThreadID: "t1", Role: "user", Content: datatypes.JSON([]byte(`{"text":"hi"}`))}
	b := &models.CopilotMessage{ID: "m2", ThreadID: "t1", Role: "assistant", Content: datatypes.JSON([]byte(`{"text":"hello"}`))}
	if err := mr.Append(a); err != nil {
		t.Fatal(err)
	}
	if err := mr.Append(b); err != nil {
		t.Fatal(err)
	}

	msgs, err := mr.ListByThread("t1", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 2 || msgs[0].ID != "m1" || msgs[1].ID != "m2" {
		t.Fatalf("unexpected order/content: %+v", msgs)
	}
}

func TestCopilotMessageRepository_RecordToolCall(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	tr := NewCopilotThreadRepositoryWithDB(db)
	_ = tr.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"})
	mr := NewCopilotMessageRepositoryWithDB(db)
	_ = mr.Append(&models.CopilotMessage{ID: "m1", ThreadID: "t1", Role: "assistant", Content: datatypes.JSON([]byte(`{}`))})

	tc := &models.CopilotToolCall{ID: "tc1", MessageID: "m1", ToolName: "list_units", DurationMs: 12, Status: "ok"}
	if err := mr.RecordToolCall(tc); err != nil {
		t.Fatal(err)
	}
	calls, err := mr.ListToolCallsByMessage("m1")
	if err != nil {
		t.Fatal(err)
	}
	if len(calls) != 1 || calls[0].ID != "tc1" {
		t.Fatalf("unexpected: %+v", calls)
	}
}

func TestCopilotMessageRepository_RecordFeedback(t *testing.T) {
	t.Parallel()
	db := newCopilotRepoTestDB(t)
	tr := NewCopilotThreadRepositoryWithDB(db)
	_ = tr.Create(&models.CopilotThread{ID: "t1", CompanyID: "c1", UserID: "u1", Locale: "en"})
	mr := NewCopilotMessageRepositoryWithDB(db)
	_ = mr.Append(&models.CopilotMessage{ID: "m1", ThreadID: "t1", Role: "assistant", Content: datatypes.JSON([]byte(`{}`))})

	if err := mr.RecordFeedback(&models.CopilotFeedback{MessageID: "m1", UserID: "u1", Rating: 1, Comment: ptrString("good")}); err != nil {
		t.Fatal(err)
	}
}

func ptrString(s string) *string { return &s }
```

- [ ] **Step 6: Implement message repository**

Create `apps/backend/internal/repository/copilot_message_repository.go`:

```go
package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type CopilotMessageRepository interface {
	Append(msg *models.CopilotMessage) error
	ListByThread(threadID string, limit int) ([]models.CopilotMessage, error)
	RecordToolCall(call *models.CopilotToolCall) error
	ListToolCallsByMessage(messageID string) ([]models.CopilotToolCall, error)
	RecordFeedback(fb *models.CopilotFeedback) error
}

type copilotMessageRepository struct {
	db *gorm.DB
}

func NewCopilotMessageRepository() CopilotMessageRepository {
	return &copilotMessageRepository{db: database.DB}
}

func NewCopilotMessageRepositoryWithDB(db *gorm.DB) CopilotMessageRepository {
	return &copilotMessageRepository{db: db}
}

func (r *copilotMessageRepository) Append(msg *models.CopilotMessage) error {
	return r.db.Create(msg).Error
}

func (r *copilotMessageRepository) ListByThread(threadID string, limit int) ([]models.CopilotMessage, error) {
	q := r.db.Where("thread_id = ?", threadID).Order("created_at ASC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	var msgs []models.CopilotMessage
	if err := q.Find(&msgs).Error; err != nil {
		return nil, err
	}
	return msgs, nil
}

func (r *copilotMessageRepository) RecordToolCall(call *models.CopilotToolCall) error {
	return r.db.Create(call).Error
}

func (r *copilotMessageRepository) ListToolCallsByMessage(messageID string) ([]models.CopilotToolCall, error) {
	var calls []models.CopilotToolCall
	if err := r.db.Where("message_id = ?", messageID).Order("created_at ASC").Find(&calls).Error; err != nil {
		return nil, err
	}
	return calls, nil
}

func (r *copilotMessageRepository) RecordFeedback(fb *models.CopilotFeedback) error {
	return r.db.Create(fb).Error
}
```

- [ ] **Step 7: Run all repository tests**

Run: `cd apps/backend && go test ./internal/repository/ -run "TestCopilotThread|TestCopilotMessage" -v`
Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/internal/repository/copilot_*.go
git commit -m "feat(copilot): add thread and message repositories"
```

---

## Task 4: Conversation service

**Files:**
- Create: `apps/backend/internal/copilot/conversation/service.go`
- Create: `apps/backend/internal/copilot/conversation/service_test.go`

- [ ] **Step 1: Write failing service tests**

Create `apps/backend/internal/copilot/conversation/service_test.go`:

```go
package conversation

import (
	"context"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

func newServiceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.CopilotThread{}, &models.CopilotMessage{}, &models.CopilotToolCall{}, &models.CopilotFeedback{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func newSvc(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db := newServiceTestDB(t)
	svc := New(
		repository.NewCopilotThreadRepositoryWithDB(db),
		repository.NewCopilotMessageRepositoryWithDB(db),
	)
	return svc, db
}

func TestCreateThread_AssignsLocaleAndID(t *testing.T) {
	t.Parallel()
	svc, _ := newSvc(t)
	thread, err := svc.CreateThread(context.Background(), CreateThreadInput{
		CompanyID: "c1", UserID: "u1", Locale: "ru",
	})
	if err != nil {
		t.Fatal(err)
	}
	if thread.ID == "" || thread.Locale != "ru" || thread.CompanyID != "c1" {
		t.Fatalf("unexpected: %+v", thread)
	}
}

func TestAppendMessage_TouchesThread(t *testing.T) {
	t.Parallel()
	svc, db := newSvc(t)
	thread, _ := svc.CreateThread(context.Background(), CreateThreadInput{CompanyID: "c1", UserID: "u1", Locale: "en"})

	originalUpdated := thread.UpdatedAt
	time.Sleep(10 * time.Millisecond)

	if _, err := svc.AppendMessage(context.Background(), AppendMessageInput{
		CompanyID: "c1", ThreadID: thread.ID, Role: "user",
		Content: datatypes.JSON([]byte(`{"text":"hello"}`)),
	}); err != nil {
		t.Fatal(err)
	}

	var refreshed models.CopilotThread
	_ = db.First(&refreshed, "id = ?", thread.ID)
	if !refreshed.UpdatedAt.After(originalUpdated) {
		t.Fatalf("UpdatedAt did not advance: was %v, now %v", originalUpdated, refreshed.UpdatedAt)
	}
}

func TestAppendMessage_RejectsCrossCompany(t *testing.T) {
	t.Parallel()
	svc, _ := newSvc(t)
	thread, _ := svc.CreateThread(context.Background(), CreateThreadInput{CompanyID: "c1", UserID: "u1", Locale: "en"})

	_, err := svc.AppendMessage(context.Background(), AppendMessageInput{
		CompanyID: "other-co", ThreadID: thread.ID, Role: "user",
		Content: datatypes.JSON([]byte(`{}`)),
	})
	if err == nil {
		t.Fatal("expected cross-company append to fail")
	}
}

func TestPurgeExpired_RemovesOldThreads(t *testing.T) {
	t.Parallel()
	svc, db := newSvc(t)
	old, _ := svc.CreateThread(context.Background(), CreateThreadInput{CompanyID: "c1", UserID: "u1", Locale: "en"})
	keep, _ := svc.CreateThread(context.Background(), CreateThreadInput{CompanyID: "c1", UserID: "u1", Locale: "en"})

	cutoff := time.Now().Add(-time.Hour)
	_ = db.Model(&models.CopilotThread{}).Where("id = ?", old.ID).Update("updated_at", time.Now().Add(-100*24*time.Hour)).Error

	deleted, err := svc.PurgeExpired(context.Background(), 90*24*time.Hour, cutoff)
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Fatalf("expected 1 deleted, got %d", deleted)
	}

	var alive models.CopilotThread
	if err := db.Where("id = ?", keep.ID).First(&alive).Error; err != nil {
		t.Fatalf("kept thread should still be alive: %v", err)
	}
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd apps/backend && go test ./internal/copilot/conversation/ -v`
Expected: FAIL with `package quokkaq-go-backend/internal/copilot/conversation: no Go files`.

- [ ] **Step 3: Implement the service**

Create `apps/backend/internal/copilot/conversation/service.go`:

```go
package conversation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/datatypes"
)

var ErrThreadNotFound = errors.New("copilot: thread not found")

type CreateThreadInput struct {
	CompanyID string
	UserID    string
	Locale    string
	Title     *string
}

type AppendMessageInput struct {
	CompanyID     string
	ThreadID      string
	Role          string // user|assistant|tool|system
	Content       datatypes.JSON
	TokensIn      *int
	TokensOut     *int
	Provider      *string
	Model         *string
	CostUSDx10000 *int
}

type Service struct {
	threads  repository.CopilotThreadRepository
	messages repository.CopilotMessageRepository
}

func New(threads repository.CopilotThreadRepository, messages repository.CopilotMessageRepository) *Service {
	return &Service{threads: threads, messages: messages}
}

func (s *Service) CreateThread(ctx context.Context, in CreateThreadInput) (*models.CopilotThread, error) {
	if in.CompanyID == "" || in.UserID == "" {
		return nil, fmt.Errorf("copilot: company and user required")
	}
	if in.Locale == "" {
		in.Locale = "en"
	}
	thread := &models.CopilotThread{
		CompanyID: in.CompanyID,
		UserID:    in.UserID,
		Locale:    in.Locale,
		Title:     in.Title,
	}
	if err := s.threads.Create(thread); err != nil {
		return nil, err
	}
	return thread, nil
}

func (s *Service) AppendMessage(ctx context.Context, in AppendMessageInput) (*models.CopilotMessage, error) {
	if _, err := s.threads.FindByID(in.CompanyID, in.ThreadID); err != nil {
		return nil, ErrThreadNotFound
	}
	msg := &models.CopilotMessage{
		ThreadID:      in.ThreadID,
		Role:          in.Role,
		Content:       in.Content,
		TokensIn:      in.TokensIn,
		TokensOut:     in.TokensOut,
		Provider:      in.Provider,
		Model:         in.Model,
		CostUSDx10000: in.CostUSDx10000,
	}
	if err := s.messages.Append(msg); err != nil {
		return nil, err
	}
	if err := s.threads.Touch(in.ThreadID, time.Now()); err != nil {
		return nil, err
	}
	return msg, nil
}

func (s *Service) ListThreads(ctx context.Context, companyID, userID string, limit int, cursor string) ([]models.CopilotThread, error) {
	return s.threads.ListByUser(companyID, userID, limit, cursor)
}

func (s *Service) GetThread(ctx context.Context, companyID, threadID string) (*models.CopilotThread, []models.CopilotMessage, error) {
	thread, err := s.threads.FindByID(companyID, threadID)
	if err != nil {
		return nil, nil, ErrThreadNotFound
	}
	msgs, err := s.messages.ListByThread(threadID, 0)
	if err != nil {
		return nil, nil, err
	}
	return thread, msgs, nil
}

func (s *Service) RenameThread(ctx context.Context, companyID, threadID, title string) error {
	if _, err := s.threads.FindByID(companyID, threadID); err != nil {
		return ErrThreadNotFound
	}
	return s.threads.Rename(companyID, threadID, title)
}

func (s *Service) SoftDeleteThread(ctx context.Context, companyID, threadID string) error {
	return s.threads.SoftDelete(companyID, threadID)
}

func (s *Service) RecordToolCall(ctx context.Context, call *models.CopilotToolCall) error {
	return s.messages.RecordToolCall(call)
}

func (s *Service) RecordFeedback(ctx context.Context, fb *models.CopilotFeedback) error {
	return s.messages.RecordFeedback(fb)
}

// PurgeExpired soft-deletes threads whose updated_at is older than retention.
// Soft-deleted threads older than 30 days are then hard-deleted.
// Returns the count of hard-deleted threads.
func (s *Service) PurgeExpired(ctx context.Context, retention time.Duration, now time.Time) (int64, error) {
	// This is a thin wrapper; the repo holds the actual DB. We use a direct DB
	// access pattern via an injected hook later. For now, return 0 and let the job invoke
	// a SQL command. To avoid an extra interface, the conversation service will
	// require a concrete *gorm.DB via a setter. We add it below.
	if s.purgeDB == nil {
		return 0, errors.New("copilot conversation: purge not configured")
	}
	cutoffSoft := now.Add(-retention)
	cutoffHard := now.Add(-30 * 24 * time.Hour)
	// 1. soft-delete threads past retention
	if err := s.purgeDB.WithContext(ctx).Exec(
		`UPDATE copilot_threads SET deleted_at = ? WHERE updated_at < ? AND deleted_at IS NULL`,
		now, cutoffSoft,
	).Error; err != nil {
		return 0, err
	}
	// 2. hard-delete soft-deleted older than 30 days (cascades to messages, tool calls, feedback)
	res := s.purgeDB.WithContext(ctx).Exec(
		`DELETE FROM copilot_threads WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
		cutoffHard,
	)
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}
```

The `PurgeExpired` method needs a `*gorm.DB`. Add a configurable hook:

```go
import "gorm.io/gorm"

// WithPurgeDB sets the DB used by PurgeExpired. Wired in cmd/api.
func (s *Service) WithPurgeDB(db *gorm.DB) *Service { s.purgeDB = db; return s }

// (Add field to struct.)
type Service struct {
	threads  repository.CopilotThreadRepository
	messages repository.CopilotMessageRepository
	purgeDB  *gorm.DB
}
```

Adjust the file so `Service` has the `purgeDB` field declared once and the import is included.

- [ ] **Step 4: Update test to wire purgeDB**

Update the `newSvc` helper in the test file:

```go
func newSvc(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db := newServiceTestDB(t)
	svc := New(
		repository.NewCopilotThreadRepositoryWithDB(db),
		repository.NewCopilotMessageRepositoryWithDB(db),
	).WithPurgeDB(db)
	return svc, db
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd apps/backend && go test ./internal/copilot/conversation/ -v`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/internal/copilot/conversation/
git commit -m "feat(copilot): add conversation service with retention purge"
```

---

## Task 5: Retention purge Asynq job

**Files:**
- Modify: `apps/backend/internal/jobs/types.go`
- Modify: `apps/backend/internal/jobs/client.go`
- Create: `apps/backend/internal/jobs/copilot_retention.go`

- [ ] **Step 1: Add the job-type constant**

In `apps/backend/internal/jobs/types.go`, add to the constant block:

```go
const (
    // ... existing types ...
    TypeCopilotRetentionPurge = "copilot:retention_purge"
)
```

- [ ] **Step 2: Add enqueue method to JobClient interface and impl**

In `apps/backend/internal/jobs/client.go`:

1. Add `EnqueueCopilotRetentionPurge() error` to the `JobClient` interface (next to other `Enqueue*` methods).
2. Add the implementation on `*jobClient`:

```go
func (c *jobClient) EnqueueCopilotRetentionPurge() error {
    payload, err := json.Marshal(struct{}{})
    if err != nil {
        return err
    }
    _, err = c.client.Enqueue(asynq.NewTask(TypeCopilotRetentionPurge, payload), asynq.Queue("default"))
    return err
}
```

- [ ] **Step 3: Create the handler file**

Create `apps/backend/internal/jobs/copilot_retention.go`:

```go
package jobs

import (
    "context"
    "log/slog"
    "time"

    "github.com/hibiken/asynq"
)

// CopilotRetentionRunner is the subset of conversation.Service used by retention purge.
type CopilotRetentionRunner interface {
    PurgeExpired(ctx context.Context, retention time.Duration, now time.Time) (int64, error)
}

// HandleCopilotRetentionPurge runs the daily purge.
// Wire from cmd/api by registering with the Asynq mux (matches existing handlers).
func HandleCopilotRetentionPurge(svc CopilotRetentionRunner, retention time.Duration) func(context.Context, *asynq.Task) error {
    return func(ctx context.Context, _ *asynq.Task) error {
        deleted, err := svc.PurgeExpired(ctx, retention, time.Now())
        if err != nil {
            slog.Error("copilot retention purge failed", "err", err)
            return err
        }
        slog.Info("copilot retention purge complete", "hard_deleted", deleted)
        return nil
    }
}
```

- [ ] **Step 4: Verify compile**

Run: `cd apps/backend && go build ./...`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/jobs/types.go apps/backend/internal/jobs/client.go apps/backend/internal/jobs/copilot_retention.go
git commit -m "feat(copilot): add retention purge Asynq job"
```

---

## Task 6: Basic PII masking helper

This is the **Phase 1 minimum** — full struct-tag walker is Phase 3. Phase 1 needs a callable shape so tools can wire it; the implementation only handles a small set of explicit field names.

**Files:**
- Create: `apps/backend/internal/copilot/tools/pii.go`
- Create: `apps/backend/internal/copilot/tools/pii_test.go`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/internal/copilot/tools/pii_test.go`:

```go
package tools

import (
    "encoding/json"
    "testing"
)

func TestMaskPhone(t *testing.T) {
    t.Parallel()
    cases := []struct {
        level    string
        in, want string
    }{
        {"strict", "+79161234567", "+7XXXXXXXX67"},
        {"standard", "+79161234567", "+7XXXXXXXX67"},
        {"relaxed", "+79161234567", "+79161234567"},
        {"strict", "", ""},
    }
    for _, c := range cases {
        if got := MaskPhone(c.in, c.level); got != c.want {
            t.Errorf("MaskPhone(%q,%q) = %q want %q", c.in, c.level, got, c.want)
        }
    }
}

func TestMaskEmail(t *testing.T) {
    t.Parallel()
    if got := MaskEmail("john@example.com", "strict"); got != "j***@example.com" {
        t.Errorf("got %q", got)
    }
    if got := MaskEmail("john@example.com", "relaxed"); got != "john@example.com" {
        t.Errorf("relaxed should not mask, got %q", got)
    }
}

func TestMaskFullNameStrict(t *testing.T) {
    t.Parallel()
    if got := MaskFullName("Иван Иванов", "strict"); got != "И. И." {
        t.Errorf("got %q", got)
    }
    if got := MaskFullName("Jane Doe", "strict"); got != "J. D." {
        t.Errorf("got %q", got)
    }
    if got := MaskFullName("Cher", "strict"); got != "C." {
        t.Errorf("single word: got %q", got)
    }
    if got := MaskFullName("Jane Doe", "standard"); got != "Jane Doe" {
        t.Errorf("standard should not mask, got %q", got)
    }
}

func TestMaskMap_AppliesToTaggedKeys(t *testing.T) {
    t.Parallel()
    in := map[string]any{
        "id":    "u1",
        "phone": "+79161234567",
        "email": "j@e.com",
        "name":  "Jane Doe",
    }
    out := MaskMap(in, "strict")
    raw, _ := json.Marshal(out)
    s := string(raw)
    if !contains(s, `"phone":"+7XXXXXXXX67"`) {
        t.Errorf("phone not masked: %s", s)
    }
    if !contains(s, `"email":"j***@e.com"`) {
        t.Errorf("email not masked: %s", s)
    }
    if !contains(s, `"name":"J. D."`) {
        t.Errorf("name not masked: %s", s)
    }
    if !contains(s, `"id":"u1"`) {
        t.Errorf("id should be untouched: %s", s)
    }
}

func contains(s, sub string) bool {
    for i := 0; i+len(sub) <= len(s); i++ {
        if s[i:i+len(sub)] == sub {
            return true
        }
    }
    return false
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestMask -v`
Expected: FAIL — package doesn't exist yet.

- [ ] **Step 3: Implement basic mask helpers**

Create `apps/backend/internal/copilot/tools/pii.go`:

```go
// Package tools defines the Copilot tool registry, PII masking, and individual tools.
//
// PII masking in Phase 1 is intentionally minimal: only field-name-keyed maps are
// walked, and only phone / email / name receive treatment. Full struct-tag walker
// lands in Phase 3 (see docs/plan/2026-04-25-ai-copilot-for-managers-design.md §5.2).
package tools

import (
    "strings"
    "unicode"
)

// PII levels.
const (
    PIIStrict   = "strict"
    PIIStandard = "standard"
    PIIRelaxed  = "relaxed"
)

// MaskPhone masks all but the last two digits when level >= standard.
// Empty input returns empty.
func MaskPhone(s, level string) string {
    if s == "" || level == PIIRelaxed {
        return s
    }
    if len(s) <= 2 {
        return s
    }
    var b strings.Builder
    digits := 0
    for _, r := range s {
        if unicode.IsDigit(r) {
            digits++
        }
    }
    if digits <= 2 {
        return s
    }
    keep := digits - 2
    seen := 0
    for _, r := range s {
        if unicode.IsDigit(r) {
            seen++
            if seen > 1 && seen <= keep {
                b.WriteRune('X')
                continue
            }
        }
        b.WriteRune(r)
    }
    return b.String()
}

// MaskEmail keeps first char of local part, masks the rest, keeps domain.
func MaskEmail(s, level string) string {
    if s == "" || level == PIIRelaxed {
        return s
    }
    at := strings.LastIndex(s, "@")
    if at <= 0 {
        return s
    }
    local := s[:at]
    domain := s[at:]
    if len(local) <= 1 {
        return local + "***" + domain
    }
    return string(local[0]) + "***" + domain
}

// MaskFullName returns initials in strict mode, original otherwise.
// "Jane Doe" → "J. D.", "Иван Иванов Петрович" → "И. И. П.", "Cher" → "C.".
func MaskFullName(s, level string) string {
    if level != PIIStrict || strings.TrimSpace(s) == "" {
        return s
    }
    parts := strings.Fields(s)
    out := make([]string, 0, len(parts))
    for _, p := range parts {
        if p == "" {
            continue
        }
        runes := []rune(p)
        out = append(out, string(unicode.ToUpper(runes[0]))+".")
    }
    return strings.Join(out, " ")
}

// MaskMap walks a map[string]any and applies field-name-keyed masking.
// Recurses into nested maps. Slices of maps are walked element-wise.
// Phase 3 replaces this with a struct-tag walker.
var piiKeyHandlers = map[string]func(string, string) string{
    "phone":      MaskPhone,
    "email":      MaskEmail,
    "name":       MaskFullName,
    "fullName":   MaskFullName,
    "full_name":  MaskFullName,
    "visitorPhone": MaskPhone,
    "visitorEmail": MaskEmail,
    "visitorName":  MaskFullName,
}

func MaskMap(m map[string]any, level string) map[string]any {
    if m == nil || level == PIIRelaxed {
        return m
    }
    out := make(map[string]any, len(m))
    for k, v := range m {
        switch vv := v.(type) {
        case string:
            if h, ok := piiKeyHandlers[k]; ok {
                out[k] = h(vv, level)
            } else {
                out[k] = vv
            }
        case map[string]any:
            out[k] = MaskMap(vv, level)
        case []any:
            out[k] = maskSlice(vv, level)
        default:
            out[k] = vv
        }
    }
    return out
}

func maskSlice(in []any, level string) []any {
    out := make([]any, len(in))
    for i, v := range in {
        switch vv := v.(type) {
        case map[string]any:
            out[i] = MaskMap(vv, level)
        case []any:
            out[i] = maskSlice(vv, level)
        default:
            out[i] = vv
        }
    }
    return out
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestMask -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/pii.go apps/backend/internal/copilot/tools/pii_test.go
git commit -m "feat(copilot): add basic PII masking helpers"
```

---

## Task 7: LLM gateway types and interface

**Files:**
- Create: `apps/backend/internal/copilot/gateway/types.go`
- Create: `apps/backend/internal/copilot/gateway/provider.go`
- Create: `apps/backend/internal/copilot/gateway/pricing.go`

No tests in this task — pure type definitions exercised by Task 8 (Anthropic adapter).

- [ ] **Step 1: Write `types.go`**

Create `apps/backend/internal/copilot/gateway/types.go`:

```go
package gateway

import "encoding/json"

// ChatMessage is a single turn in the conversation as the LLM sees it.
type ChatMessage struct {
    Role    string          `json:"role"`              // user | assistant | tool
    Content json.RawMessage `json:"content"`           // text or array of content blocks
}

// ToolDefinition describes a tool to the LLM.
type ToolDefinition struct {
    Name        string          `json:"name"`
    Description string          `json:"description"`
    InputSchema json.RawMessage `json:"input_schema"`  // JSON Schema
}

// ToolChoice controls how the LLM selects tools.
type ToolChoice struct {
    Type string `json:"type"`               // auto | any | tool | none
    Name string `json:"name,omitempty"`     // when Type == "tool"
}

// ToolCall is what the LLM emitted: a tool name + serialized JSON args.
type ToolCall struct {
    ID    string          `json:"id"`
    Name  string          `json:"name"`
    Input json.RawMessage `json:"input"`
}

// ToolResult is what the agent loop sends back after dispatching a tool.
type ToolResult struct {
    ToolUseID string          `json:"tool_use_id"`
    Content   json.RawMessage `json:"content"`
    IsError   bool            `json:"is_error,omitempty"`
}

// CreateMessageRequest is the gateway-agnostic request payload.
type CreateMessageRequest struct {
    Model       string
    System      string
    Messages    []ChatMessage
    Tools       []ToolDefinition
    ToolChoice  ToolChoice
    MaxTokens   int
    Temperature *float32
    Stop        []string
    Metadata    map[string]string
}

// Usage reports token consumption per provider response.
type Usage struct {
    InputTokens  int
    OutputTokens int
}

// Message is a single non-streaming response from the LLM.
type Message struct {
    StopReason string
    Text       string
    ToolCalls  []ToolCall
    Usage      Usage
    Provider   string
    Model      string
}

// ProviderFeatures advertises optional capabilities.
type ProviderFeatures struct {
    SupportsTools     bool
    SupportsStreaming bool
    SupportsEmbedding bool
    MaxContextTokens  int
}
```

- [ ] **Step 2: Write `provider.go`**

Create `apps/backend/internal/copilot/gateway/provider.go`:

```go
package gateway

import "context"

// LLMProvider is the gateway-agnostic interface; one implementation per LLM vendor.
type LLMProvider interface {
    Name() string
    CreateMessage(ctx context.Context, req CreateMessageRequest) (*Message, error)
    StreamMessage(ctx context.Context, req CreateMessageRequest, sink StreamSink) error
    Embed(ctx context.Context, texts []string) ([][]float32, error)
    SupportedFeatures() ProviderFeatures
}

// StreamSink receives provider-emitted events.
// Implementations are expected to be cheap and non-blocking.
type StreamSink interface {
    OnTextDelta(delta string)
    OnToolCall(call ToolCall)
    OnComplete(usage Usage, stopReason string)
    OnError(err error)
}
```

- [ ] **Step 3: Write `pricing.go`**

Create `apps/backend/internal/copilot/gateway/pricing.go`:

```go
package gateway

// Per-provider, per-model pricing in USD micros (1_000_000 = $1) per million tokens.
// Phase 1 ships Anthropic only; Phase 2 adds Yandex/GigaChat rows.
var pricingTable = map[string]map[string]struct {
    InputUSDMicrosPerMillionTokens  int
    OutputUSDMicrosPerMillionTokens int
}{
    "anthropic": {
        "claude-sonnet-4-6":  {InputUSDMicrosPerMillionTokens: 3_000_000, OutputUSDMicrosPerMillionTokens: 15_000_000},
        "claude-opus-4-7":    {InputUSDMicrosPerMillionTokens: 15_000_000, OutputUSDMicrosPerMillionTokens: 75_000_000},
        "claude-haiku-4-5":   {InputUSDMicrosPerMillionTokens: 1_000_000,  OutputUSDMicrosPerMillionTokens: 5_000_000},
    },
}

// EstimateCostUSDx10000 returns cost in USD micros (1_000_000 = $1).
// Returns 0 for unknown providers/models so callers can show "—" instead of failing.
func EstimateCostUSDx10000(provider, model string, usage Usage) int {
    p, ok := pricingTable[provider]
    if !ok {
        return 0
    }
    rate, ok := p[model]
    if !ok {
        return 0
    }
    in := int64(usage.InputTokens) * int64(rate.InputUSDMicrosPerMillionTokens) / 1_000_000
    out := int64(usage.OutputTokens) * int64(rate.OutputUSDMicrosPerMillionTokens) / 1_000_000
    return int(in + out)
}
```

- [ ] **Step 4: Verify compile**

Run: `cd apps/backend && go build ./internal/copilot/gateway/`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/gateway/types.go apps/backend/internal/copilot/gateway/provider.go apps/backend/internal/copilot/gateway/pricing.go
git commit -m "feat(copilot): add LLM gateway types, provider interface, pricing table"
```

---

## Task 8: Anthropic adapter

**Files:**
- Create: `apps/backend/internal/copilot/gateway/anthropic.go`
- Create: `apps/backend/internal/copilot/gateway/anthropic_test.go`

This task uses an HTTP-mock contract test rather than the real Anthropic SDK to keep tests offline. The implementation goes against `https://api.anthropic.com/v1/messages` directly with a configurable transport. (Switching to the official SDK is fine later; the test contract stays.)

- [ ] **Step 1: Write failing contract test**

Create `apps/backend/internal/copilot/gateway/anthropic_test.go`:

```go
package gateway

import (
    "bytes"
    "context"
    "encoding/json"
    "io"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func TestAnthropic_CreateMessage_TextOnly(t *testing.T) {
    t.Parallel()
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path != "/v1/messages" {
            t.Errorf("unexpected path: %s", r.URL.Path)
        }
        if r.Header.Get("X-Api-Key") == "" {
            t.Error("X-Api-Key header missing")
        }
        if r.Header.Get("Anthropic-Version") == "" {
            t.Error("Anthropic-Version header missing")
        }
        body, _ := io.ReadAll(r.Body)
        var req map[string]any
        _ = json.Unmarshal(body, &req)
        if req["model"] != "claude-sonnet-4-6" {
            t.Errorf("model not propagated: %v", req["model"])
        }
        resp := map[string]any{
            "id":    "msg_1",
            "type":  "message",
            "role":  "assistant",
            "model": "claude-sonnet-4-6",
            "content": []map[string]any{
                {"type": "text", "text": "Hello!"},
            },
            "stop_reason": "end_turn",
            "usage":       map[string]any{"input_tokens": 11, "output_tokens": 4},
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(resp)
    }))
    defer srv.Close()

    p := NewAnthropic(AnthropicConfig{APIKey: "test", BaseURL: srv.URL, DefaultModel: "claude-sonnet-4-6"})
    out, err := p.CreateMessage(context.Background(), CreateMessageRequest{
        Model:     "claude-sonnet-4-6",
        System:    "you are helpful",
        Messages:  []ChatMessage{{Role: "user", Content: json.RawMessage(`"Hi there"`)}},
        MaxTokens: 1024,
    })
    if err != nil {
        t.Fatalf("CreateMessage error: %v", err)
    }
    if out.Text != "Hello!" {
        t.Errorf("text mismatch: %q", out.Text)
    }
    if out.Usage.InputTokens != 11 || out.Usage.OutputTokens != 4 {
        t.Errorf("usage mismatch: %+v", out.Usage)
    }
    if out.StopReason != "end_turn" {
        t.Errorf("stop reason: %q", out.StopReason)
    }
}

func TestAnthropic_CreateMessage_WithToolUse(t *testing.T) {
    t.Parallel()
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        body, _ := io.ReadAll(r.Body)
        if !bytes.Contains(body, []byte(`"name":"list_units"`)) {
            t.Errorf("tool definition not propagated: %s", body)
        }
        resp := map[string]any{
            "id":    "msg_2",
            "type":  "message",
            "role":  "assistant",
            "model": "claude-sonnet-4-6",
            "content": []map[string]any{
                {"type": "text", "text": "Let me check."},
                {"type": "tool_use", "id": "tu_1", "name": "list_units", "input": map[string]any{}},
            },
            "stop_reason": "tool_use",
            "usage":       map[string]any{"input_tokens": 50, "output_tokens": 12},
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(resp)
    }))
    defer srv.Close()

    p := NewAnthropic(AnthropicConfig{APIKey: "test", BaseURL: srv.URL, DefaultModel: "claude-sonnet-4-6"})
    out, err := p.CreateMessage(context.Background(), CreateMessageRequest{
        Model:    "claude-sonnet-4-6",
        Messages: []ChatMessage{{Role: "user", Content: json.RawMessage(`"What units exist?"`)}},
        Tools: []ToolDefinition{
            {Name: "list_units", Description: "List units", InputSchema: json.RawMessage(`{"type":"object"}`)},
        },
        MaxTokens: 1024,
    })
    if err != nil {
        t.Fatalf("CreateMessage error: %v", err)
    }
    if len(out.ToolCalls) != 1 || out.ToolCalls[0].Name != "list_units" {
        t.Fatalf("tool calls: %+v", out.ToolCalls)
    }
    if out.StopReason != "tool_use" {
        t.Errorf("stop reason: %q", out.StopReason)
    }
}

func TestAnthropic_StreamMessage_EmitsTextDeltasAndToolUse(t *testing.T) {
    t.Parallel()
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/event-stream")
        f := w.(http.Flusher)
        // Anthropic SSE wire format (simplified subset).
        events := []string{
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_3\",\"model\":\"claude-sonnet-4-6\",\"usage\":{\"input_tokens\":7,\"output_tokens\":0}}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" there\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":3}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        }
        for _, e := range events {
            _, _ = io.WriteString(w, e)
            f.Flush()
        }
    }))
    defer srv.Close()

    var deltas strings.Builder
    var stopReason string
    var usage Usage
    sink := stubSink{
        text:     func(s string) { deltas.WriteString(s) },
        complete: func(u Usage, sr string) { usage = u; stopReason = sr },
    }
    p := NewAnthropic(AnthropicConfig{APIKey: "test", BaseURL: srv.URL, DefaultModel: "claude-sonnet-4-6"})
    if err := p.StreamMessage(context.Background(), CreateMessageRequest{
        Model:    "claude-sonnet-4-6",
        Messages: []ChatMessage{{Role: "user", Content: json.RawMessage(`"hello"`)}},
        MaxTokens: 1024,
    }, sink); err != nil {
        t.Fatal(err)
    }
    if deltas.String() != "Hi there" {
        t.Errorf("deltas: %q", deltas.String())
    }
    if stopReason != "end_turn" {
        t.Errorf("stop: %q", stopReason)
    }
    if usage.InputTokens != 7 || usage.OutputTokens != 3 {
        t.Errorf("usage: %+v", usage)
    }
}

type stubSink struct {
    text     func(string)
    tool     func(ToolCall)
    complete func(Usage, string)
    err      func(error)
}

func (s stubSink) OnTextDelta(d string)              { if s.text != nil { s.text(d) } }
func (s stubSink) OnToolCall(c ToolCall)             { if s.tool != nil { s.tool(c) } }
func (s stubSink) OnComplete(u Usage, sr string)     { if s.complete != nil { s.complete(u, sr) } }
func (s stubSink) OnError(e error)                   { if s.err != nil { s.err(e) } }
```

- [ ] **Step 2: Verify tests fail**

Run: `cd apps/backend && go test ./internal/copilot/gateway/ -run TestAnthropic -v`
Expected: FAIL — `undefined: NewAnthropic`.

- [ ] **Step 3: Implement the adapter**

Create `apps/backend/internal/copilot/gateway/anthropic.go`:

```go
package gateway

import (
    "bufio"
    "bytes"
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "strings"
    "time"
)

const anthropicAPIVersion = "2023-06-01"

type AnthropicConfig struct {
    APIKey       string
    BaseURL      string // default: https://api.anthropic.com
    DefaultModel string
    HTTPClient   *http.Client
}

type anthropicProvider struct {
    cfg AnthropicConfig
    hc  *http.Client
}

func NewAnthropic(cfg AnthropicConfig) LLMProvider {
    if cfg.BaseURL == "" {
        cfg.BaseURL = "https://api.anthropic.com"
    }
    hc := cfg.HTTPClient
    if hc == nil {
        hc = &http.Client{Timeout: 90 * time.Second}
    }
    return &anthropicProvider{cfg: cfg, hc: hc}
}

func (p *anthropicProvider) Name() string { return "anthropic" }

func (p *anthropicProvider) SupportedFeatures() ProviderFeatures {
    return ProviderFeatures{
        SupportsTools:     true,
        SupportsStreaming: true,
        SupportsEmbedding: false,
        MaxContextTokens:  200_000,
    }
}

// payload mirrors Anthropic's /v1/messages request body.
type anthropicReq struct {
    Model       string                  `json:"model"`
    System      string                  `json:"system,omitempty"`
    Messages    []anthropicMsg          `json:"messages"`
    Tools       []anthropicTool         `json:"tools,omitempty"`
    ToolChoice  *anthropicToolChoice    `json:"tool_choice,omitempty"`
    MaxTokens   int                     `json:"max_tokens"`
    Temperature *float32                `json:"temperature,omitempty"`
    Stop        []string                `json:"stop_sequences,omitempty"`
    Stream      bool                    `json:"stream,omitempty"`
    Metadata    map[string]string       `json:"metadata,omitempty"`
}

type anthropicMsg struct {
    Role    string          `json:"role"`
    Content json.RawMessage `json:"content"`
}

type anthropicTool struct {
    Name        string          `json:"name"`
    Description string          `json:"description,omitempty"`
    InputSchema json.RawMessage `json:"input_schema"`
}

type anthropicToolChoice struct {
    Type string `json:"type"`
    Name string `json:"name,omitempty"`
}

type anthropicResp struct {
    ID         string             `json:"id"`
    Model      string             `json:"model"`
    StopReason string             `json:"stop_reason"`
    Content    []anthropicContent `json:"content"`
    Usage      anthropicUsage     `json:"usage"`
    Type       string             `json:"type"`
    Error      *anthropicError    `json:"error,omitempty"`
}

type anthropicContent struct {
    Type  string          `json:"type"`
    Text  string          `json:"text,omitempty"`
    ID    string          `json:"id,omitempty"`
    Name  string          `json:"name,omitempty"`
    Input json.RawMessage `json:"input,omitempty"`
}

type anthropicUsage struct {
    InputTokens  int `json:"input_tokens"`
    OutputTokens int `json:"output_tokens"`
}

type anthropicError struct {
    Type    string `json:"type"`
    Message string `json:"message"`
}

func (p *anthropicProvider) buildRequest(req CreateMessageRequest, stream bool) anthropicReq {
    model := req.Model
    if model == "" {
        model = p.cfg.DefaultModel
    }
    out := anthropicReq{
        Model:       model,
        System:      req.System,
        MaxTokens:   req.MaxTokens,
        Temperature: req.Temperature,
        Stop:        req.Stop,
        Stream:      stream,
        Metadata:    req.Metadata,
    }
    out.Messages = make([]anthropicMsg, len(req.Messages))
    for i, m := range req.Messages {
        out.Messages[i] = anthropicMsg{Role: m.Role, Content: m.Content}
    }
    if len(req.Tools) > 0 {
        out.Tools = make([]anthropicTool, len(req.Tools))
        for i, t := range req.Tools {
            out.Tools[i] = anthropicTool{Name: t.Name, Description: t.Description, InputSchema: t.InputSchema}
        }
    }
    if req.ToolChoice.Type != "" {
        out.ToolChoice = &anthropicToolChoice{Type: req.ToolChoice.Type, Name: req.ToolChoice.Name}
    }
    return out
}

func (p *anthropicProvider) sendHTTP(ctx context.Context, body any, stream bool) (*http.Response, error) {
    raw, err := json.Marshal(body)
    if err != nil {
        return nil, err
    }
    httpReq, err := http.NewRequestWithContext(ctx, "POST", p.cfg.BaseURL+"/v1/messages", bytes.NewReader(raw))
    if err != nil {
        return nil, err
    }
    httpReq.Header.Set("X-Api-Key", p.cfg.APIKey)
    httpReq.Header.Set("Anthropic-Version", anthropicAPIVersion)
    httpReq.Header.Set("Content-Type", "application/json")
    if stream {
        httpReq.Header.Set("Accept", "text/event-stream")
    }
    return p.hc.Do(httpReq)
}

func (p *anthropicProvider) CreateMessage(ctx context.Context, req CreateMessageRequest) (*Message, error) {
    body := p.buildRequest(req, false)
    resp, err := p.sendHTTP(ctx, body, false)
    if err != nil {
        return nil, fmt.Errorf("anthropic transport: %w", err)
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 400 {
        b, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("anthropic %d: %s", resp.StatusCode, string(b))
    }
    var out anthropicResp
    if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
        return nil, fmt.Errorf("anthropic decode: %w", err)
    }
    if out.Error != nil {
        return nil, fmt.Errorf("anthropic %s: %s", out.Error.Type, out.Error.Message)
    }
    msg := &Message{
        StopReason: out.StopReason,
        Usage:      Usage{InputTokens: out.Usage.InputTokens, OutputTokens: out.Usage.OutputTokens},
        Provider:   "anthropic",
        Model:      out.Model,
    }
    var textParts []string
    for _, c := range out.Content {
        switch c.Type {
        case "text":
            textParts = append(textParts, c.Text)
        case "tool_use":
            msg.ToolCalls = append(msg.ToolCalls, ToolCall{ID: c.ID, Name: c.Name, Input: c.Input})
        }
    }
    msg.Text = strings.Join(textParts, "")
    return msg, nil
}

func (p *anthropicProvider) StreamMessage(ctx context.Context, req CreateMessageRequest, sink StreamSink) error {
    body := p.buildRequest(req, true)
    resp, err := p.sendHTTP(ctx, body, true)
    if err != nil {
        sink.OnError(err)
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 400 {
        b, _ := io.ReadAll(resp.Body)
        e := fmt.Errorf("anthropic %d: %s", resp.StatusCode, string(b))
        sink.OnError(e)
        return e
    }
    return p.consumeSSE(resp.Body, sink)
}

type sseEvent struct {
    Event string
    Data  string
}

func (p *anthropicProvider) consumeSSE(r io.Reader, sink StreamSink) error {
    scanner := bufio.NewScanner(r)
    scanner.Buffer(make([]byte, 1024*1024), 4*1024*1024)
    var (
        currentEvent string
        dataBuf      strings.Builder
        usage        Usage
        stopReason   string
        toolBlocks   = map[int]*ToolCall{} // index → partial tool_use
    )
    flush := func() {
        if currentEvent == "" || dataBuf.Len() == 0 {
            currentEvent = ""
            dataBuf.Reset()
            return
        }
        data := dataBuf.String()
        dataBuf.Reset()
        ev := currentEvent
        currentEvent = ""
        switch ev {
        case "message_start":
            var v struct {
                Message struct {
                    Usage anthropicUsage `json:"usage"`
                } `json:"message"`
            }
            if err := json.Unmarshal([]byte(data), &v); err == nil {
                usage.InputTokens = v.Message.Usage.InputTokens
            }
        case "content_block_start":
            var v struct {
                Index        int `json:"index"`
                ContentBlock struct {
                    Type  string          `json:"type"`
                    ID    string          `json:"id,omitempty"`
                    Name  string          `json:"name,omitempty"`
                    Input json.RawMessage `json:"input,omitempty"`
                } `json:"content_block"`
            }
            if err := json.Unmarshal([]byte(data), &v); err == nil && v.ContentBlock.Type == "tool_use" {
                toolBlocks[v.Index] = &ToolCall{ID: v.ContentBlock.ID, Name: v.ContentBlock.Name, Input: v.ContentBlock.Input}
            }
        case "content_block_delta":
            var v struct {
                Index int `json:"index"`
                Delta struct {
                    Type        string `json:"type"`
                    Text        string `json:"text,omitempty"`
                    PartialJSON string `json:"partial_json,omitempty"`
                } `json:"delta"`
            }
            if err := json.Unmarshal([]byte(data), &v); err == nil {
                switch v.Delta.Type {
                case "text_delta":
                    sink.OnTextDelta(v.Delta.Text)
                case "input_json_delta":
                    if tb, ok := toolBlocks[v.Index]; ok {
                        tb.Input = json.RawMessage(string(tb.Input) + v.Delta.PartialJSON)
                    }
                }
            }
        case "content_block_stop":
            var v struct {
                Index int `json:"index"`
            }
            if err := json.Unmarshal([]byte(data), &v); err == nil {
                if tb, ok := toolBlocks[v.Index]; ok {
                    sink.OnToolCall(*tb)
                    delete(toolBlocks, v.Index)
                }
            }
        case "message_delta":
            var v struct {
                Delta struct {
                    StopReason string `json:"stop_reason"`
                } `json:"delta"`
                Usage anthropicUsage `json:"usage"`
            }
            if err := json.Unmarshal([]byte(data), &v); err == nil {
                if v.Delta.StopReason != "" {
                    stopReason = v.Delta.StopReason
                }
                usage.OutputTokens = v.Usage.OutputTokens
            }
        case "message_stop":
            sink.OnComplete(usage, stopReason)
        case "error":
            var v struct {
                Error anthropicError `json:"error"`
            }
            _ = json.Unmarshal([]byte(data), &v)
            sink.OnError(fmt.Errorf("anthropic stream %s: %s", v.Error.Type, v.Error.Message))
        }
    }
    for scanner.Scan() {
        line := scanner.Text()
        if line == "" {
            flush()
            continue
        }
        if strings.HasPrefix(line, "event: ") {
            currentEvent = strings.TrimPrefix(line, "event: ")
            continue
        }
        if strings.HasPrefix(line, "data: ") {
            if dataBuf.Len() > 0 {
                dataBuf.WriteByte('\n')
            }
            dataBuf.WriteString(strings.TrimPrefix(line, "data: "))
        }
    }
    flush()
    if err := scanner.Err(); err != nil && !errors.Is(err, io.EOF) {
        return err
    }
    return nil
}

func (p *anthropicProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
    return nil, errors.New("anthropic: embeddings not supported by this provider; configure separate embedder")
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/gateway/ -run TestAnthropic -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/gateway/anthropic.go apps/backend/internal/copilot/gateway/anthropic_test.go
git commit -m "feat(copilot): add Anthropic provider adapter with streaming"
```

---

## Task 9: Tool registry, types, and RBAC guard

**Files:**
- Create: `apps/backend/internal/copilot/tools/types.go`
- Create: `apps/backend/internal/copilot/tools/registry.go`
- Create: `apps/backend/internal/copilot/tools/registry_test.go`
- Create: `apps/backend/internal/copilot/tools/rbac.go`

- [ ] **Step 1: Write failing registry tests**

Create `apps/backend/internal/copilot/tools/registry_test.go`:

```go
package tools

import (
    "context"
    "encoding/json"
    "errors"
    "testing"
)

func TestRegistry_RegisterAndDispatch(t *testing.T) {
    t.Parallel()
    reg := NewRegistry()
    reg.Register(&Tool{
        Name:           "echo",
        Description:    "echoes input.text",
        Schema:         json.RawMessage(`{"type":"object","properties":{"text":{"type":"string"}}}`),
        RequiredScopes: []string{"copilot:use"},
        Handler: func(ctx ToolCtx, args json.RawMessage) (Result, error) {
            return Result{Content: args}, nil
        },
    })
    out, err := reg.Dispatch(context.Background(), ToolCtx{
        CompanyID: "c1", UserID: "u1", Roles: []string{"copilot:use"},
    }, "echo", json.RawMessage(`{"text":"hi"}`))
    if err != nil {
        t.Fatal(err)
    }
    if string(out.Content) != `{"text":"hi"}` {
        t.Errorf("content: %s", out.Content)
    }
}

func TestRegistry_RBACDenial(t *testing.T) {
    t.Parallel()
    reg := NewRegistry()
    reg.Register(&Tool{
        Name:           "secret",
        RequiredScopes: []string{"admin"},
        Handler:        func(ToolCtx, json.RawMessage) (Result, error) { return Result{}, nil },
    })
    _, err := reg.Dispatch(context.Background(), ToolCtx{Roles: []string{"viewer"}}, "secret", json.RawMessage(`{}`))
    if !errors.Is(err, ErrRBACDenied) {
        t.Fatalf("expected ErrRBACDenied, got %v", err)
    }
}

func TestRegistry_UnknownTool(t *testing.T) {
    t.Parallel()
    reg := NewRegistry()
    _, err := reg.Dispatch(context.Background(), ToolCtx{}, "nope", json.RawMessage(`{}`))
    if !errors.Is(err, ErrToolNotFound) {
        t.Fatalf("expected ErrToolNotFound, got %v", err)
    }
}

func TestRegistry_FilterByScope(t *testing.T) {
    t.Parallel()
    reg := NewRegistry()
    reg.Register(&Tool{Name: "free", Handler: passthrough})
    reg.Register(&Tool{Name: "guarded", RequiredScopes: []string{"admin"}, Handler: passthrough})
    visible := reg.Filter([]string{"viewer"})
    if len(visible) != 1 || visible[0].Name != "free" {
        t.Fatalf("unexpected filter: %+v", visible)
    }
}

func passthrough(ctx ToolCtx, args json.RawMessage) (Result, error) {
    return Result{Content: args}, nil
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestRegistry -v`
Expected: FAIL.

- [ ] **Step 3: Implement types and registry**

Create `apps/backend/internal/copilot/tools/types.go`:

```go
package tools

import (
    "encoding/json"
    "time"
)

type Tool struct {
    Name           string
    Description    string
    Schema         json.RawMessage // JSON Schema for args
    RequiredScopes []string        // RBAC; ToolCtx.Roles must include at least one
    Handler        func(ctx ToolCtx, args json.RawMessage) (Result, error)
    RateLimit      Limit
}

type ToolCtx struct {
    CompanyID string
    UserID    string
    Roles     []string
    ThreadID  string
    RequestID string
    Locale    string
    PIILevel  string
}

type Result struct {
    Content    json.RawMessage // JSON for the LLM
    Citations  []Citation
    Truncated  bool
    DurationMs int
}

type Citation struct {
    ToolName string `json:"toolName"`
    Ref      string `json:"ref"`
    Title    string `json:"title,omitempty"`
}

type Limit struct {
    PerUserPerMinute int
    PerToolPerMinute int
    Timeout          time.Duration
}
```

Create `apps/backend/internal/copilot/tools/registry.go`:

```go
package tools

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "sync"
    "time"
)

var (
    ErrToolNotFound = errors.New("copilot: tool not found")
    ErrRBACDenied   = errors.New("copilot: rbac denied")
)

type Registry struct {
    mu    sync.RWMutex
    tools map[string]*Tool
}

func NewRegistry() *Registry { return &Registry{tools: map[string]*Tool{}} }

func (r *Registry) Register(t *Tool) {
    if t == nil || t.Name == "" || t.Handler == nil {
        panic("copilot: invalid tool registration")
    }
    r.mu.Lock()
    defer r.mu.Unlock()
    r.tools[t.Name] = t
}

func (r *Registry) Filter(roles []string) []*Tool {
    r.mu.RLock()
    defer r.mu.RUnlock()
    out := make([]*Tool, 0, len(r.tools))
    for _, t := range r.tools {
        if hasAnyScope(roles, t.RequiredScopes) {
            out = append(out, t)
        }
    }
    return out
}

func (r *Registry) Dispatch(ctx context.Context, tctx ToolCtx, name string, args json.RawMessage) (Result, error) {
    r.mu.RLock()
    t, ok := r.tools[name]
    r.mu.RUnlock()
    if !ok {
        return Result{}, fmt.Errorf("%w: %s", ErrToolNotFound, name)
    }
    if !hasAnyScope(tctx.Roles, t.RequiredScopes) {
        return Result{}, fmt.Errorf("%w: %s requires %v", ErrRBACDenied, name, t.RequiredScopes)
    }
    started := time.Now()
    out, err := t.Handler(tctx, args)
    out.DurationMs = int(time.Since(started) / time.Millisecond)
    return out, err
}
```

Create `apps/backend/internal/copilot/tools/rbac.go`:

```go
package tools

// hasAnyScope returns true when:
//   - the tool requires no scopes, or
//   - the caller has at least one of the required scopes.
func hasAnyScope(callerRoles, requiredScopes []string) bool {
    if len(requiredScopes) == 0 {
        return true
    }
    have := make(map[string]struct{}, len(callerRoles))
    for _, r := range callerRoles {
        have[r] = struct{}{}
    }
    for _, s := range requiredScopes {
        if _, ok := have[s]; ok {
            return true
        }
    }
    return false
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestRegistry -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/types.go apps/backend/internal/copilot/tools/registry.go apps/backend/internal/copilot/tools/rbac.go apps/backend/internal/copilot/tools/registry_test.go
git commit -m "feat(copilot): add tool registry with RBAC filtering and dispatch"
```

---

## Task 10: Tool `list_units`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_list_units.go`
- Create: `apps/backend/internal/copilot/tools/tool_list_units_test.go`

The tool exposes the smallest possible interface (`UnitLister`) so the test can substitute a fake without standing up gorm. The interface is satisfied by an adapter in `cmd/api` that wraps `repository.UnitRepository`.

- [ ] **Step 1: Write failing test**

Create `apps/backend/internal/copilot/tools/tool_list_units_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

type fakeUnitLister struct {
	units []UnitSummary
	err   error
}

func (f *fakeUnitLister) ListUnits(ctx context.Context, companyID string, search, region string) ([]UnitSummary, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.units, nil
}

func TestListUnitsTool_HappyPath(t *testing.T) {
	t.Parallel()
	lister := &fakeUnitLister{units: []UnitSummary{
		{ID: "u1", Name: "Almaty", Region: "KZ", Active: true},
		{ID: "u2", Name: "Astana", Region: "KZ", Active: true},
	}}
	tool := NewListUnitsTool(lister)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"unit:read"}}, json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Units []UnitSummary `json:"units"`
	}
	if err := json.Unmarshal(out.Content, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Units) != 2 {
		t.Fatalf("expected 2 units, got %d", len(parsed.Units))
	}
}

func TestListUnitsTool_FilterPropagated(t *testing.T) {
	t.Parallel()
	captured := struct{ search, region string }{}
	lister := &fakeUnitListerCapture{onCall: func(s, r string) {
		captured.search = s
		captured.region = r
	}}
	tool := NewListUnitsTool(lister)
	if _, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"unit:read"}}, json.RawMessage(`{"filter":{"search":"alm","region":"KZ"}}`)); err != nil {
		t.Fatal(err)
	}
	if captured.search != "alm" || captured.region != "KZ" {
		t.Fatalf("filter not propagated: %+v", captured)
	}
}

func TestListUnitsTool_HandlerErrorBubbles(t *testing.T) {
	t.Parallel()
	tool := NewListUnitsTool(&fakeUnitLister{err: errors.New("db down")})
	if _, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"unit:read"}}, json.RawMessage(`{}`)); err == nil {
		t.Fatal("expected error to bubble up")
	}
}

type fakeUnitListerCapture struct {
	onCall func(search, region string)
}

func (f *fakeUnitListerCapture) ListUnits(ctx context.Context, companyID string, search, region string) ([]UnitSummary, error) {
	if f.onCall != nil {
		f.onCall(search, region)
	}
	return nil, nil
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestListUnits -v`
Expected: FAIL — `undefined: NewListUnitsTool`.

- [ ] **Step 3: Implement the tool**

Create `apps/backend/internal/copilot/tools/tool_list_units.go`:

```go
package tools

import (
	"context"
	"encoding/json"
)

// UnitSummary is the per-unit row returned to the LLM.
type UnitSummary struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Region string `json:"region,omitempty"`
	Active bool   `json:"active"`
}

// UnitLister is the abstraction the tool depends on; cmd/api wires a real adapter.
type UnitLister interface {
	ListUnits(ctx context.Context, companyID string, search, region string) ([]UnitSummary, error)
}

func NewListUnitsTool(lister UnitLister) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"filter":{
				"type":"object",
				"properties":{
					"search":{"type":"string"},
					"region":{"type":"string"}
				}
			}
		},
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "list_units",
		Description:    "List units (branches/locations) the user has access to. Optional filter by search substring or region code.",
		Schema:         schema,
		RequiredScopes: []string{"unit:read", "stats:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				Filter struct {
					Search string `json:"search"`
					Region string `json:"region"`
				} `json:"filter"`
			}
			if len(args) > 0 && string(args) != "null" {
				if err := json.Unmarshal(args, &in); err != nil {
					return Result{}, err
				}
			}
			// Per-tool timeouts are enforced by agent.policy via the parent context;
			// the handler does not impose its own (Phase 2 plumbs ctx through ToolCtx).
			ctx := context.Background()
			units, err := lister.ListUnits(ctx, tctx.CompanyID, in.Filter.Search, in.Filter.Region)
			if err != nil {
				return Result{}, err
			}
			out, err := json.Marshal(struct {
				Units []UnitSummary `json:"units"`
			}{Units: units})
			if err != nil {
				return Result{}, err
			}
			return Result{Content: out}, nil
		},
	}
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestListUnits -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_list_units.go apps/backend/internal/copilot/tools/tool_list_units_test.go
git commit -m "feat(copilot): add list_units tool"
```

---

## Task 11: Tool `get_unit_summary`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_get_unit_summary.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_unit_summary_test.go`

- [ ] **Step 1: Write failing test**

Create `apps/backend/internal/copilot/tools/tool_get_unit_summary_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type fakeSummaryProvider struct {
	gotUnit string
	gotFrom time.Time
	gotTo   time.Time
	resp    UnitSummaryStats
}

func (f *fakeSummaryProvider) GetUnitSummary(ctx context.Context, companyID, unitID string, from, to time.Time) (UnitSummaryStats, error) {
	f.gotUnit = unitID
	f.gotFrom = from
	f.gotTo = to
	return f.resp, nil
}

func TestGetUnitSummaryTool_RoundTrip(t *testing.T) {
	t.Parallel()
	p := &fakeSummaryProvider{resp: UnitSummaryStats{
		AvgWaitSec:   180,
		P95WaitSec:   600,
		ThroughputPerHour: 22,
		SLAHitRate:   0.92,
		Served:       550,
		Abandoned:    13,
		AsOf:         time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC),
	}}
	tool := NewGetUnitSummaryTool(p)

	args := json.RawMessage(`{
		"unit_id":"u1",
		"period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}
	}`)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, args)
	if err != nil {
		t.Fatal(err)
	}
	if p.gotUnit != "u1" {
		t.Errorf("unit not propagated: %q", p.gotUnit)
	}
	if !p.gotFrom.Equal(time.Date(2026, 4, 18, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("from: %v", p.gotFrom)
	}
	var parsed UnitSummaryStats
	_ = json.Unmarshal(out.Content, &parsed)
	if parsed.SLAHitRate != 0.92 {
		t.Errorf("sla rate: %v", parsed.SLAHitRate)
	}
}

func TestGetUnitSummaryTool_RequiresUnitID(t *testing.T) {
	t.Parallel()
	tool := NewGetUnitSummaryTool(&fakeSummaryProvider{})
	if _, err := tool.Handler(ToolCtx{Roles: []string{"stats:read"}}, json.RawMessage(`{"period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}}`)); err == nil {
		t.Fatal("expected error when unit_id missing")
	}
}

func TestGetUnitSummaryTool_RequiresValidDates(t *testing.T) {
	t.Parallel()
	tool := NewGetUnitSummaryTool(&fakeSummaryProvider{})
	if _, err := tool.Handler(ToolCtx{Roles: []string{"stats:read"}}, json.RawMessage(`{"unit_id":"u1","period":{"from":"BAD","to":"2026-04-25T00:00:00Z"}}`)); err == nil {
		t.Fatal("expected error on bad date")
	}
}
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestGetUnitSummary -v`
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

Create `apps/backend/internal/copilot/tools/tool_get_unit_summary.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// UnitSummaryStats is the LLM-facing payload.
type UnitSummaryStats struct {
	AvgWaitSec        int       `json:"avgWaitSec"`
	P95WaitSec        int       `json:"p95WaitSec"`
	ThroughputPerHour int       `json:"throughputPerHour"`
	SLAHitRate        float64   `json:"slaHitRate"`
	Served            int       `json:"served"`
	Abandoned         int       `json:"abandoned"`
	AsOf              time.Time `json:"asOf"`
}

// UnitSummaryProvider is the abstraction the tool calls.
type UnitSummaryProvider interface {
	GetUnitSummary(ctx context.Context, companyID, unitID string, from, to time.Time) (UnitSummaryStats, error)
}

func NewGetUnitSummaryTool(p UnitSummaryProvider) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"unit_id":{"type":"string","minLength":1},
			"period":{
				"type":"object",
				"properties":{
					"from":{"type":"string","format":"date-time"},
					"to":{"type":"string","format":"date-time"}
				},
				"required":["from","to"]
			}
		},
		"required":["unit_id","period"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "get_unit_summary",
		Description:    "Aggregate KPIs for a unit over a period: avg/p95 wait, throughput, SLA hit rate, served and abandoned counts.",
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
				return Result{}, errors.New("invalid period.from (RFC3339)")
			}
			to, err := time.Parse(time.RFC3339, in.Period.To)
			if err != nil {
				return Result{}, errors.New("invalid period.to (RFC3339)")
			}
			if !to.After(from) {
				return Result{}, errors.New("period.to must be after period.from")
			}
			out, err := p.GetUnitSummary(context.Background(), tctx.CompanyID, in.UnitID, from, to)
			if err != nil {
				return Result{}, err
			}
			content, err := json.Marshal(out)
			if err != nil {
				return Result{}, err
			}
			return Result{Content: content}, nil
		},
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestGetUnitSummary -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_get_unit_summary.go apps/backend/internal/copilot/tools/tool_get_unit_summary_test.go
git commit -m "feat(copilot): add get_unit_summary tool"
```

---

## Task 12: Tool `get_service_breakdown`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_get_service_breakdown.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_service_breakdown_test.go`

- [ ] **Step 1: Write failing test**

Create `apps/backend/internal/copilot/tools/tool_get_service_breakdown_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type fakeServiceBreakdownProvider struct {
	resp []ServiceBreakdownRow
}

func (f *fakeServiceBreakdownProvider) GetServiceBreakdown(ctx context.Context, companyID, unitID string, from, to time.Time, groupBy string) ([]ServiceBreakdownRow, error) {
	return f.resp, nil
}

func TestGetServiceBreakdownTool_HappyPath(t *testing.T) {
	t.Parallel()
	p := &fakeServiceBreakdownProvider{resp: []ServiceBreakdownRow{
		{ServiceID: "s1", ServiceName: "Cards", Served: 220, AvgWaitSec: 90, AbandonRate: 0.04},
		{ServiceID: "s2", ServiceName: "Loans", Served: 80, AvgWaitSec: 220, AbandonRate: 0.12},
	}}
	tool := NewGetServiceBreakdownTool(p)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, json.RawMessage(`{
		"unit_id":"u1",
		"period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"},
		"group_by":"service"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Rows []ServiceBreakdownRow `json:"rows"`
	}
	if err := json.Unmarshal(out.Content, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Rows) != 2 {
		t.Fatalf("rows: %+v", parsed.Rows)
	}
}

func TestGetServiceBreakdownTool_DefaultsGroupBy(t *testing.T) {
	t.Parallel()
	p := &fakeServiceBreakdownProvider{resp: nil}
	tool := NewGetServiceBreakdownTool(p)
	if _, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, json.RawMessage(`{
		"unit_id":"u1",
		"period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}
	}`)); err != nil {
		t.Fatal(err)
	}
}
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestGetServiceBreakdown -v`
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

Create `apps/backend/internal/copilot/tools/tool_get_service_breakdown.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type ServiceBreakdownRow struct {
	ServiceID    string  `json:"serviceId"`
	ServiceName  string  `json:"serviceName"`
	Served       int     `json:"served"`
	AvgWaitSec   int     `json:"avgWaitSec"`
	AbandonRate  float64 `json:"abandonRate"`
}

type ServiceBreakdownProvider interface {
	GetServiceBreakdown(ctx context.Context, companyID, unitID string, from, to time.Time, groupBy string) ([]ServiceBreakdownRow, error)
}

func NewGetServiceBreakdownTool(p ServiceBreakdownProvider) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"unit_id":{"type":"string","minLength":1},
			"period":{
				"type":"object",
				"properties":{
					"from":{"type":"string","format":"date-time"},
					"to":{"type":"string","format":"date-time"}
				},
				"required":["from","to"]
			},
			"group_by":{"type":"string","enum":["service","category"],"default":"service"}
		},
		"required":["unit_id","period"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "get_service_breakdown",
		Description:    "Per-service stats for a unit over a period: served count, avg wait, abandonment rate.",
		Schema:         schema,
		RequiredScopes: []string{"stats:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				UnitID  string `json:"unit_id"`
				Period  struct {
					From string `json:"from"`
					To   string `json:"to"`
				} `json:"period"`
				GroupBy string `json:"group_by"`
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
			if in.GroupBy == "" {
				in.GroupBy = "service"
			}
			rows, err := p.GetServiceBreakdown(context.Background(), tctx.CompanyID, in.UnitID, from, to, in.GroupBy)
			if err != nil {
				return Result{}, err
			}
			content, err := json.Marshal(struct {
				Rows []ServiceBreakdownRow `json:"rows"`
			}{Rows: rows})
			if err != nil {
				return Result{}, err
			}
			return Result{Content: content}, nil
		},
	}
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestGetServiceBreakdown -v`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_get_service_breakdown.go apps/backend/internal/copilot/tools/tool_get_service_breakdown_test.go
git commit -m "feat(copilot): add get_service_breakdown tool"
```

---

## Task 13: Tool `get_hourly_load`

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_get_hourly_load.go`
- Create: `apps/backend/internal/copilot/tools/tool_get_hourly_load_test.go`

- [ ] **Step 1: Write failing test**

Create `apps/backend/internal/copilot/tools/tool_get_hourly_load_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type fakeHourlyProvider struct{ resp []HourlyBucket }

func (f *fakeHourlyProvider) GetHourlyLoad(ctx context.Context, companyID, unitID string, day time.Time) ([]HourlyBucket, error) {
	return f.resp, nil
}

func TestGetHourlyLoadTool_HappyPath(t *testing.T) {
	t.Parallel()
	p := &fakeHourlyProvider{resp: []HourlyBucket{
		{Hour: 9, Tickets: 14, AvgWaitSec: 60},
		{Hour: 10, Tickets: 22, AvgWaitSec: 90},
	}}
	tool := NewGetHourlyLoadTool(p)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Roles: []string{"stats:read"}}, json.RawMessage(`{"unit_id":"u1","date":"2026-04-22"}`))
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Buckets []HourlyBucket `json:"buckets"`
	}
	_ = json.Unmarshal(out.Content, &parsed)
	if len(parsed.Buckets) != 2 || parsed.Buckets[0].Hour != 9 {
		t.Fatalf("unexpected: %+v", parsed.Buckets)
	}
}

func TestGetHourlyLoadTool_RejectsBadDate(t *testing.T) {
	t.Parallel()
	tool := NewGetHourlyLoadTool(&fakeHourlyProvider{})
	if _, err := tool.Handler(ToolCtx{Roles: []string{"stats:read"}}, json.RawMessage(`{"unit_id":"u1","date":"04-22-2026"}`)); err == nil {
		t.Fatal("expected error on non-ISO date")
	}
}
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestGetHourlyLoad -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/backend/internal/copilot/tools/tool_get_hourly_load.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type HourlyBucket struct {
	Hour       int `json:"hour"`
	Tickets    int `json:"tickets"`
	AvgWaitSec int `json:"avgWaitSec"`
}

type HourlyLoadProvider interface {
	GetHourlyLoad(ctx context.Context, companyID, unitID string, day time.Time) ([]HourlyBucket, error)
}

func NewGetHourlyLoadTool(p HourlyLoadProvider) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"unit_id":{"type":"string","minLength":1},
			"date":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"}
		},
		"required":["unit_id","date"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "get_hourly_load",
		Description:    "Hourly heatmap series (tickets, avg wait) for a unit on a given date (YYYY-MM-DD).",
		Schema:         schema,
		RequiredScopes: []string{"stats:read"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				UnitID string `json:"unit_id"`
				Date   string `json:"date"`
			}
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.UnitID) == "" {
				return Result{}, errors.New("unit_id required")
			}
			day, err := time.Parse("2006-01-02", in.Date)
			if err != nil {
				return Result{}, errors.New("invalid date (YYYY-MM-DD)")
			}
			buckets, err := p.GetHourlyLoad(context.Background(), tctx.CompanyID, in.UnitID, day)
			if err != nil {
				return Result{}, err
			}
			content, err := json.Marshal(struct {
				Buckets []HourlyBucket `json:"buckets"`
			}{Buckets: buckets})
			if err != nil {
				return Result{}, err
			}
			return Result{Content: content}, nil
		},
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestGetHourlyLoad -v`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_get_hourly_load.go apps/backend/internal/copilot/tools/tool_get_hourly_load_test.go
git commit -m "feat(copilot): add get_hourly_load tool"
```

---

## Task 14: Quota service (Phase 1: feature gate only)

**Files:**
- Create: `apps/backend/internal/copilot/quota/service.go`
- Create: `apps/backend/internal/copilot/quota/service_test.go`

In Phase 1 the quota service is a thin wrapper over `subscriptionfeatures.CompanyHasCopilotV1`. Per-plan token/message limits land in Phase 3.

- [ ] **Step 1: Write failing test**

Create `apps/backend/internal/copilot/quota/service_test.go`:

```go
package quota

import (
	"context"
	"errors"
	"testing"
)

type fakeGate struct {
	enabled bool
	err     error
}

func (f *fakeGate) IsEnabled(ctx context.Context, companyID string) (bool, error) {
	return f.enabled, f.err
}

func TestService_CheckPlanFeature_Enabled(t *testing.T) {
	t.Parallel()
	svc := New(&fakeGate{enabled: true})
	if err := svc.CheckPlanFeature(context.Background(), "c1"); err != nil {
		t.Fatal(err)
	}
}

func TestService_CheckPlanFeature_Disabled(t *testing.T) {
	t.Parallel()
	svc := New(&fakeGate{enabled: false})
	err := svc.CheckPlanFeature(context.Background(), "c1")
	if !errors.Is(err, ErrFeatureDisabled) {
		t.Fatalf("expected ErrFeatureDisabled, got %v", err)
	}
}

func TestService_CheckPlanFeature_PropagatesError(t *testing.T) {
	t.Parallel()
	want := errors.New("db down")
	svc := New(&fakeGate{err: want})
	if err := svc.CheckPlanFeature(context.Background(), "c1"); !errors.Is(err, want) {
		t.Fatalf("got %v want %v", err, want)
	}
}
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -v`
Expected: FAIL.

- [ ] **Step 3: Implement service**

Create `apps/backend/internal/copilot/quota/service.go`:

```go
package quota

import (
	"context"
	"errors"
)

var ErrFeatureDisabled = errors.New("copilot: feature not enabled for this company")

// Gate is the dependency the service uses to check whether copilot_v1 is enabled.
// Wired in cmd/api as a thin wrapper around subscriptionfeatures.CompanyHasCopilotV1.
type Gate interface {
	IsEnabled(ctx context.Context, companyID string) (bool, error)
}

type Service struct {
	gate Gate
}

func New(gate Gate) *Service { return &Service{gate: gate} }

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
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/quota/
git commit -m "feat(copilot): add quota service with feature-gate check"
```

---

## Task 15: Agent loop with policy and stub provider

**Files:**
- Create: `apps/backend/internal/copilot/agent/policy.go`
- Create: `apps/backend/internal/copilot/agent/streaming.go`
- Create: `apps/backend/internal/copilot/agent/loop.go`
- Create: `apps/backend/internal/copilot/agent/loop_test.go`

The agent loop accepts a `gateway.LLMProvider`, a `tools.Registry`, and a `Sink` (the SSE emitter). It runs the multi-turn execution. Tests substitute a hand-rolled stub provider — no network in tests.

- [ ] **Step 1: Write `policy.go`**

Create `apps/backend/internal/copilot/agent/policy.go`:

```go
package agent

import "time"

type Policy struct {
	MaxIterations  int
	TurnTimeout    time.Duration
	PerToolTimeout time.Duration
}

func DefaultPolicy() Policy {
	return Policy{
		MaxIterations:  6,
		TurnTimeout:    60 * time.Second,
		PerToolTimeout: 8 * time.Second,
	}
}
```

- [ ] **Step 2: Write `streaming.go`**

Create `apps/backend/internal/copilot/agent/streaming.go`:

```go
package agent

import (
	"encoding/json"

	"quokkaq-go-backend/internal/copilot/gateway"
)

// EventType discriminator for SSE.
type EventType string

const (
	EvMessageStart      EventType = "message_start"
	EvTextDelta         EventType = "text_delta"
	EvToolCallStarted   EventType = "tool_call_started"
	EvToolCallCompleted EventType = "tool_call_completed"
	EvCitation          EventType = "citation"
	EvMessageComplete   EventType = "message_complete"
	EvError             EventType = "error"
)

// Event is the wire format. `Data` is JSON; clients parse on the discriminator.
type Event struct {
	Type EventType       `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// Sink is what the agent loop writes to. cmd/api's SSE handler wraps an http.ResponseWriter.
type Sink interface {
	Emit(e Event) error
}

// Helper builders.
func MessageStart(messageID string) Event {
	d, _ := json.Marshal(map[string]string{"messageId": messageID})
	return Event{Type: EvMessageStart, Data: d}
}

func TextDelta(delta string) Event {
	d, _ := json.Marshal(map[string]string{"delta": delta})
	return Event{Type: EvTextDelta, Data: d}
}

func ToolCallStarted(callID, name string, argsSummary json.RawMessage) Event {
	d, _ := json.Marshal(map[string]any{"callId": callID, "name": name, "argsSummary": argsSummary})
	return Event{Type: EvToolCallStarted, Data: d}
}

func ToolCallCompleted(callID, name, status string, durationMs int, resultSummary json.RawMessage) Event {
	d, _ := json.Marshal(map[string]any{
		"callId":         callID,
		"name":           name,
		"status":         status,
		"durationMs":     durationMs,
		"resultSummary":  resultSummary,
	})
	return Event{Type: EvToolCallCompleted, Data: d}
}

func MessageComplete(messageID string, usage gateway.Usage, costMicros int) Event {
	d, _ := json.Marshal(map[string]any{
		"messageId": messageID,
		"tokensIn":  usage.InputTokens,
		"tokensOut": usage.OutputTokens,
		"costUsdMicros": costMicros,
	})
	return Event{Type: EvMessageComplete, Data: d}
}

func Errorf(code, message string, retryable bool) Event {
	d, _ := json.Marshal(map[string]any{"code": code, "message": message, "retryable": retryable})
	return Event{Type: EvError, Data: d}
}
```

- [ ] **Step 3: Write `loop.go`**

Create `apps/backend/internal/copilot/agent/loop.go`:

```go
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"quokkaq-go-backend/internal/copilot/gateway"
	"quokkaq-go-backend/internal/copilot/tools"

	"github.com/google/uuid"
)

// Loop is the multi-turn orchestrator.
// One Loop instance may be used across requests (it holds no per-request state);
// per-request state lives on the Run input.
type Loop struct {
	provider gateway.LLMProvider
	registry *tools.Registry
	policy   Policy
}

func NewLoop(provider gateway.LLMProvider, registry *tools.Registry, policy Policy) *Loop {
	return &Loop{provider: provider, registry: registry, policy: policy}
}

// RunInput is the per-request input.
type RunInput struct {
	System         string
	History        []gateway.ChatMessage
	UserMessage    gateway.ChatMessage
	ToolCtx        tools.ToolCtx
	MessageID      string  // pre-allocated id; emitted in MessageStart
	Model          string
	MaxTokensPerTurn int
}

// Result captures aggregated state after the loop ends.
type Result struct {
	FinalText  string
	Usage      gateway.Usage
	StopReason string
	ToolCalls  []ToolCallRecord
}

type ToolCallRecord struct {
	ID         string
	Name       string
	Status     string
	DurationMs int
	Args       json.RawMessage
	Output     json.RawMessage
	ErrMsg     string
}

func (l *Loop) Run(ctx context.Context, in RunInput, sink Sink) (*Result, error) {
	if in.MessageID == "" {
		in.MessageID = uuid.NewString()
	}
	if err := sink.Emit(MessageStart(in.MessageID)); err != nil {
		return nil, err
	}

	visibleTools := l.registry.Filter(in.ToolCtx.Roles)
	defs := make([]gateway.ToolDefinition, 0, len(visibleTools))
	for _, t := range visibleTools {
		defs = append(defs, gateway.ToolDefinition{Name: t.Name, Description: t.Description, InputSchema: t.Schema})
	}

	messages := append([]gateway.ChatMessage{}, in.History...)
	messages = append(messages, in.UserMessage)

	res := &Result{}

	turnCtx, cancel := context.WithTimeout(ctx, l.policy.TurnTimeout)
	defer cancel()

	for iter := 0; iter < l.policy.MaxIterations; iter++ {
		req := gateway.CreateMessageRequest{
			Model:     in.Model,
			System:    in.System,
			Messages:  messages,
			Tools:     defs,
			ToolChoice: gateway.ToolChoice{Type: "auto"},
			MaxTokens: in.MaxTokensPerTurn,
			Metadata: map[string]string{
				"company_id": in.ToolCtx.CompanyID,
				"user_id":    in.ToolCtx.UserID,
				"thread_id":  in.ToolCtx.ThreadID,
				"request_id": in.ToolCtx.RequestID,
			},
		}

		var (
			textBuf    string
			toolCalls  []gateway.ToolCall
			usageDelta gateway.Usage
			stopReason string
		)
		errCh := make(chan error, 1)
		streamSink := &collectingSink{
			onText: func(d string) {
				textBuf += d
				_ = sink.Emit(TextDelta(d))
			},
			onTool: func(c gateway.ToolCall) {
				toolCalls = append(toolCalls, c)
			},
			onComplete: func(u gateway.Usage, sr string) {
				usageDelta = u
				stopReason = sr
				errCh <- nil
			},
			onError: func(e error) {
				errCh <- e
			},
		}

		if err := l.provider.StreamMessage(turnCtx, req, streamSink); err != nil {
			_ = sink.Emit(Errorf("provider_error", err.Error(), false))
			return res, err
		}

		select {
		case e := <-errCh:
			if e != nil {
				_ = sink.Emit(Errorf("provider_error", e.Error(), false))
				return res, e
			}
		case <-turnCtx.Done():
			_ = sink.Emit(Errorf("turn_timeout", turnCtx.Err().Error(), true))
			return res, turnCtx.Err()
		}

		res.Usage.InputTokens += usageDelta.InputTokens
		res.Usage.OutputTokens += usageDelta.OutputTokens
		res.StopReason = stopReason
		if textBuf != "" {
			res.FinalText += textBuf
			messages = append(messages, gateway.ChatMessage{
				Role: "assistant",
				Content: mustJSON([]any{
					map[string]any{"type": "text", "text": textBuf},
				}),
			})
		}

		// No tool calls → done.
		if len(toolCalls) == 0 {
			return res, nil
		}

		// Dispatch each tool call sequentially. Append a single assistant message
		// containing all tool_use blocks, followed by tool_result blocks.
		assistantBlocks := []any{}
		for _, tc := range toolCalls {
			assistantBlocks = append(assistantBlocks, map[string]any{
				"type":  "tool_use",
				"id":    tc.ID,
				"name":  tc.Name,
				"input": tc.Input,
			})
		}
		messages = append(messages, gateway.ChatMessage{Role: "assistant", Content: mustJSON(assistantBlocks)})

		toolResultBlocks := []any{}
		for _, tc := range toolCalls {
			argsSummary := tc.Input
			if len(argsSummary) > 256 {
				argsSummary = json.RawMessage(string(argsSummary[:256]) + "…")
			}
			_ = sink.Emit(ToolCallStarted(tc.ID, tc.Name, argsSummary))

			toolCtx, toolCancel := context.WithTimeout(turnCtx, l.policy.PerToolTimeout)
			out, err := l.registry.Dispatch(toolCtx, in.ToolCtx, tc.Name, tc.Input)
			toolCancel()

			rec := ToolCallRecord{ID: tc.ID, Name: tc.Name, DurationMs: out.DurationMs, Args: tc.Input}
			switch {
			case err == nil:
				rec.Status = "ok"
				rec.Output = out.Content
			case errors.Is(err, tools.ErrRBACDenied):
				rec.Status = "rbac_denied"
				rec.ErrMsg = err.Error()
			case errors.Is(err, context.DeadlineExceeded):
				rec.Status = "timeout"
				rec.ErrMsg = "tool deadline exceeded"
			default:
				rec.Status = "error"
				rec.ErrMsg = err.Error()
			}
			res.ToolCalls = append(res.ToolCalls, rec)

			summary := summarizeToolResult(out.Content, rec.Status, rec.ErrMsg)
			_ = sink.Emit(ToolCallCompleted(tc.ID, tc.Name, rec.Status, rec.DurationMs, summary))

			toolResultBlocks = append(toolResultBlocks, map[string]any{
				"type":         "tool_result",
				"tool_use_id":  tc.ID,
				"content":      string(summary), // model gets the same shape we surface
				"is_error":     rec.Status != "ok",
			})
		}
		messages = append(messages, gateway.ChatMessage{Role: "user", Content: mustJSON(toolResultBlocks)})
	}

	_ = sink.Emit(Errorf("max_iterations", fmt.Sprintf("hit max iterations %d", l.policy.MaxIterations), false))
	return res, errors.New("copilot: max iterations reached")
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return b
}

// summarizeToolResult returns a JSON value safe to forward to both the LLM and the SSE client.
// On failure, returns a structured error object the LLM can read and recover from.
func summarizeToolResult(content json.RawMessage, status, errMsg string) json.RawMessage {
	if status == "ok" {
		if len(content) == 0 {
			return json.RawMessage(`{}`)
		}
		return content
	}
	b, _ := json.Marshal(map[string]string{"error": errMsg, "status": status})
	return b
}

// collectingSink adapts the gateway.StreamSink interface to inline closures.
type collectingSink struct {
	onText     func(string)
	onTool     func(gateway.ToolCall)
	onComplete func(gateway.Usage, string)
	onError    func(error)
}

func (c *collectingSink) OnTextDelta(d string)          { c.onText(d) }
func (c *collectingSink) OnToolCall(t gateway.ToolCall) { c.onTool(t) }
func (c *collectingSink) OnComplete(u gateway.Usage, sr string) {
	c.onComplete(u, sr)
}
func (c *collectingSink) OnError(e error) { c.onError(e) }

// Discard is a Sink that throws away events; useful in tests.
type Discard struct{}

func (Discard) Emit(Event) error { return nil }

// _ = time.Second // keep import
var _ = time.Second
```

- [ ] **Step 4: Write the loop integration test using stub provider**

Create `apps/backend/internal/copilot/agent/loop_test.go`:

```go
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"quokkaq-go-backend/internal/copilot/gateway"
	"quokkaq-go-backend/internal/copilot/tools"
)

// stubProvider plays a script of streaming responses.
type stubProvider struct {
	turns [][]stubEvent
	idx   int
	mu    sync.Mutex
}

type stubEvent struct {
	text       string
	toolCall   *gateway.ToolCall
	stopReason string
	usage      gateway.Usage
}

func (s *stubProvider) Name() string { return "stub" }

func (s *stubProvider) CreateMessage(ctx context.Context, req gateway.CreateMessageRequest) (*gateway.Message, error) {
	return nil, errors.New("stubProvider does not implement CreateMessage")
}

func (s *stubProvider) StreamMessage(ctx context.Context, req gateway.CreateMessageRequest, sink gateway.StreamSink) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.idx >= len(s.turns) {
		return errors.New("stub: no more scripted turns")
	}
	turn := s.turns[s.idx]
	s.idx++
	for _, e := range turn {
		if e.text != "" {
			sink.OnTextDelta(e.text)
		}
		if e.toolCall != nil {
			sink.OnToolCall(*e.toolCall)
		}
		if e.stopReason != "" || e.usage.InputTokens != 0 || e.usage.OutputTokens != 0 {
			sink.OnComplete(e.usage, e.stopReason)
		}
	}
	return nil
}

func (s *stubProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	return nil, errors.New("not supported")
}

func (s *stubProvider) SupportedFeatures() gateway.ProviderFeatures {
	return gateway.ProviderFeatures{SupportsTools: true, SupportsStreaming: true}
}

// captureSink records events emitted by the loop.
type captureSink struct {
	events []Event
}

func (c *captureSink) Emit(e Event) error {
	c.events = append(c.events, e)
	return nil
}

func newRegistryWithEcho() *tools.Registry {
	reg := tools.NewRegistry()
	reg.Register(&tools.Tool{
		Name:           "echo",
		Description:    "echoes",
		Schema:         json.RawMessage(`{"type":"object"}`),
		RequiredScopes: []string{"copilot:use"},
		Handler: func(_ tools.ToolCtx, args json.RawMessage) (tools.Result, error) {
			return tools.Result{Content: args}, nil
		},
	})
	return reg
}

func TestLoop_TextOnlyResponse(t *testing.T) {
	t.Parallel()
	stub := &stubProvider{turns: [][]stubEvent{
		{
			{text: "Hi"},
			{text: " there"},
			{stopReason: "end_turn", usage: gateway.Usage{InputTokens: 8, OutputTokens: 3}},
		},
	}}
	loop := NewLoop(stub, tools.NewRegistry(), DefaultPolicy())
	sink := &captureSink{}
	res, err := loop.Run(context.Background(), RunInput{
		System:           "you are helpful",
		UserMessage:      gateway.ChatMessage{Role: "user", Content: json.RawMessage(`"hi"`)},
		ToolCtx:          tools.ToolCtx{CompanyID: "c1", UserID: "u1", Roles: []string{"copilot:use"}},
		MaxTokensPerTurn: 1024,
	}, sink)
	if err != nil {
		t.Fatal(err)
	}
	if res.FinalText != "Hi there" {
		t.Errorf("text: %q", res.FinalText)
	}
	if len(res.ToolCalls) != 0 {
		t.Errorf("unexpected tool calls: %+v", res.ToolCalls)
	}
}

func TestLoop_ToolUseTwoTurns(t *testing.T) {
	t.Parallel()
	stub := &stubProvider{turns: [][]stubEvent{
		{
			{toolCall: &gateway.ToolCall{ID: "t_1", Name: "echo", Input: json.RawMessage(`{"x":1}`)}},
			{stopReason: "tool_use", usage: gateway.Usage{InputTokens: 20, OutputTokens: 5}},
		},
		{
			{text: "Done."},
			{stopReason: "end_turn", usage: gateway.Usage{InputTokens: 24, OutputTokens: 2}},
		},
	}}
	loop := NewLoop(stub, newRegistryWithEcho(), DefaultPolicy())
	sink := &captureSink{}
	res, err := loop.Run(context.Background(), RunInput{
		System:           "ok",
		UserMessage:      gateway.ChatMessage{Role: "user", Content: json.RawMessage(`"do something"`)},
		ToolCtx:          tools.ToolCtx{CompanyID: "c1", UserID: "u1", Roles: []string{"copilot:use"}},
		MaxTokensPerTurn: 1024,
	}, sink)
	if err != nil {
		t.Fatal(err)
	}
	if res.FinalText != "Done." {
		t.Errorf("final text: %q", res.FinalText)
	}
	if len(res.ToolCalls) != 1 || res.ToolCalls[0].Status != "ok" {
		t.Errorf("tool calls: %+v", res.ToolCalls)
	}
	if res.Usage.InputTokens != 44 || res.Usage.OutputTokens != 7 {
		t.Errorf("usage: %+v", res.Usage)
	}
	// SSE events: message_start, [tool_call_started, tool_call_completed], text_delta×1, message_complete? (loop emits no message_complete; handler does)
	if len(sink.events) < 3 {
		t.Errorf("event count: %d", len(sink.events))
	}
}

func TestLoop_RBACDeniedToolStillRecorded(t *testing.T) {
	t.Parallel()
	reg := tools.NewRegistry()
	reg.Register(&tools.Tool{
		Name:           "secret",
		Schema:         json.RawMessage(`{"type":"object"}`),
		RequiredScopes: []string{"admin"},
		Handler: func(_ tools.ToolCtx, args json.RawMessage) (tools.Result, error) {
			return tools.Result{Content: json.RawMessage(`{"ok":true}`)}, nil
		},
	})
	stub := &stubProvider{turns: [][]stubEvent{
		{
			{toolCall: &gateway.ToolCall{ID: "t_1", Name: "secret", Input: json.RawMessage(`{}`)}},
			{stopReason: "tool_use"},
		},
		{
			{text: "I cannot."},
			{stopReason: "end_turn"},
		},
	}}
	loop := NewLoop(stub, reg, DefaultPolicy())
	sink := &captureSink{}
	res, err := loop.Run(context.Background(), RunInput{
		UserMessage:      gateway.ChatMessage{Role: "user", Content: json.RawMessage(`"x"`)},
		ToolCtx:          tools.ToolCtx{CompanyID: "c1", UserID: "u1", Roles: []string{"viewer"}},
		MaxTokensPerTurn: 1024,
	}, sink)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.ToolCalls) != 1 || res.ToolCalls[0].Status != "rbac_denied" {
		t.Fatalf("expected rbac_denied; got %+v", res.ToolCalls)
	}
}

func TestLoop_MaxIterationsCap(t *testing.T) {
	t.Parallel()
	turn := []stubEvent{
		{toolCall: &gateway.ToolCall{ID: "t", Name: "echo", Input: json.RawMessage(`{}`)}},
		{stopReason: "tool_use"},
	}
	turns := make([][]stubEvent, 10)
	for i := range turns {
		turns[i] = turn
	}
	stub := &stubProvider{turns: turns}
	policy := DefaultPolicy()
	policy.MaxIterations = 3
	loop := NewLoop(stub, newRegistryWithEcho(), policy)
	if _, err := loop.Run(context.Background(), RunInput{
		UserMessage:      gateway.ChatMessage{Role: "user", Content: json.RawMessage(`"x"`)},
		ToolCtx:          tools.ToolCtx{CompanyID: "c1", UserID: "u1", Roles: []string{"copilot:use"}},
		MaxTokensPerTurn: 1024,
	}, &captureSink{}); err == nil {
		t.Fatal("expected max iterations error")
	}
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/agent/ -v`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/internal/copilot/agent/
git commit -m "feat(copilot): add agent loop with tool-use orchestration"
```

---

## Task 16: SSE chat handler

**Files:**
- Create: `apps/backend/internal/copilot/handlers/helpers.go`
- Create: `apps/backend/internal/copilot/handlers/chat.go`

The chat handler is the SSE entry point. It pulls company/user/locale from the existing auth middleware (the same way other handlers in `internal/handlers` do — see `auth_handler.go` / `helpers.go` for patterns), enforces the feature gate via `quota.Service`, builds the system prompt, and runs the agent loop.

- [ ] **Step 1: Write `helpers.go` for context extraction**

Create `apps/backend/internal/copilot/handlers/helpers.go`:

```go
package handlers

import (
	"net/http"

	authmiddleware "quokkaq-go-backend/internal/middleware"
)

// requestIdentity bundles caller info pulled from existing JWT middleware.
type requestIdentity struct {
	CompanyID string
	UserID    string
	Roles     []string
	Locale    string
}

func identityFromRequest(r *http.Request) (requestIdentity, bool) {
	companyID := authmiddleware.GetCompanyID(r.Context())
	userID := authmiddleware.GetUserID(r.Context())
	if companyID == "" || userID == "" {
		return requestIdentity{}, false
	}
	roles := authmiddleware.GetRoles(r.Context())
	locale := r.URL.Query().Get("locale")
	if locale == "" {
		locale = "en"
	}
	return requestIdentity{
		CompanyID: companyID,
		UserID:    userID,
		Roles:     roles,
		Locale:    locale,
	}, true
}
```

> Note: if `authmiddleware.GetCompanyID` / `GetUserID` / `GetRoles` are named differently in this codebase, adjust the helper. The wiring task (Task 19) verifies the names.

- [ ] **Step 2: Write `chat.go` SSE handler**

Create `apps/backend/internal/copilot/handlers/chat.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/copilot/agent"
	"quokkaq-go-backend/internal/copilot/conversation"
	"quokkaq-go-backend/internal/copilot/gateway"
	"quokkaq-go-backend/internal/copilot/quota"
	"quokkaq-go-backend/internal/copilot/tools"
	"quokkaq-go-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// ChatHandler bundles dependencies needed to handle POST /threads/:id/messages.
type ChatHandler struct {
	loop         *agent.Loop
	convoSvc     *conversation.Service
	quotaSvc     *quota.Service
	defaultModel string
	systemPrompt string // base persona; page context appended per-request
}

func NewChatHandler(
	loop *agent.Loop,
	convoSvc *conversation.Service,
	quotaSvc *quota.Service,
	defaultModel string,
	systemPrompt string,
) *ChatHandler {
	return &ChatHandler{
		loop:         loop,
		convoSvc:     convoSvc,
		quotaSvc:     quotaSvc,
		defaultModel: defaultModel,
		systemPrompt: systemPrompt,
	}
}

type chatRequestBody struct {
	Content     string          `json:"content"`
	PageContext json.RawMessage `json:"page_context,omitempty"`
}

// HandleMessage POST /api/copilot/threads/:id/messages
//
//	@Summary      Send a message to a Copilot thread (SSE)
//	@Description  Streams Server-Sent Events; see SSE event types in design doc.
//	@Tags         copilot
//	@Accept       json
//	@Produce      text/event-stream
//	@Param        id     path      string  true  "Thread ID"
//	@Param        body   body      chatRequestBody  true  "Message body"
//	@Success      200    {string}  string  "event-stream"
//	@Failure      400    {object}  map[string]string
//	@Failure      403    {object}  map[string]string
//	@Failure      404    {object}  map[string]string
//	@Router       /api/copilot/threads/{id}/messages [post]
//	@Security     BearerAuth
func (h *ChatHandler) HandleMessage(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.quotaSvc.CheckPlanFeature(r.Context(), ident.CompanyID); err != nil {
		if errors.Is(err, quota.ErrFeatureDisabled) {
			http.Error(w, "copilot not enabled for this plan", http.StatusForbidden)
			return
		}
		http.Error(w, fmt.Sprintf("quota check: %v", err), http.StatusInternalServerError)
		return
	}

	threadID := chi.URLParam(r, "id")
	if threadID == "" {
		http.Error(w, "thread id required", http.StatusBadRequest)
		return
	}
	thread, history, err := h.convoSvc.GetThread(r.Context(), ident.CompanyID, threadID)
	if err != nil {
		if errors.Is(err, conversation.ErrThreadNotFound) {
			http.Error(w, "thread not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var body chatRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Content) == "" {
		http.Error(w, "content required", http.StatusBadRequest)
		return
	}

	// Persist user message immediately.
	userContent, _ := json.Marshal(map[string]string{"text": body.Content})
	if _, err := h.convoSvc.AppendMessage(r.Context(), conversation.AppendMessageInput{
		CompanyID: ident.CompanyID,
		ThreadID:  threadID,
		Role:      "user",
		Content:   datatypes.JSON(userContent),
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Set SSE headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// Heartbeat: keep proxies open.
	hbCtx, hbCancel := context.WithCancel(r.Context())
	defer hbCancel()
	go heartbeat(hbCtx, w, flusher, 15*time.Second)

	requestID := uuid.NewString()
	messageID := uuid.NewString()

	sink := &httpSSESink{w: w, flusher: flusher}

	systemPrompt := h.buildSystemPrompt(thread.Locale, body.PageContext)

	historyMsgs := historyForGateway(history)
	userMsg := gateway.ChatMessage{
		Role:    "user",
		Content: mustText(body.Content),
	}

	res, runErr := h.loop.Run(r.Context(), agent.RunInput{
		System:           systemPrompt,
		History:          historyMsgs,
		UserMessage:      userMsg,
		ToolCtx:          tools.ToolCtx{
			CompanyID: ident.CompanyID,
			UserID:    ident.UserID,
			Roles:     ident.Roles,
			ThreadID:  threadID,
			RequestID: requestID,
			Locale:    ident.Locale,
			PIILevel:  tools.PIIStandard,
		},
		MessageID:        messageID,
		Model:            h.defaultModel,
		MaxTokensPerTurn: 2048,
	}, sink)

	// Persist assistant message and tool calls.
	if res != nil {
		assistantContent, _ := json.Marshal(map[string]any{
			"text":       res.FinalText,
			"toolCalls":  toolCallSummariesForPersistence(res.ToolCalls),
			"stopReason": res.StopReason,
		})
		costMicros := gateway.EstimateCostUSDx10000("anthropic", h.defaultModel, res.Usage)
		ti, to := res.Usage.InputTokens, res.Usage.OutputTokens
		provider := "anthropic"
		model := h.defaultModel
		assistantMsg, _ := h.convoSvc.AppendMessage(r.Context(), conversation.AppendMessageInput{
			CompanyID:     ident.CompanyID,
			ThreadID:      threadID,
			Role:          "assistant",
			Content:       datatypes.JSON(assistantContent),
			TokensIn:      &ti,
			TokensOut:     &to,
			Provider:      &provider,
			Model:         &model,
			CostUSDx10000: &costMicros,
		})
		if assistantMsg != nil {
			for _, tc := range res.ToolCalls {
				args, _ := json.Marshal(tc.Args)
				resultSummary, _ := json.Marshal(json.RawMessage(tc.Output))
				errMsg := tc.ErrMsg
				_ = h.convoSvc.RecordToolCall(r.Context(), &models.CopilotToolCall{
					MessageID:     assistantMsg.ID,
					ToolName:      tc.Name,
					ArgsRedacted:  datatypes.JSON(args),
					ResultSummary: datatypes.JSON(resultSummary),
					DurationMs:    tc.DurationMs,
					Status:        tc.Status,
					ErrorMessage:  ptrStr(errMsg),
				})
			}
		}
		_ = sink.Emit(agent.MessageComplete(messageID, res.Usage, costMicros))
	}
	if runErr != nil {
		// Error event already emitted by loop; nothing more to do.
		return
	}
}

func ptrStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func toolCallSummariesForPersistence(in []agent.ToolCallRecord) []map[string]any {
	out := make([]map[string]any, len(in))
	for i, tc := range in {
		out[i] = map[string]any{
			"id":         tc.ID,
			"name":       tc.Name,
			"status":     tc.Status,
			"durationMs": tc.DurationMs,
		}
	}
	return out
}

func mustText(s string) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

func historyForGateway(msgs []models.CopilotMessage) []gateway.ChatMessage {
	out := make([]gateway.ChatMessage, 0, len(msgs))
	for _, m := range msgs {
		role := m.Role
		if role == "system" || role == "tool" {
			continue
		}
		// Persisted content is already structured JSON; wrap text-shaped rows.
		var probe map[string]any
		if err := json.Unmarshal(m.Content, &probe); err == nil {
			if t, ok := probe["text"].(string); ok {
				out = append(out, gateway.ChatMessage{Role: role, Content: mustText(t)})
				continue
			}
		}
		out = append(out, gateway.ChatMessage{Role: role, Content: json.RawMessage(m.Content)})
	}
	return out
}

func (h *ChatHandler) buildSystemPrompt(locale string, pageCtx json.RawMessage) string {
	prompt := strings.ReplaceAll(h.systemPrompt, "{{locale}}", locale)
	prompt = strings.ReplaceAll(prompt, "{{today}}", time.Now().UTC().Format("2006-01-02"))
	if len(pageCtx) > 0 && string(pageCtx) != "null" {
		prompt += "\n\nCurrent page context (JSON): " + string(pageCtx)
	}
	return prompt
}

// httpSSESink writes events to the HTTP response in SSE wire format.
type httpSSESink struct {
	w       http.ResponseWriter
	flusher http.Flusher
	mu      sync.Mutex
}

func (s *httpSSESink) Emit(e agent.Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", e.Type, payload); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

func heartbeat(ctx context.Context, w http.ResponseWriter, flusher http.Flusher, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_, _ = fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}
```

- [ ] **Step 3: Verify compile**

Run: `cd apps/backend && go build ./internal/copilot/...`
Expected: success.

> Note: this task does not have a unit test by itself — it's exercised in Task 19's wiring with an httptest server that mocks the LLM. If `authmiddleware.GetRoles` doesn't exist with that signature, the wiring task will surface it; rename in `helpers.go` accordingly.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/handlers/helpers.go apps/backend/internal/copilot/handlers/chat.go
git commit -m "feat(copilot): add SSE chat handler"
```

---

## Task 17: Threads CRUD handler

**Files:**
- Create: `apps/backend/internal/copilot/handlers/threads.go`

- [ ] **Step 1: Implement threads handlers**

Create `apps/backend/internal/copilot/handlers/threads.go`:

```go
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"quokkaq-go-backend/internal/copilot/conversation"

	"github.com/go-chi/chi/v5"
)

type ThreadsHandler struct {
	convoSvc *conversation.Service
}

func NewThreadsHandler(svc *conversation.Service) *ThreadsHandler {
	return &ThreadsHandler{convoSvc: svc}
}

type createThreadRequest struct {
	Locale string  `json:"locale"`
	Title  *string `json:"title,omitempty"`
}

type renameThreadRequest struct {
	Title string `json:"title"`
}

// HandleCreate POST /api/copilot/threads
//
//	@Summary  Create a new Copilot thread
//	@Tags     copilot
//	@Produce  json
//	@Success  201 {object} map[string]string
//	@Router   /api/copilot/threads [post]
//	@Security BearerAuth
func (h *ThreadsHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body createThreadRequest
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Locale == "" {
		body.Locale = ident.Locale
	}
	thread, err := h.convoSvc.CreateThread(r.Context(), conversation.CreateThreadInput{
		CompanyID: ident.CompanyID,
		UserID:    ident.UserID,
		Locale:    body.Locale,
		Title:     body.Title,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": thread.ID})
}

// HandleList GET /api/copilot/threads
//
//	@Summary  List the user's Copilot threads
//	@Tags     copilot
//	@Produce  json
//	@Param    limit  query  int     false "Page size (default 50, max 200)"
//	@Param    cursor query  string  false "Updated_at cursor (RFC3339)"
//	@Success  200 {object} map[string]any
//	@Router   /api/copilot/threads [get]
//	@Security BearerAuth
func (h *ThreadsHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	cursor := r.URL.Query().Get("cursor")
	threads, err := h.convoSvc.ListThreads(r.Context(), ident.CompanyID, ident.UserID, limit, cursor)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := map[string]any{"threads": threads}
	if len(threads) > 0 {
		out["nextCursor"] = threads[len(threads)-1].UpdatedAt.Format("2006-01-02T15:04:05.000Z07:00")
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// HandleGet GET /api/copilot/threads/:id
//
//	@Summary  Get a Copilot thread with its messages
//	@Tags     copilot
//	@Produce  json
//	@Param    id path string true "Thread ID"
//	@Success  200 {object} map[string]any
//	@Router   /api/copilot/threads/{id} [get]
//	@Security BearerAuth
func (h *ThreadsHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	thread, msgs, err := h.convoSvc.GetThread(r.Context(), ident.CompanyID, id)
	if err != nil {
		if errors.Is(err, conversation.ErrThreadNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"thread": thread, "messages": msgs})
}

// HandleRename PATCH /api/copilot/threads/:id
//
//	@Summary  Rename a Copilot thread
//	@Tags     copilot
//	@Accept   json
//	@Produce  json
//	@Param    id    path  string                true "Thread ID"
//	@Param    body  body  renameThreadRequest   true "New title"
//	@Success  204
//	@Router   /api/copilot/threads/{id} [patch]
//	@Security BearerAuth
func (h *ThreadsHandler) HandleRename(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	var body renameThreadRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := h.convoSvc.RenameThread(r.Context(), ident.CompanyID, id, body.Title); err != nil {
		if errors.Is(err, conversation.ErrThreadNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleDelete DELETE /api/copilot/threads/:id
//
//	@Summary  Soft-delete a Copilot thread
//	@Tags     copilot
//	@Param    id path string true "Thread ID"
//	@Success  204
//	@Router   /api/copilot/threads/{id} [delete]
//	@Security BearerAuth
func (h *ThreadsHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.convoSvc.SoftDeleteThread(r.Context(), ident.CompanyID, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 2: Verify compile**

Run: `cd apps/backend && go build ./internal/copilot/handlers/`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/internal/copilot/handlers/threads.go
git commit -m "feat(copilot): add threads CRUD handler"
```

---

## Task 18: Feedback handler + quota endpoint

**Files:**
- Create: `apps/backend/internal/copilot/handlers/feedback.go`

- [ ] **Step 1: Implement feedback + quota endpoints**

Create `apps/backend/internal/copilot/handlers/feedback.go`:

```go
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"quokkaq-go-backend/internal/copilot/conversation"
	"quokkaq-go-backend/internal/copilot/quota"
	"quokkaq-go-backend/internal/models"

	"github.com/go-chi/chi/v5"
)

type FeedbackHandler struct {
	convoSvc *conversation.Service
	quotaSvc *quota.Service
}

func NewFeedbackHandler(c *conversation.Service, q *quota.Service) *FeedbackHandler {
	return &FeedbackHandler{convoSvc: c, quotaSvc: q}
}

type feedbackBody struct {
	Rating  int     `json:"rating"`  // -1, 0, +1
	Comment *string `json:"comment,omitempty"`
}

// HandleFeedback POST /api/copilot/messages/:id/feedback
//
//	@Summary  Record thumbs-up/down feedback for a Copilot message
//	@Tags     copilot
//	@Accept   json
//	@Param    id    path  string         true "Message ID"
//	@Param    body  body  feedbackBody   true "Rating"
//	@Success  204
//	@Router   /api/copilot/messages/{id}/feedback [post]
//	@Security BearerAuth
func (h *FeedbackHandler) HandleFeedback(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	var body feedbackBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.Rating < -1 || body.Rating > 1 {
		http.Error(w, "rating must be -1, 0, or 1", http.StatusBadRequest)
		return
	}
	fb := &models.CopilotFeedback{
		MessageID: id,
		UserID:    ident.UserID,
		Rating:    int16(body.Rating),
		Comment:   body.Comment,
	}
	if err := h.convoSvc.RecordFeedback(r.Context(), fb); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleQuota GET /api/copilot/quota
//
//	@Summary  Quota status for the calling user (Phase 1: feature gate boolean only)
//	@Tags     copilot
//	@Produce  json
//	@Success  200 {object} map[string]bool
//	@Router   /api/copilot/quota [get]
//	@Security BearerAuth
func (h *FeedbackHandler) HandleQuota(w http.ResponseWriter, r *http.Request) {
	ident, ok := identityFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	enabled := true
	if err := h.quotaSvc.CheckPlanFeature(r.Context(), ident.CompanyID); err != nil {
		if errors.Is(err, quota.ErrFeatureDisabled) {
			enabled = false
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": enabled})
}
```

- [ ] **Step 2: Verify compile**

Run: `cd apps/backend && go build ./internal/copilot/handlers/`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/internal/copilot/handlers/feedback.go
git commit -m "feat(copilot): add feedback handler and quota endpoint"
```

---

## Task 19: Wire dependencies into `cmd/api/main.go`

**Files:**
- Modify: `apps/backend/cmd/api/main.go`
- Modify: `apps/backend/.env.example`

This task assembles the Copilot stack and mounts the routes. The wiring uses **adapters** (small structs in `cmd/api`) to convert the existing services (`UnitService`, `StatisticsService`) into the small interfaces the tools depend on.

- [ ] **Step 1: Add env vars to `.env.example`**

Append to `apps/backend/.env.example`:

```bash
# AI Copilot
COPILOT_ENABLED=true
COPILOT_ANTHROPIC_API_KEY=
COPILOT_DEFAULT_MODEL=claude-sonnet-4-6
COPILOT_RETENTION_DAYS=90
COPILOT_TURN_TIMEOUT_SECONDS=60
COPILOT_MAX_ITERATIONS=6
```

- [ ] **Step 2: Add the wiring block to `main.go`**

Locate the block in `apps/backend/cmd/api/main.go` after services and handlers are constructed but before routes are mounted. Add:

```go
// --- AI Copilot (Phase 1) ---
copilotEnabled := strings.EqualFold(os.Getenv("COPILOT_ENABLED"), "true")
if copilotEnabled {
    apiKey := os.Getenv("COPILOT_ANTHROPIC_API_KEY")
    if apiKey == "" {
        slog.Warn("COPILOT_ENABLED=true but COPILOT_ANTHROPIC_API_KEY is empty; disabling Copilot")
        copilotEnabled = false
    }
    if copilotEnabled {
        defaultModel := os.Getenv("COPILOT_DEFAULT_MODEL")
        if defaultModel == "" {
            defaultModel = "claude-sonnet-4-6"
        }
        retentionDays, _ := strconv.Atoi(os.Getenv("COPILOT_RETENTION_DAYS"))
        if retentionDays <= 0 {
            retentionDays = 90
        }
        copilotProvider := copilotgateway.NewAnthropic(copilotgateway.AnthropicConfig{
            APIKey:       apiKey,
            DefaultModel: defaultModel,
        })

        copilotPolicy := copilotagent.DefaultPolicy()
        if v, _ := strconv.Atoi(os.Getenv("COPILOT_MAX_ITERATIONS")); v > 0 {
            copilotPolicy.MaxIterations = v
        }
        if v, _ := strconv.Atoi(os.Getenv("COPILOT_TURN_TIMEOUT_SECONDS")); v > 0 {
            copilotPolicy.TurnTimeout = time.Duration(v) * time.Second
        }

        copilotRegistry := copilottools.NewRegistry()
        copilotRegistry.Register(copilottools.NewListUnitsTool(&copilotUnitListerAdapter{repo: unitRepo}))
        copilotRegistry.Register(copilottools.NewGetUnitSummaryTool(&copilotUnitSummaryAdapter{stats: statisticsService}))
        copilotRegistry.Register(copilottools.NewGetServiceBreakdownTool(&copilotServiceBreakdownAdapter{stats: statisticsService}))
        copilotRegistry.Register(copilottools.NewGetHourlyLoadTool(&copilotHourlyLoadAdapter{stats: statisticsService}))

        copilotLoop := copilotagent.NewLoop(copilotProvider, copilotRegistry, copilotPolicy)

        copilotConvoSvc := copilotconversation.New(
            repository.NewCopilotThreadRepository(),
            repository.NewCopilotMessageRepository(),
        ).WithPurgeDB(database.DB)

        copilotQuotaSvc := copilotquota.New(&copilotPlanGate{db: database.DB})

        copilotChat := copilothandlers.NewChatHandler(
            copilotLoop,
            copilotConvoSvc,
            copilotQuotaSvc,
            defaultModel,
            copilotSystemPrompt,
        )
        copilotThreads := copilothandlers.NewThreadsHandler(copilotConvoSvc)
        copilotFeedback := copilothandlers.NewFeedbackHandler(copilotConvoSvc, copilotQuotaSvc)

        // Asynq retention handler — register on the existing Asynq mux.
        // (Locate the place where other Asynq handlers are registered, e.g. mux.HandleFunc(...))
        retention := time.Duration(retentionDays) * 24 * time.Hour
        copilotRetentionHandler := jobs.HandleCopilotRetentionPurge(copilotConvoSvc, retention)
        // mux.HandleFunc(jobs.TypeCopilotRetentionPurge, copilotRetentionHandler) — adjust to existing mux variable name

        // Routes mounted at end of router setup; placeholder block:
        // r.Route("/api/copilot", func(r chi.Router) { ... }) — see Step 3

        _ = copilotChat
        _ = copilotThreads
        _ = copilotFeedback
        _ = copilotRetentionHandler
    }
}
// --- end AI Copilot ---
```

> The `_ = ...` blanks are intentional placeholders: in Step 3 you wire the variables into the chi router and the Asynq mux. They suppress "declared and not used" until that wiring is in place. Remove them when wired.

Add the missing imports (alongside existing import block):

```go
import (
    // ... existing imports ...
    copilotagent "quokkaq-go-backend/internal/copilot/agent"
    copilotconversation "quokkaq-go-backend/internal/copilot/conversation"
    copilotgateway "quokkaq-go-backend/internal/copilot/gateway"
    copilothandlers "quokkaq-go-backend/internal/copilot/handlers"
    copilotquota "quokkaq-go-backend/internal/copilot/quota"
    copilottools "quokkaq-go-backend/internal/copilot/tools"
    "quokkaq-go-backend/internal/subscriptionfeatures"
    // strconv and time should already be imported.
)
```

- [ ] **Step 3: Mount the routes**

Inside the chi router setup (find where other routes like `r.Route("/api/users", ...)` are mounted), add (only when `copilotEnabled` is true — gate with an `if`):

```go
if copilotEnabled {
    r.Route("/api/copilot", func(r chi.Router) {
        // All Copilot endpoints require auth; protect with the existing middleware.
        r.Use(authmiddleware.JWTMiddleware) // — use the same name your codebase uses
        r.Get("/quota", copilotFeedback.HandleQuota)

        r.Post("/threads", copilotThreads.HandleCreate)
        r.Get("/threads", copilotThreads.HandleList)
        r.Get("/threads/{id}", copilotThreads.HandleGet)
        r.Patch("/threads/{id}", copilotThreads.HandleRename)
        r.Delete("/threads/{id}", copilotThreads.HandleDelete)
        r.Post("/threads/{id}/messages", copilotChat.HandleMessage)

        r.Post("/messages/{id}/feedback", copilotFeedback.HandleFeedback)
    })
}
```

Replace the `_ = copilotChat` etc. blanks with the actual mount above.

- [ ] **Step 4: Add the adapters in a new file `cmd/api/copilot_adapters.go`**

Create `apps/backend/cmd/api/copilot_adapters.go`:

```go
package main

import (
	"context"
	"strings"
	"time"

	"quokkaq-go-backend/internal/copilot/quota"
	"quokkaq-go-backend/internal/copilot/tools"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"gorm.io/gorm"
)

// copilotUnitListerAdapter wraps the existing UnitRepository to satisfy tools.UnitLister.
type copilotUnitListerAdapter struct {
	repo repository.UnitRepository
}

func (a *copilotUnitListerAdapter) ListUnits(ctx context.Context, companyID string, search, region string) ([]tools.UnitSummary, error) {
	units, err := a.repo.FindAllByCompany(companyID)
	if err != nil {
		return nil, err
	}
	out := make([]tools.UnitSummary, 0, len(units))
	for _, u := range units {
		if search != "" && !strings.Contains(strings.ToLower(u.Name), strings.ToLower(search)) {
			continue
		}
		// Region filter is a no-op until the Unit model has a Region column; placeholder.
		if region != "" {
			continue
		}
		out = append(out, tools.UnitSummary{
			ID:     u.ID,
			Name:   u.Name,
			Active: !u.Archived,
		})
	}
	return out, nil
}

// copilotUnitSummaryAdapter wraps StatisticsService for tools.UnitSummaryProvider.
type copilotUnitSummaryAdapter struct {
	stats *services.StatisticsService
}

func (a *copilotUnitSummaryAdapter) GetUnitSummary(ctx context.Context, companyID, unitID string, from, to time.Time) (tools.UnitSummaryStats, error) {
	// Use the existing aggregate API. If StatisticsService doesn't expose this exact shape,
	// add a thin method on the service that returns the requested fields. (Implementation
	// hint: it already serves daily rollups via repository.StatisticsRepository — assemble
	// here.)
	summary, err := a.stats.AggregateForUnit(ctx, companyID, unitID, from, to)
	if err != nil {
		return tools.UnitSummaryStats{}, err
	}
	return tools.UnitSummaryStats{
		AvgWaitSec:        summary.AvgWaitSec,
		P95WaitSec:        summary.P95WaitSec,
		ThroughputPerHour: summary.ThroughputPerHour,
		SLAHitRate:        summary.SLAHitRate,
		Served:            summary.Served,
		Abandoned:         summary.Abandoned,
		AsOf:              summary.AsOf,
	}, nil
}

// copilotServiceBreakdownAdapter — analogous wrapper.
type copilotServiceBreakdownAdapter struct {
	stats *services.StatisticsService
}

func (a *copilotServiceBreakdownAdapter) GetServiceBreakdown(ctx context.Context, companyID, unitID string, from, to time.Time, groupBy string) ([]tools.ServiceBreakdownRow, error) {
	rows, err := a.stats.ServiceBreakdownForCopilot(ctx, companyID, unitID, from, to, groupBy)
	if err != nil {
		return nil, err
	}
	out := make([]tools.ServiceBreakdownRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, tools.ServiceBreakdownRow{
			ServiceID:   r.ServiceID,
			ServiceName: r.ServiceName,
			Served:      r.Served,
			AvgWaitSec:  r.AvgWaitSec,
			AbandonRate: r.AbandonRate,
		})
	}
	return out, nil
}

// copilotHourlyLoadAdapter — analogous wrapper.
type copilotHourlyLoadAdapter struct {
	stats *services.StatisticsService
}

func (a *copilotHourlyLoadAdapter) GetHourlyLoad(ctx context.Context, companyID, unitID string, day time.Time) ([]tools.HourlyBucket, error) {
	rows, err := a.stats.HourlyLoadForCopilot(ctx, companyID, unitID, day)
	if err != nil {
		return nil, err
	}
	out := make([]tools.HourlyBucket, 0, len(rows))
	for _, r := range rows {
		out = append(out, tools.HourlyBucket{Hour: r.Hour, Tickets: r.Tickets, AvgWaitSec: r.AvgWaitSec})
	}
	return out, nil
}

// copilotPlanGate satisfies quota.Gate using subscriptionfeatures.CompanyHasCopilotV1.
type copilotPlanGate struct {
	db *gorm.DB
}

func (g *copilotPlanGate) IsEnabled(ctx context.Context, companyID string) (bool, error) {
	return subscriptionfeatures.CompanyHasCopilotV1(ctx, g.db, companyID)
}

// Compile-time interface checks.
var (
	_ tools.UnitLister               = (*copilotUnitListerAdapter)(nil)
	_ tools.UnitSummaryProvider      = (*copilotUnitSummaryAdapter)(nil)
	_ tools.ServiceBreakdownProvider = (*copilotServiceBreakdownAdapter)(nil)
	_ tools.HourlyLoadProvider       = (*copilotHourlyLoadAdapter)(nil)
	_ quota.Gate                     = (*copilotPlanGate)(nil)
)
```

> **About the StatisticsService methods used above.** The adapter calls three methods (`AggregateForUnit`, `ServiceBreakdownForCopilot`, `HourlyLoadForCopilot`) that **must be added** as thin Phase-1 wrappers in `apps/backend/internal/services/statistics_service.go` (and `statistics_by_service.go` / `statistics_hourly.go`). They are pure assemblers — they reuse existing repo aggregation logic and return Phase-1-shaped DTOs. Add them as the **first sub-step** of Task 19 (before adding adapters), with this signature contract:
>
> ```go
> // statistics_service.go — thin adapter for Copilot tools.
> type CopilotUnitSummaryDTO struct {
>     AvgWaitSec        int
>     P95WaitSec        int
>     ThroughputPerHour int
>     SLAHitRate        float64
>     Served            int
>     Abandoned         int
>     AsOf              time.Time
> }
> func (s *StatisticsService) AggregateForUnit(ctx context.Context, companyID, unitID string, from, to time.Time) (CopilotUnitSummaryDTO, error) {
>     // Sum from existing daily-bucket repo (statsRepo.QueryDailyBuckets or similar).
>     // Compute p95 from segments table where available; otherwise use AvgWait * 1.6 as a Phase-1 placeholder
>     // and TODO: replace with real percentile when the segments table is populated.
> }
>
> // statistics_by_service.go
> type CopilotServiceBreakdownDTO struct{ ServiceID, ServiceName string; Served, AvgWaitSec int; AbandonRate float64 }
> func (s *StatisticsService) ServiceBreakdownForCopilot(ctx context.Context, companyID, unitID string, from, to time.Time, groupBy string) ([]CopilotServiceBreakdownDTO, error)
>
> // statistics_hourly.go
> type CopilotHourlyDTO struct{ Hour, Tickets, AvgWaitSec int }
> func (s *StatisticsService) HourlyLoadForCopilot(ctx context.Context, companyID, unitID string, day time.Time) ([]CopilotHourlyDTO, error)
> ```
>
> Add a small unit test per method using `glebarezsqlite` and 1–2 fixture rows to lock the assembly logic. The existing aggregation paths are already tested (don't re-test them); this guards the field mapping.

- [ ] **Step 5: Add the system prompt constant**

Add to `apps/backend/cmd/api/main.go` (top of file or in a new const block):

```go
const copilotSystemPrompt = `You are QuokkaQ Copilot, an assistant for queue-management administrators
and supervisors. You answer questions using the tools provided. Answer in {{locale}}.

Rules:
- Use tools to fetch data; never invent numbers or entities.
- If a tool returns no results, say so — do not guess.
- Be concise. Use markdown tables for tabular data, bullet lists for short
  comparisons, and short paragraphs for explanations.
- If the user's question is ambiguous (e.g., no time period), ask one clarifying
  question instead of guessing.
- Never expose internal IDs unless asked.
- Today is {{today}} (UTC).
- The user's role is admin/supervisor; you may suggest actions but cannot perform them.`
```

- [ ] **Step 6: Schedule daily retention via Asynq**

Locate the Asynq scheduler / cron registration block (look for `asynq.NewScheduler` or similar). Add:

```go
if copilotEnabled {
    if scheduler != nil { // existing scheduler variable
        if _, err := scheduler.Register("@daily", asynq.NewTask(jobs.TypeCopilotRetentionPurge, nil)); err != nil {
            slog.Error("failed to schedule copilot retention", "err", err)
        }
    }
}
```

- [ ] **Step 7: Build and run integration smoke**

Run: `cd apps/backend && go build ./...`
Expected: success.

Run: `cd apps/backend && go test ./...`
Expected: all package tests pass.

Run a manual smoke check (with docker-compose Postgres up, `COPILOT_ANTHROPIC_API_KEY` set to a real key — or expect the request to fail with 401 from Anthropic, which still proves the wiring is live):

```bash
# Terminal 1
cd apps/backend && pnpm nx serve backend

# Terminal 2
TOKEN=$(... obtain JWT from /auth/login ...)
curl -i -X POST http://localhost:3001/api/copilot/threads \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"locale":"en"}'
# expect: 201 with {"id":"..."}

curl -i http://localhost:3001/api/copilot/quota -H "Authorization: Bearer $TOKEN"
# expect: 200 {"enabled":true} or {"enabled":false} based on plan

curl -N -X POST "http://localhost:3001/api/copilot/threads/<id>/messages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Hello"}'
# expect: SSE stream with message_start, text_delta..., message_complete
```

- [ ] **Step 8: Commit**

```bash
git add apps/backend/cmd/api/main.go apps/backend/cmd/api/copilot_adapters.go apps/backend/.env.example
git commit -m "feat(copilot): wire copilot into cmd/api with adapters and routes"
```

---

## Task 20: Regenerate OpenAPI and Orval

**Files:**
- Regenerate: `apps/backend/docs/openapi.json` (and any swag-generated `docs/`)
- Regenerate: `apps/frontend/src/lib/api/generated/**`

- [ ] **Step 1: Regenerate backend OpenAPI**

Run: `pnpm nx openapi backend`
Expected: success; new endpoints `/api/copilot/...` appear in `apps/backend/docs/openapi.json` under tag `copilot`.

- [ ] **Step 2: Regenerate frontend Orval client**

Run: `pnpm nx orval frontend`
Expected: success; new TS types and hooks appear under `apps/frontend/src/lib/api/generated/`.

- [ ] **Step 3: Run CI sync checks**

Run: `pnpm nx run frontend:openapi:check` (or whatever the project's openapi-check target is named — see `nx graph` if unsure).
Expected: PASS — generated files match git.

- [ ] **Step 4: Commit generated artifacts**

```bash
git add apps/backend/docs apps/frontend/src/lib/api/generated
git commit -m "chore(copilot): regenerate OpenAPI spec and Orval client"
```

---

## Task 21: Frontend lib — SSE event types and page-context helper

**Files:**
- Create: `apps/frontend/lib/copilot/sse-events.ts`
- Create: `apps/frontend/lib/copilot/page-context.ts`
- Create: `apps/frontend/lib/copilot/page-context.test.ts`

- [ ] **Step 1: Write SSE event types**

Create `apps/frontend/lib/copilot/sse-events.ts`:

```ts
// Discriminated union of SSE events emitted by /api/copilot/threads/:id/messages.
// Wire format mirrors apps/backend/internal/copilot/agent/streaming.go.

export type CopilotSseEvent =
  | { type: 'message_start'; data: { messageId: string } }
  | { type: 'text_delta'; data: { delta: string } }
  | {
      type: 'tool_call_started';
      data: { callId: string; name: string; argsSummary: unknown };
    }
  | {
      type: 'tool_call_completed';
      data: {
        callId: string;
        name: string;
        status: 'ok' | 'rbac_denied' | 'invalid_args' | 'error' | 'timeout';
        durationMs: number;
        resultSummary: unknown;
      };
    }
  | { type: 'citation'; data: { toolName: string; ref: string; title?: string } }
  | {
      type: 'message_complete';
      data: {
        messageId: string;
        tokensIn: number;
        tokensOut: number;
        costUsdMicros: number;
      };
    }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } };
```

- [ ] **Step 2: Write failing tests for `page-context.ts`**

Create `apps/frontend/lib/copilot/page-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { capturePageContext, summarizeForChip } from './page-context';

describe('capturePageContext', () => {
  it('extracts pathname and locale', () => {
    const ctx = capturePageContext({
      pathname: '/en/statistics/u1',
      locale: 'en',
      params: { unitId: 'u1' },
    });
    expect(ctx.pathname).toBe('/en/statistics/u1');
    expect(ctx.locale).toBe('en');
    expect(ctx.entities).toEqual({ unitId: 'u1' });
  });

  it('drops undefined entity ids', () => {
    const ctx = capturePageContext({
      pathname: '/en/units',
      locale: 'en',
      params: { unitId: undefined as unknown as string },
    });
    expect(ctx.entities).toEqual({});
  });

  it('summary is human-readable', () => {
    const summary = summarizeForChip({
      pathname: '/en/statistics/u1',
      locale: 'en',
      entities: { unitId: 'u1' },
    });
    expect(summary).toContain('Statistics');
    expect(summary).toContain('u1');
  });
});
```

- [ ] **Step 3: Verify tests fail**

Run: `cd apps/frontend && pnpm vitest run lib/copilot/page-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `page-context.ts`**

Create `apps/frontend/lib/copilot/page-context.ts`:

```ts
export interface PageContext {
  pathname: string;
  locale: string;
  entities: Record<string, string>;
}

export interface PageContextInput {
  pathname: string;
  locale: string;
  params?: Record<string, string | undefined>;
}

export function capturePageContext(input: PageContextInput): PageContext {
  const entities: Record<string, string> = {};
  if (input.params) {
    for (const [k, v] of Object.entries(input.params)) {
      if (typeof v === 'string' && v.length > 0) entities[k] = v;
    }
  }
  return {
    pathname: input.pathname,
    locale: input.locale,
    entities,
  };
}

const SECTION_LABELS: Record<string, string> = {
  statistics: 'Statistics',
  supervisor: 'Supervisor',
  staff: 'Staff',
  queue: 'Queue',
  kiosk: 'Kiosk',
  settings: 'Settings',
  clients: 'Clients',
  journal: 'Journal',
};

export function summarizeForChip(ctx: PageContext): string {
  const parts = ctx.pathname.split('/').filter(Boolean);
  // Drop the leading locale segment (e.g. "en", "ru").
  const trimmed = parts[0]?.length === 2 ? parts.slice(1) : parts;
  const section = trimmed[0] ? SECTION_LABELS[trimmed[0]] ?? trimmed[0] : 'Page';
  const entityChunks = Object.entries(ctx.entities).map(([k, v]) => `${k}: ${v}`);
  return entityChunks.length > 0 ? `${section} — ${entityChunks.join(', ')}` : section;
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd apps/frontend && pnpm vitest run lib/copilot/page-context.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/lib/copilot/
git commit -m "feat(copilot): add SSE event types and page-context helper"
```

---

## Task 22: Frontend hooks — `useCopilotStream` and `usePageContext`

**Files:**
- Create: `apps/frontend/components/copilot/hooks/usePageContext.ts`
- Create: `apps/frontend/components/copilot/hooks/useCopilotStream.ts`
- Create: `apps/frontend/components/copilot/hooks/index.ts`
- Create: `apps/frontend/components/copilot/hooks/useCopilotStream.test.tsx`

- [ ] **Step 1: Write `usePageContext` hook**

Create `apps/frontend/components/copilot/hooks/usePageContext.ts`:

```ts
'use client';

import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { capturePageContext, type PageContext } from '@/lib/copilot/page-context';

/**
 * usePageContext snapshots the current route + params for inclusion in a Copilot
 * message. This is read-only — re-rendering on route change refreshes the snapshot.
 */
export function usePageContext(locale: string): PageContext {
  const pathname = usePathname() ?? '';
  const params = useParams() ?? {};
  return useMemo(() => {
    const flat: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string') flat[k] = v;
      else if (Array.isArray(v) && typeof v[0] === 'string') flat[k] = v[0];
    }
    return capturePageContext({ pathname, locale, params: flat });
  }, [pathname, locale, params]);
}
```

- [ ] **Step 2: Write `useCopilotStream` hook**

Create `apps/frontend/components/copilot/hooks/useCopilotStream.ts`:

```ts
'use client';

import { useCallback, useRef, useState } from 'react';
import type { CopilotSseEvent } from '@/lib/copilot/sse-events';

export interface StreamSendInput {
  threadId: string;
  content: string;
  pageContext?: unknown;
  authHeader: string; // "Bearer <jwt>"
}

export interface StreamSendOptions {
  onEvent: (e: CopilotSseEvent) => void;
}

export interface CopilotStreamHandle {
  isStreaming: boolean;
  send: (input: StreamSendInput, opts: StreamSendOptions) => Promise<void>;
  abort: () => void;
}

/**
 * useCopilotStream consumes the SSE stream from POST /api/copilot/threads/:id/messages.
 * It uses fetch + ReadableStream rather than EventSource because the endpoint is POST.
 */
export function useCopilotStream(): CopilotStreamHandle {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (input: StreamSendInput, opts: StreamSendOptions) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/copilot/threads/${encodeURIComponent(input.threadId)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: input.authHeader,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ content: input.content, page_context: input.pageContext ?? null }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        opts.onEvent({
          type: 'error',
          data: { code: `http_${res.status}`, message: await res.text(), retryable: res.status >= 500 },
        });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let dataLines: string[] = [];

      const dispatch = () => {
        if (!currentEvent || dataLines.length === 0) {
          currentEvent = '';
          dataLines = [];
          return;
        }
        try {
          const json = dataLines.join('\n');
          const parsed = JSON.parse(json) as CopilotSseEvent;
          opts.onEvent(parsed);
        } catch {
          // ignore unparseable
        }
        currentEvent = '';
        dataLines = [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          dispatch();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line === '') {
            dispatch();
            continue;
          }
          if (line.startsWith(':')) continue; // heartbeat
          if (line.startsWith('event: ')) currentEvent = line.slice(7);
          else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        opts.onEvent({
          type: 'error',
          data: { code: 'network', message: (err as Error).message, retryable: true },
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  return { isStreaming, send, abort };
}
```

- [ ] **Step 3: Write hooks index re-export**

Create `apps/frontend/components/copilot/hooks/index.ts`:

```ts
export { useCopilotStream } from './useCopilotStream';
export type { CopilotStreamHandle, StreamSendInput, StreamSendOptions } from './useCopilotStream';
export { usePageContext } from './usePageContext';
```

- [ ] **Step 4: Write a smoke test for the hook (using mocked fetch)**

Create `apps/frontend/components/copilot/hooks/useCopilotStream.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopilotStream } from './useCopilotStream';

function sseChunk(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function mockSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('useCopilotStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses event/data pairs into onEvent callbacks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockSseResponse([
        sseChunk('message_start', { messageId: 'm1' }),
        sseChunk('text_delta', { delta: 'Hi ' }),
        sseChunk('text_delta', { delta: 'there' }),
        sseChunk('message_complete', { messageId: 'm1', tokensIn: 5, tokensOut: 2, costUsdMicros: 0 }),
      ]),
    );

    const events: unknown[] = [];
    const { result } = renderHook(() => useCopilotStream());
    await act(async () => {
      await result.current.send(
        { threadId: 't1', content: 'Hi', authHeader: 'Bearer x' },
        { onEvent: (e) => events.push(e) },
      );
    });

    expect(events).toEqual([
      { type: 'message_start', data: { messageId: 'm1' } },
      { type: 'text_delta', data: { delta: 'Hi ' } },
      { type: 'text_delta', data: { delta: 'there' } },
      { type: 'message_complete', data: { messageId: 'm1', tokensIn: 5, tokensOut: 2, costUsdMicros: 0 } },
    ]);
    expect(result.current.isStreaming).toBe(false);
  });

  it('emits a structured error event on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    );
    const events: unknown[] = [];
    const { result } = renderHook(() => useCopilotStream());
    await act(async () => {
      await result.current.send(
        { threadId: 't1', content: 'x', authHeader: 'Bearer x' },
        { onEvent: (e) => events.push(e) },
      );
    });
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('error');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd apps/frontend && pnpm vitest run components/copilot/hooks/useCopilotStream.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/copilot/hooks/
git commit -m "feat(copilot): add useCopilotStream and usePageContext hooks"
```

---

## Task 23: Frontend — `CopilotProvider` context + i18n strings

**Files:**
- Create: `apps/frontend/components/copilot/CopilotProvider.tsx`
- Create: `apps/frontend/messages/en/copilot.json`
- Create: `apps/frontend/messages/ru/copilot.json`

- [ ] **Step 1: Create i18n strings (English)**

Create `apps/frontend/messages/en/copilot.json`:

```json
{
  "drawerTitle": "Copilot",
  "openButton": "Ask Copilot",
  "closeButton": "Close Copilot",
  "composerPlaceholder": "Ask anything about your queues, units, or stats…",
  "send": "Send",
  "abort": "Stop",
  "attachPageContext": "Attach page context",
  "pageContextChip": "Page: {summary}",
  "removePageContext": "Remove page context",
  "newThread": "New conversation",
  "examples": {
    "title": "Try one of these",
    "items": [
      "Why did the average wait grow yesterday in unit X?",
      "Top 3 services by abandonment rate this month",
      "Show NPS by service for the last 30 days",
      "Which counter served the most clients last week?",
      "Find recent SLA breaches in the Almaty unit",
      "What is happening today across all units?"
    ]
  },
  "toolCall": {
    "running": "Running {name}…",
    "complete": "{name} ({durationMs} ms)",
    "denied": "Permission denied for {name}",
    "error": "{name} failed: {message}"
  },
  "errors": {
    "featureDisabled": "Copilot is not enabled for your plan.",
    "unauthorized": "Please sign in.",
    "network": "Connection lost. Retry?"
  },
  "tokenFooter": "Used {tokens} tokens"
}
```

- [ ] **Step 2: Create i18n strings (Russian)**

Create `apps/frontend/messages/ru/copilot.json`:

```json
{
  "drawerTitle": "Copilot",
  "openButton": "Спросить Copilot",
  "closeButton": "Закрыть Copilot",
  "composerPlaceholder": "Спросите про очереди, филиалы или статистику…",
  "send": "Отправить",
  "abort": "Остановить",
  "attachPageContext": "Прикрепить контекст страницы",
  "pageContextChip": "Страница: {summary}",
  "removePageContext": "Убрать контекст",
  "newThread": "Новый диалог",
  "examples": {
    "title": "Попробуйте один из вариантов",
    "items": [
      "Почему вчера выросло среднее ожидание в филиале X?",
      "Топ-3 услуги по доле уходов в этом месяце",
      "NPS по услугам за последние 30 дней",
      "Какой counter обслужил больше всего клиентов на прошлой неделе?",
      "Недавние нарушения SLA в филиале Almaty",
      "Что происходит сегодня по всем филиалам?"
    ]
  },
  "toolCall": {
    "running": "Выполняется {name}…",
    "complete": "{name} ({durationMs} мс)",
    "denied": "Нет доступа к {name}",
    "error": "{name} завершился с ошибкой: {message}"
  },
  "errors": {
    "featureDisabled": "Copilot не включён в ваш тариф.",
    "unauthorized": "Войдите в систему.",
    "network": "Соединение потеряно. Повторить?"
  },
  "tokenFooter": "Использовано {tokens} токенов"
}
```

> If the project uses a single `messages/<locale>.json` instead of per-feature files, merge these keys under a `copilot` namespace into the existing files.

- [ ] **Step 3: Implement `CopilotProvider`**

Create `apps/frontend/components/copilot/CopilotProvider.tsx`:

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocale } from 'next-intl';
import { usePageContext } from './hooks';
import type { PageContext } from '@/lib/copilot/page-context';

export interface CopilotContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  currentThreadId: string | null;
  setCurrentThreadId: (id: string | null) => void;
  pageContext: PageContext;
  attachPageContext: boolean;
  setAttachPageContext: (v: boolean) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [attachPageContext, setAttachPageContext] = useState(true);
  const pageContext = usePageContext(locale);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo<CopilotContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      currentThreadId,
      setCurrentThreadId,
      pageContext,
      attachPageContext,
      setAttachPageContext,
    }),
    [isOpen, open, close, toggle, currentThreadId, pageContext, attachPageContext],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotContextValue {
  const v = useContext(CopilotContext);
  if (!v) throw new Error('useCopilot must be used inside <CopilotProvider>');
  return v;
}
```

- [ ] **Step 4: Verify type-check**

Run: `cd apps/frontend && pnpm tsc --noEmit`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/copilot/CopilotProvider.tsx apps/frontend/messages/en/copilot.json apps/frontend/messages/ru/copilot.json
git commit -m "feat(copilot): add Copilot context provider and i18n strings"
```

---

## Task 24: Frontend — Drawer, Composer, MessageList, MessageBubble, ToolCallCard, EmptyState

This task scaffolds the visible UI. Tests are minimal (vitest snapshot-style smoke + interaction sanity); the real validation is the smoke E2E in Task 26.

**Files:**
- Create: `apps/frontend/components/copilot/CopilotDrawer.tsx`
- Create: `apps/frontend/components/copilot/Composer.tsx`
- Create: `apps/frontend/components/copilot/PageContextChip.tsx`
- Create: `apps/frontend/components/copilot/MessageList.tsx`
- Create: `apps/frontend/components/copilot/MessageBubble.tsx`
- Create: `apps/frontend/components/copilot/ToolCallCard.tsx`
- Create: `apps/frontend/components/copilot/EmptyState.tsx`
- Create: `apps/frontend/components/copilot/CopilotDrawer.test.tsx`

- [ ] **Step 1: `EmptyState`**

Create `apps/frontend/components/copilot/EmptyState.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

interface Props {
  onPick: (text: string) => void;
}

export function EmptyState({ onPick }: Props) {
  const t = useTranslations('copilot.examples');
  const items = (t.raw('items') as string[]) ?? [];
  return (
    <div className="px-4 py-8 text-sm">
      <p className="mb-3 font-medium">{t('title')}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="w-full rounded-md border bg-muted/40 px-3 py-2 text-left hover:bg-muted"
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: `ToolCallCard`**

Create `apps/frontend/components/copilot/ToolCallCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export interface ToolCallCardProps {
  name: string;
  status: 'running' | 'ok' | 'rbac_denied' | 'error' | 'timeout' | 'invalid_args';
  durationMs?: number;
  errorMessage?: string;
  resultSummary?: unknown;
}

const statusBadge: Record<ToolCallCardProps['status'], string> = {
  running: 'bg-amber-100 text-amber-900',
  ok: 'bg-emerald-100 text-emerald-900',
  rbac_denied: 'bg-red-100 text-red-900',
  error: 'bg-red-100 text-red-900',
  timeout: 'bg-red-100 text-red-900',
  invalid_args: 'bg-red-100 text-red-900',
};

export function ToolCallCard(props: ToolCallCardProps) {
  const t = useTranslations('copilot.toolCall');
  const [open, setOpen] = useState(false);
  const label =
    props.status === 'running'
      ? t('running', { name: props.name })
      : props.status === 'rbac_denied'
        ? t('denied', { name: props.name })
        : props.status === 'ok'
          ? t('complete', { name: props.name, durationMs: props.durationMs ?? 0 })
          : t('error', { name: props.name, message: props.errorMessage ?? '' });

  return (
    <div className="my-2 rounded-md border bg-muted/30 p-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadge[props.status]}`}>
            {props.status}
          </span>
          <span>{label}</span>
        </span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && props.resultSummary !== undefined && (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-2 text-[11px]">
          {JSON.stringify(props.resultSummary, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `MessageBubble`**

Create `apps/frontend/components/copilot/MessageBubble.tsx`:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolCallCard, type ToolCallCardProps } from './ToolCallCard';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallCardProps[];
  tokens?: { in: number; out: number; costMicros: number };
}

export function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`my-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        {message.toolCalls?.map((tc, i) => <ToolCallCard key={i} {...tc} />)}
        <div className="prose prose-sm max-w-none break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          {message.isStreaming && <span className="ml-0.5 animate-pulse">▌</span>}
        </div>
        {message.tokens && (
          <p className="mt-2 text-[10px] opacity-70">
            {message.tokens.in + message.tokens.out} tokens
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `MessageList`**

Create `apps/frontend/components/copilot/MessageList.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble, type CopilotMessage } from './MessageBubble';

interface Props {
  messages: CopilotMessage[];
}

export function MessageList({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  return (
    <div className="flex-1 overflow-y-auto px-4 py-2" aria-live="polite">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 5: `PageContextChip` and `Composer`**

Create `apps/frontend/components/copilot/PageContextChip.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { summarizeForChip, type PageContext } from '@/lib/copilot/page-context';

interface Props {
  ctx: PageContext;
  onRemove: () => void;
}

export function PageContextChip({ ctx, onRemove }: Props) {
  const t = useTranslations('copilot');
  return (
    <div className="mb-2 flex w-fit items-center gap-2 rounded-full border bg-muted/40 px-2 py-1 text-xs">
      <span>{t('pageContextChip', { summary: summarizeForChip(ctx) })}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('removePageContext')}
        className="opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
```

Create `apps/frontend/components/copilot/Composer.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useCopilot } from './CopilotProvider';
import { PageContextChip } from './PageContextChip';

interface Props {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onAbort: () => void;
}

export function Composer({ onSend, isStreaming, onAbort }: Props) {
  const t = useTranslations('copilot');
  const { pageContext, attachPageContext, setAttachPageContext } = useCopilot();
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <form onSubmit={submit} className="border-t p-3">
      {attachPageContext && (
        <PageContextChip ctx={pageContext} onRemove={() => setAttachPageContext(false)} />
      )}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={t('composerPlaceholder')}
          className="flex-1 resize-none rounded border bg-background p-2 text-sm focus:outline-none focus:ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as FormEvent);
            }
          }}
        />
        {isStreaming ? (
          <button type="button" onClick={onAbort} className="rounded bg-destructive px-3 text-sm text-white">
            {t('abort')}
          </button>
        ) : (
          <button type="submit" className="rounded bg-primary px-3 text-sm text-primary-foreground">
            {t('send')}
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 6: `CopilotDrawer`**

Create `apps/frontend/components/copilot/CopilotDrawer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCopilot } from './CopilotProvider';
import { Composer } from './Composer';
import { EmptyState } from './EmptyState';
import { MessageList } from './MessageList';
import type { CopilotMessage } from './MessageBubble';
import { useCopilotStream } from './hooks';
import type { CopilotSseEvent } from '@/lib/copilot/sse-events';

const DRAWER_WIDTH_KEY = 'copilot.drawerWidth';

async function ensureThread(authHeader: string, locale: string): Promise<string> {
  const res = await fetch('/api/copilot/threads', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) throw new Error(`createThread failed: ${res.status}`);
  const { id } = (await res.json()) as { id: string };
  return id;
}

interface Props {
  /** Returns "Bearer <jwt>"; provided by app shell. */
  getAuthHeader: () => string;
  /** Caller's locale for thread creation. */
  locale: string;
}

export function CopilotDrawer({ getAuthHeader, locale }: Props) {
  const { isOpen, close, currentThreadId, setCurrentThreadId, pageContext, attachPageContext } = useCopilot();
  const t = useTranslations('copilot');
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 480;
    const v = Number(window.localStorage.getItem(DRAWER_WIDTH_KEY));
    return v > 0 ? v : 480;
  });
  const stream = useCopilotStream();

  // Persist width.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DRAWER_WIDTH_KEY, String(width));
  }, [width]);

  const onSend = useCallback(
    async (text: string) => {
      let threadId = currentThreadId;
      const auth = getAuthHeader();
      if (!threadId) {
        threadId = await ensureThread(auth, locale);
        setCurrentThreadId(threadId);
      }
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text },
        { id: 'streaming', role: 'assistant', text: '', isStreaming: true, toolCalls: [] },
      ]);
      await stream.send(
        {
          threadId,
          content: text,
          pageContext: attachPageContext ? pageContext : null,
          authHeader: auth,
        },
        {
          onEvent: (e) => setMessages((prev) => applyEvent(prev, e)),
        },
      );
      setMessages((prev) => prev.map((m) => (m.id === 'streaming' ? { ...m, isStreaming: false, id: m.id === 'streaming' ? crypto.randomUUID() : m.id } : m)));
    },
    [attachPageContext, currentThreadId, getAuthHeader, locale, pageContext, setCurrentThreadId, stream],
  );

  if (!isOpen) return null;

  return (
    <aside
      role="dialog"
      aria-label={t('drawerTitle')}
      style={{ width: `${width}px` }}
      className="fixed right-0 top-0 z-40 flex h-full flex-col border-l bg-background shadow-2xl"
    >
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">{t('drawerTitle')}</h2>
        <button
          type="button"
          onClick={close}
          aria-label={t('closeButton')}
          className="rounded px-2 hover:bg-muted"
        >
          ×
        </button>
      </header>
      <div className="flex-1 overflow-hidden">
        {messages.length === 0 ? (
          <EmptyState onPick={(text) => onSend(text)} />
        ) : (
          <MessageList messages={messages} />
        )}
      </div>
      <Composer onSend={onSend} isStreaming={stream.isStreaming} onAbort={stream.abort} />
      <ResizeHandle width={width} onChange={setWidth} />
    </aside>
  );
}

function ResizeHandle({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      const next = Math.min(640, Math.max(360, startW + (startX - ev.clientX)));
      onChange(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-transparent hover:bg-primary/40"
      aria-hidden
    />
  );
}

function applyEvent(prev: CopilotMessage[], e: CopilotSseEvent): CopilotMessage[] {
  return prev.map((m) => {
    if (m.id !== 'streaming') return m;
    switch (e.type) {
      case 'text_delta':
        return { ...m, text: m.text + e.data.delta };
      case 'tool_call_started':
        return {
          ...m,
          toolCalls: [...(m.toolCalls ?? []), { name: e.data.name, status: 'running' }],
        };
      case 'tool_call_completed': {
        const updated = (m.toolCalls ?? []).slice();
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].name === e.data.name && updated[i].status === 'running') {
            updated[i] = {
              name: e.data.name,
              status: e.data.status as 'ok' | 'rbac_denied' | 'error' | 'timeout' | 'invalid_args',
              durationMs: e.data.durationMs,
              resultSummary: e.data.resultSummary,
            };
            break;
          }
        }
        return { ...m, toolCalls: updated };
      }
      case 'message_complete':
        return {
          ...m,
          tokens: { in: e.data.tokensIn, out: e.data.tokensOut, costMicros: e.data.costUsdMicros },
        };
      default:
        return m;
    }
  });
}
```

- [ ] **Step 7: Smoke test for the drawer**

Create `apps/frontend/components/copilot/CopilotDrawer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CopilotProvider, useCopilot } from './CopilotProvider';
import { CopilotDrawer } from './CopilotDrawer';
import enMessages from '@/messages/en/copilot.json';

function Opener() {
  const { open } = useCopilot();
  // open immediately; component opens once mounted.
  open();
  return null;
}

describe('<CopilotDrawer>', () => {
  it('renders drawer header and composer when open', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    render(
      <NextIntlClientProvider locale="en" messages={{ copilot: enMessages }}>
        <CopilotProvider>
          <Opener />
          <CopilotDrawer getAuthHeader={() => 'Bearer x'} locale="en" />
        </CopilotProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('dialog', { name: enMessages.drawerTitle })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(enMessages.composerPlaceholder)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd apps/frontend && pnpm vitest run components/copilot/`
Expected: PASS — all tests in this directory.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/components/copilot/
git commit -m "feat(copilot): add Copilot drawer, composer, message list, tool-call card"
```

---

## Task 25: Mount provider and drawer in `app-layout.tsx`

**Files:**
- Modify: `apps/frontend/app/[locale]/app-layout.tsx`

- [ ] **Step 1: Wrap children with `<CopilotProvider>` and mount drawer**

Open `apps/frontend/app/[locale]/app-layout.tsx`. Find the existing top-level providers (likely `TanStackQueryProvider`, `NextIntlClientProvider`, etc.). Add:

```tsx
import { CopilotProvider } from '@/components/copilot/CopilotProvider';
import { CopilotDrawer } from '@/components/copilot/CopilotDrawer';
// ... existing imports ...

// Inside the component tree, after the auth provider but inside i18n provider:
<CopilotProvider>
  {children}
  <CopilotDrawer
    getAuthHeader={() => `Bearer ${getAccessTokenSync() ?? ''}`}
    locale={locale}
  />
</CopilotProvider>
```

Where `getAccessTokenSync` is the existing helper (look in `lib/api.ts` / `lib/authenticated-api-fetch.ts` for the project's token accessor).

- [ ] **Step 2: Add an "Ask Copilot" trigger to the sidebar**

Open `apps/frontend/components/AppSidebar.tsx`. Add a button near the top that calls `useCopilot().open()`. Use the `Sparkles` icon from `lucide-react` (already a dependency).

```tsx
import { Sparkles } from 'lucide-react';
import { useCopilot } from '@/components/copilot/CopilotProvider';
// ...
const { open } = useCopilot();
// ...
<button
  type="button"
  onClick={open}
  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
>
  <Sparkles size={16} />
  {t('copilot.openButton')}
</button>
```

- [ ] **Step 3: Hotkey toggle**

In `CopilotProvider.tsx`, add a global hotkey (`⌘+Shift+L` / `Ctrl+Shift+L`) — append inside the provider:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      toggle();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [toggle]);
```

- [ ] **Step 4: Verify type-check + run unit tests**

Run: `cd apps/frontend && pnpm tsc --noEmit && pnpm vitest run components/copilot/`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/app/[locale]/app-layout.tsx apps/frontend/components/AppSidebar.tsx apps/frontend/components/copilot/CopilotProvider.tsx
git commit -m "feat(copilot): mount Copilot in app-layout and sidebar"
```

---

## Task 26: End-to-end smoke test (testplane)

**Files:**
- Create: `apps/frontend/.testplane/tests/copilot-smoke.testplane.ts`

The smoke test verifies the drawer opens and a stubbed-stream response renders. The backend is mocked at the network layer using testplane's mocking, since hitting a real LLM in CI is not desirable.

- [ ] **Step 1: Write the smoke test**

Create `apps/frontend/.testplane/tests/copilot-smoke.testplane.ts`:

```ts
// Adapt to project's testplane test format. The pattern below assumes the existing
// scaffold in apps/frontend/.testplane (look for sibling tests for reference).

import { describe, it, expect } from 'testplane';

describe('Copilot smoke', () => {
  it('opens the drawer, sends a message, and shows a streamed reply', async function () {
    await this.browser.url('/en');
    // Login (use the existing test login helper used by other tests).
    await this.browser.execute(() => {
      // place a JWT in storage for tests; adapt to project setup.
    });

    // Mock POST /api/copilot/threads → returns id
    await this.browser.mock(/\/api\/copilot\/threads$/, () => ({
      status: 201,
      body: JSON.stringify({ id: 'demo' }),
    }));

    // Mock POST /api/copilot/threads/demo/messages with an SSE response.
    await this.browser.mock(/\/api\/copilot\/threads\/demo\/messages$/, () => {
      const sse =
        'event: message_start\ndata: {"messageId":"m1"}\n\n' +
        'event: text_delta\ndata: {"delta":"Hello "}\n\n' +
        'event: text_delta\ndata: {"delta":"there"}\n\n' +
        'event: message_complete\ndata: {"messageId":"m1","tokensIn":4,"tokensOut":2,"costUsdMicros":0}\n\n';
      return {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sse,
      };
    });

    // Trigger sidebar open
    await this.browser.click('button*=Ask Copilot');
    await this.browser.waitForExist('[role="dialog"]');

    // Type a message + send
    const composer = await this.browser.$('textarea');
    await composer.setValue('Hi');
    await this.browser.keys(['Enter']);

    // Wait for "Hello there"
    await this.browser.waitUntil(async () => {
      const text = await this.browser.$('[role="dialog"]').getText();
      return text.includes('Hello there');
    }, { timeout: 5000 });

    expect(await this.browser.$('[role="dialog"]').isDisplayed()).toBe(true);
  });
});
```

> Adapt `this.browser.mock` to the project's actual testplane mocking API (some setups use `interceptor` or `requestInterception`). If the project doesn't have a network-mocking abstraction yet, this test can be skipped (`it.skip(...)`); the unit-level coverage in Task 22 is sufficient for Phase 1 sign-off.

- [ ] **Step 2: Run the smoke test (best-effort)**

Run: `pnpm nx testplane frontend -- --filter copilot-smoke`
Expected: PASS, or document the skip reason.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/.testplane/tests/copilot-smoke.testplane.ts
git commit -m "test(copilot): add smoke E2E for drawer streaming"
```

---

## Task 27: Minimal OTel spans

Phase 1 ships a thin slice of the observability hierarchy from spec §11.1:
- `copilot.handle_message` (handler-level)
- `copilot.agent.iter` (one per loop iteration)
- `copilot.tool_call.<name>` (per dispatch)

Full Grafana dashboards and quantile metrics are deferred to Phase 3. The goal here is "events show up in Jaeger / OTLP receiver" so production debugging works.

**Files:**
- Modify: `apps/backend/internal/copilot/handlers/chat.go`
- Modify: `apps/backend/internal/copilot/agent/loop.go`
- Modify: `apps/backend/internal/copilot/tools/registry.go`

- [ ] **Step 1: Add a span around `Registry.Dispatch`**

In `apps/backend/internal/copilot/tools/registry.go`, replace the body of `Dispatch` with:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/trace"
)

var tracer = otel.Tracer("quokkaq/copilot/tools")

func (r *Registry) Dispatch(ctx context.Context, tctx ToolCtx, name string, args json.RawMessage) (Result, error) {
    ctx, span := tracer.Start(ctx, "copilot.tool_call",
        trace.WithAttributes(
            attribute.String("copilot.tool", name),
            attribute.String("copilot.company_id", tctx.CompanyID),
            attribute.String("copilot.user_id", tctx.UserID),
            attribute.String("copilot.thread_id", tctx.ThreadID),
            attribute.String("copilot.request_id", tctx.RequestID),
        ),
    )
    defer span.End()

    r.mu.RLock()
    t, ok := r.tools[name]
    r.mu.RUnlock()
    if !ok {
        span.SetAttributes(attribute.String("copilot.tool.status", "not_found"))
        return Result{}, fmt.Errorf("%w: %s", ErrToolNotFound, name)
    }
    if !hasAnyScope(tctx.Roles, t.RequiredScopes) {
        span.SetAttributes(attribute.String("copilot.tool.status", "rbac_denied"))
        return Result{}, fmt.Errorf("%w: %s requires %v", ErrRBACDenied, name, t.RequiredScopes)
    }
    started := time.Now()
    out, err := t.Handler(tctx, args)
    out.DurationMs = int(time.Since(started) / time.Millisecond)
    status := "ok"
    if err != nil {
        status = "error"
        span.RecordError(err)
    }
    span.SetAttributes(
        attribute.String("copilot.tool.status", status),
        attribute.Int("copilot.tool.duration_ms", out.DurationMs),
    )
    return out, err
}
```

- [ ] **Step 2: Wrap each loop iteration with a span**

In `apps/backend/internal/copilot/agent/loop.go`, at the top of the `for iter` body:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
)

var tracer = otel.Tracer("quokkaq/copilot/agent")

// ... inside Run, before the for loop
for iter := 0; iter < l.policy.MaxIterations; iter++ {
    iterCtx, iterSpan := tracer.Start(turnCtx, "copilot.agent.iter",
        attribute.Int("copilot.iter", iter),
    )
    // pass iterCtx instead of turnCtx into provider.StreamMessage and registry.Dispatch
    // ... existing body using iterCtx
    iterSpan.End()
}
```

The minimal change: rename `turnCtx` → `iterCtx` only inside the iteration loop body, and end the span at the bottom of the loop body. Make sure `iterSpan.End()` runs on every code path (use a closure or `defer` carefully).

- [ ] **Step 3: Wrap the chat handler invocation**

In `apps/backend/internal/copilot/handlers/chat.go`, at the top of `HandleMessage`:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
)

var tracer = otel.Tracer("quokkaq/copilot/handlers")

func (h *ChatHandler) HandleMessage(w http.ResponseWriter, r *http.Request) {
    ctx, span := tracer.Start(r.Context(), "copilot.handle_message")
    defer span.End()
    r = r.WithContext(ctx)
    // ... rest of handler
    span.SetAttributes(
        attribute.String("copilot.company_id", ident.CompanyID),
        attribute.String("copilot.user_id", ident.UserID),
        attribute.String("copilot.thread_id", threadID),
    )
    // ...
}
```

- [ ] **Step 4: Verify compile + tests still pass**

Run: `cd apps/backend && go build ./... && go test ./internal/copilot/...`
Expected: success.

- [ ] **Step 5: Manual sanity check**

Start the backend with `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at a local Jaeger or OTLP receiver. Hit `/api/copilot/threads/<id>/messages`. Inspect the trace; expect a span tree:

```
copilot.handle_message
└── copilot.agent.iter (0)
    └── copilot.tool_call (list_units)
└── copilot.agent.iter (1)
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/internal/copilot/tools/registry.go apps/backend/internal/copilot/agent/loop.go apps/backend/internal/copilot/handlers/chat.go
git commit -m "feat(copilot): add OTel spans for handler, agent iter, and tool dispatch"
```

---

## Acceptance criteria (Phase 1 sign-off)

Phase 1 is done when:

1. `cd apps/backend && go build ./...` succeeds.
2. `cd apps/backend && go test ./...` passes for all touched packages (subscriptionfeatures, repository, jobs, copilot/conversation, copilot/gateway, copilot/tools, copilot/agent, copilot/quota).
3. `cd apps/frontend && pnpm vitest run components/copilot/ lib/copilot/` passes.
4. `pnpm nx openapi backend && pnpm nx orval frontend` produce no diffs after running them locally — meaning the in-repo generated artifacts are in sync with the code.
5. With `COPILOT_ENABLED=true` and a real `COPILOT_ANTHROPIC_API_KEY`, an admin user can:
   - GET `/api/copilot/quota` → `{"enabled":true}`
   - POST `/api/copilot/threads` → 201 with `{"id":"..."}`
   - POST `/api/copilot/threads/<id>/messages` with `{"content":"How was unit X yesterday?"}` and observe SSE events: `message_start`, ≥1 `tool_call_started`/`tool_call_completed`, ≥1 `text_delta`, `message_complete`.
   - Open the Copilot drawer via the sidebar, send the same question, see a streamed reply with at least one tool-call card.
6. With `COPILOT_ENABLED=false` (or plan-feature off), `/api/copilot/quota` → `{"enabled":false}` and the drawer's "Ask Copilot" trigger is hidden (gated by quota response).
7. Daily Asynq scheduler shows a `copilot:retention_purge` task entry; running it manually via `asynq cli` deletes a thread whose `updated_at` is older than `COPILOT_RETENTION_DAYS`.

## Out of Phase 1 — explicit deferrals (forwarded to Phase 2 / 3 plans)

- Wiki KB / pgvector indexing pipeline + `search_wiki` tool — **Phase 2**.
- YandexGPT or GigaChat adapter, multi-provider per-tenant config — **Phase 2**.
- Command palette integration (`⌘+K` "Ask Copilot…") — **Phase 2**.
- Citation pills + improved tool-call card UI — **Phase 2**.
- Eval harness / golden-set CI gate — **Phase 2**.
- Entity-lookup tools (`lookup_ticket`, `search_clients`, `lookup_support_report`, `search_audit_events`, `get_staff_performance`, `get_survey_aggregates`, `get_sla_breaches`) — **Phase 3**.
- Full PII tag walker + property-based fuzz — **Phase 3**.
- Per-plan token quotas, cost dashboard, in-app help — **Phase 3**.
- Accessibility audit — **Phase 3**.

These are tracked in the design doc and will become separate plan files (`...-plan-2-rag-and-providers.md`, `...-plan-3-entity-tools-and-quotas.md`) once Phase 1 lands.

