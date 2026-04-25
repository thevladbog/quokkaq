# AI Copilot Phase 2 — RAG, Second Provider, Palette, Citations, Eval Harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase 1 demoable to external customers and design partners. Add a wiki knowledge base with vector retrieval (so Copilot can answer "how do I configure SSO with Azure AD?"), a second LLM provider for RU data-residency customers, command-palette entry into the drawer, citation pills with deep links, an upgraded tool-call card UI, and an eval harness that gates prompt/tool changes in CI.

**Architecture:** pgvector on existing Postgres holds chunked wiki content with locale and section metadata. A new embedder layer behind the gateway abstraction (with a primary embedder per tenant + a fallback) computes vectors. The wiki indexer is an Asynq job triggered both by CI on wiki PRs and by an admin endpoint. The retriever runs cosine-similarity top-k filtered by locale and feeds the new `search_wiki` tool. A YandexGPT adapter (with IAM-token auth) joins Anthropic in the gateway registry; tenants pick provider via a new admin setting. The frontend's existing command palette (already in `components/`) gets a Copilot entry that opens the drawer with the typed query as a fresh thread. Tool-call cards gain a JSON-tree summary; citation pills render inline footnote-style links to `/help/<path>#<anchor>`. The eval harness is a CLI under `internal/copilot/eval/` that replays golden questions through the agent loop with a deterministic stub provider, asserts tool selection + rubric, and runs in CI on copilot or wiki changes.

**Tech Stack:**
- Backend: Go 1.26, pgvector (Postgres extension), `goldmark` for MDX parsing, `github.com/pgvector/pgvector-go`, existing `github.com/yandex-cloud/go-sdk/v2`, OTel, Asynq.
- Frontend: existing command palette infrastructure in `components/` (locate the existing palette component before Task 17), `react-markdown` (already), no new deps.
- Tests: stdlib `testing` + glebarezsqlite for non-vector paths; pgvector tests use docker-compose Postgres (one integration test file).

**Source spec:** `docs/plan/2026-04-25-ai-copilot-for-managers-design.md` §7 (KB), §2 (gateway adapters), §9.4 (palette), §11.3 (eval harness).

**Predecessor plan:** `docs/plan/2026-04-25-ai-copilot-plan-1-foundation.md` must be merged first. Phase 2 builds on those modules and does not refactor them.

**RU provider choice (locked-in for this plan):** **YandexGPT**, because (a) the codebase already has `github.com/yandex-cloud/go-sdk/v2` in `go.mod`, (b) Yandex IAM auth is well-documented and lets us use a service-account key out of the box, (c) it aligns with the existing Yandex Tracker integration. **GigaChat is the documented alternative** in Appendix A — its adapter has the same structure, only the auth flow differs (OAuth2 client credentials instead of service-account-keyed IAM). If first design partners need GigaChat instead, swap Tasks 8a–8d's adapter accordingly; the rest of the plan is provider-agnostic.

**Out of Phase 2 (handled in Phase 3 or deferred):** entity-lookup tools (`lookup_ticket`, `search_clients`, `lookup_support_report`, `search_audit_events`, `get_staff_performance`, `get_survey_aggregates`, `get_sla_breaches`); full PII tag walker; per-plan token quotas; cost dashboard; full Grafana boards; accessibility audit; visitor-facing Copilot; on-prem self-hosted LLM; custom-tenant tools.

---

## File Structure

### Backend — files created

```
apps/backend/internal/copilot/
├── gateway/
│   ├── yandex.go                       # YandexGPT adapter (function calling, streaming, IAM-token auth)
│   ├── yandex_test.go                  # contract test against mock HTTP
│   ├── yandex_iam.go                   # IAM token cache + refresh
│   ├── yandex_iam_test.go
│   ├── embedder.go                     # Embedder interface + factory by provider
│   ├── embedder_anthropic.go           # adapter — Anthropic has no native embeddings; routes to Voyage by default
│   ├── embedder_yandex.go              # YandexEmbeddings adapter
│   ├── embedder_test.go
│   ├── registry.go                     # MODIFIED: per-tenant provider selection
│   └── registry_test.go
├── kb/
│   ├── model.go                        # CopilotKBChunk struct (gorm)
│   ├── repository.go                   # KBChunkRepository
│   ├── repository_test.go              # uses docker-compose pgvector (skip if absent)
│   ├── chunker.go                      # MDX → plain → chunks (~500 tokens, 50 overlap)
│   ├── chunker_test.go
│   ├── indexer.go                      # IndexAll, IndexFile (orchestration)
│   ├── indexer_test.go
│   └── retriever.go                    # Retrieve(query, locale, k) → chunks with scores
├── tools/
│   ├── tool_search_wiki.go             # search_wiki tool (uses kb.Retriever)
│   └── tool_search_wiki_test.go
├── eval/
│   ├── runner.go                       # Run(ctx, suite) → Report
│   ├── runner_test.go
│   ├── golden/
│   │   ├── 001-unit-summary-en.yaml    # 30+ canonical questions
│   │   ├── 002-unit-summary-ru.yaml
│   │   ├── 003-service-breakdown-en.yaml
│   │   ├── ...                         # see Task 18
│   │   └── README.md                   # how to add new cases
│   ├── stub_provider.go                # deterministic fixture-driven LLM stub
│   ├── rubric.go                       # rubric matchers (must_mention, must_not_assert, locale)
│   ├── rubric_test.go
│   └── cmd/
│       └── main.go                     # binary: `go run ./internal/copilot/eval/cmd`
└── handlers/
    ├── kb_reindex.go                   # POST /api/copilot/kb/reindex (admin only)
    └── tenant_config.go                # GET/PATCH /api/copilot/tenant-config (admin only)

apps/backend/internal/jobs/
└── copilot_kb_index.go                 # TypeCopilotKBIndex Asynq handler
```

### Backend — files modified

- `apps/backend/internal/jobs/types.go` — add `TypeCopilotKBIndex`.
- `apps/backend/internal/jobs/client.go` — add `EnqueueCopilotKBIndex(args)`.
- `apps/backend/pkg/database/migratable_models.go` — register `models.CopilotKBChunk`.
- `apps/backend/internal/models/company.go` (or wherever the Company model lives) — add columns: `CopilotProvider`, `CopilotModel`, `CopilotEmbeddingProvider`, `CopilotPIILevel`, `CopilotLocalePref` (extends Phase 1 `CopilotEnabled`).
- `apps/backend/cmd/api/main.go` — wire YandexGPT, embedder factory, KB indexer/retriever, `search_wiki` tool, kb routes, palette-aware permissions.
- `apps/backend/.env.example` — add `COPILOT_YANDEX_*`, `COPILOT_VOYAGE_API_KEY`, `COPILOT_DEFAULT_EMBEDDER`, `COPILOT_KB_*`.

### Frontend — files created

```
apps/frontend/components/copilot/
├── CitationPill.tsx                    # inline footnote-style link
├── ToolCallCard.tsx                    # MODIFIED: collapsible JSON tree, status icons
└── PaletteCopilotEntry.tsx             # registers a "Ask Copilot…" command in the existing palette

apps/frontend/lib/copilot/
├── citations.ts                        # build /help/<path>#<anchor> URLs
└── citations.test.ts
```

### Frontend — files modified

- `apps/frontend/components/copilot/MessageBubble.tsx` — render citation pills inline (consumes `citation` SSE events).
- The existing command palette component (find via `grep -rn "command palette\|Cmd.*K\|CommandDialog" apps/frontend/components`) — register the Copilot entry from `PaletteCopilotEntry.tsx`.
- `apps/frontend/messages/{en,ru}/copilot.json` — add `palette.askCopilot`, `citation.openInWiki`, etc.

### CI

- `.github/workflows/ci.yml` (or whichever file the project uses for backend CI) — add a job that runs `go run ./apps/backend/internal/copilot/eval/cmd --suite=ci` when `apps/backend/internal/copilot/**` or `apps/frontend/content/wiki/**` change.

---

## Conventions used in this plan

- All Go file paths are relative to `apps/backend/`.
- All TS file paths are relative to `apps/frontend/`.
- Tests follow Phase 1 conventions (`t.Parallel()`, `glebarezsqlite` for non-vector, real Postgres for vector).
- Commits are conventional: `feat(copilot): ...`, `test(copilot): ...`, `chore(copilot): ...`.
- Each task ends with a commit step.

---

## Task 1: pgvector extension and KB chunk model

**Files:**
- Create: `apps/backend/internal/copilot/kb/model.go`
- Modify: `apps/backend/pkg/database/migratable_models.go`
- Create: `apps/backend/pkg/database/copilot_kb_extension.go`

GORM does not auto-create Postgres extensions. We add a `CREATE EXTENSION IF NOT EXISTS vector` step in the migration runner before `RunVersionedMigrations`. This keeps the existing migration pattern intact.

- [ ] **Step 1: Add the extension creator**

Create `apps/backend/pkg/database/copilot_kb_extension.go`:

```go
package database

import (
	"errors"
	"strings"

	"gorm.io/gorm"
)

// EnsureCopilotKBExtensions creates the pgvector extension if it doesn't exist.
// SQLite (used in unit tests) silently no-ops because the dialect string differs.
func EnsureCopilotKBExtensions(db *gorm.DB) error {
	dialect := strings.ToLower(db.Dialector.Name())
	if dialect == "sqlite" || dialect == "sqlite3" {
		return nil
	}
	if dialect != "postgres" {
		return nil // unknown dialect; skip rather than fail
	}
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS vector`).Error; err != nil {
		// On a managed Postgres without superuser the call may fail; log and continue
		// (operators install it manually).
		return errors.New("pgvector extension missing or cannot be created: " + err.Error())
	}
	return nil
}
```

Wire into `cmd/api/main.go` immediately before `RunVersionedMigrations`:

```go
if runAutoMigrate {
    if err := database.EnsureCopilotKBExtensions(database.DB); err != nil {
        slog.Warn("copilot KB extension setup", "err", err) // non-fatal in dev
    }
    err := database.RunVersionedMigrations(database.AllMigratableModels()...)
    // ... existing error handling
}
```

- [ ] **Step 2: Write the model**

Create `apps/backend/internal/copilot/kb/model.go`:

```go
package kb

import (
	"time"

	"github.com/pgvector/pgvector-go"
)

// CopilotKBChunk is a chunked piece of wiki content with its embedding.
//
// The vector column has a parametric dimension; default is 1536 (OpenAI/Voyage compatible).
// When a tenant uses Yandex embeddings (256-dim), the indexer writes a 1536-zero-padded
// vector for now (Phase 2 limitation; per-provider chunk tables land in Phase 3).
type CopilotKBChunk struct {
	ID         string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Path       string          `gorm:"not null;size:512;index:idx_kb_path_locale,priority:1" json:"path"`
	Anchor     string          `gorm:"size:128" json:"anchor,omitempty"`
	Locale     string          `gorm:"not null;size:8;index:idx_kb_path_locale,priority:2" json:"locale"`
	Section    string          `gorm:"size:128" json:"section,omitempty"`
	Text       string          `gorm:"type:text;not null" json:"text"`
	TextHash   string          `gorm:"size:64;not null;index" json:"textHash"`
	Embedding  pgvector.Vector `gorm:"type:vector(1536);not null" json:"-"`
	Tokens     int             `gorm:"not null" json:"tokens"`
	IndexedAt  time.Time       `gorm:"default:now()" json:"indexedAt"`
}

func (CopilotKBChunk) TableName() string { return "copilot_kb_chunks" }
```

- [ ] **Step 3: Register the model**

In `apps/backend/pkg/database/migratable_models.go`, after the Phase 1 Copilot models, add:

```go
&models.CopilotKBChunk{}, // Note: actually defined in internal/copilot/kb/model.go.
                          // Either move the type to internal/models, OR (preferred)
                          // export the type from the kb package and import it here.
```

Decision: **export from `internal/copilot/kb` and import**. Update `migratable_models.go`:

```go
import (
    "quokkaq-go-backend/internal/copilot/kb"
    "quokkaq-go-backend/internal/models"
)

func AllMigratableModels() []any {
    return []any{
        // ... existing entries ...
        &kb.CopilotKBChunk{},
    }
}
```

- [ ] **Step 4: Add the ivfflat index migration**

GORM's auto-migration handles the table but not the ivfflat index — that requires a manual SQL step. Add to `EnsureCopilotKBExtensions` (same file) **after** `RunVersionedMigrations` runs. Refactor:

```go
// EnsureCopilotKBPostMigration runs after AutoMigrate so the table exists.
// Creates the ivfflat index for cosine distance if missing.
func EnsureCopilotKBPostMigration(db *gorm.DB) error {
    dialect := strings.ToLower(db.Dialector.Name())
    if dialect != "postgres" {
        return nil
    }
    return db.Exec(`
        CREATE INDEX IF NOT EXISTS copilot_kb_chunks_embedding_ivfflat
        ON copilot_kb_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `).Error
}
```

Call after migrations in `cmd/api/main.go`:

```go
if runAutoMigrate {
    // ... existing migrations ...
    if err := database.EnsureCopilotKBPostMigration(database.DB); err != nil {
        slog.Warn("copilot KB ivfflat index", "err", err) // non-fatal — only affects perf
    }
}
```

- [ ] **Step 5: Compile-check**

Run: `cd apps/backend && go get github.com/pgvector/pgvector-go && go build ./...`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/pkg/database/copilot_kb_extension.go apps/backend/internal/copilot/kb/model.go apps/backend/pkg/database/migratable_models.go apps/backend/cmd/api/main.go apps/backend/go.mod apps/backend/go.sum
git commit -m "feat(copilot): add pgvector extension setup and KB chunk model"
```

---

## Task 2: KB chunk repository

**Files:**
- Create: `apps/backend/internal/copilot/kb/repository.go`
- Create: `apps/backend/internal/copilot/kb/repository_test.go`

The repository abstracts pgvector queries. The test file uses real Postgres + pgvector via docker-compose; if `RUN_INTEGRATION_TESTS=true` is not set, it skips. (Existing convention — match how integration tests are gated in this codebase.)

- [ ] **Step 1: Write the repository interface and impl**

Create `apps/backend/internal/copilot/kb/repository.go`:

```go
package kb

import (
	"context"
	"errors"

	"github.com/pgvector/pgvector-go"
	"gorm.io/gorm"
)

type KBChunkRepository interface {
	UpsertBatch(ctx context.Context, chunks []CopilotKBChunk) error
	DeleteByPath(ctx context.Context, path string, locale string) error
	DeleteByHashesNotIn(ctx context.Context, path string, locale string, keepHashes []string) error
	SearchByEmbedding(ctx context.Context, embedding []float32, locale string, k int, sectionFilter string) ([]ChunkHit, error)
	CountByPath(ctx context.Context, path, locale string) (int, error)
}

type ChunkHit struct {
	Chunk CopilotKBChunk
	Score float64 // cosine similarity; higher = more similar
}

type kbChunkRepository struct {
	db *gorm.DB
}

func NewKBChunkRepository(db *gorm.DB) KBChunkRepository {
	return &kbChunkRepository{db: db}
}

func (r *kbChunkRepository) UpsertBatch(ctx context.Context, chunks []CopilotKBChunk) error {
	if len(chunks) == 0 {
		return nil
	}
	// gorm doesn't support efficient bulk upsert with vector columns + ON CONFLICT
	// without an explicit unique constraint. Use one transaction with raw upserts on
	// (path, anchor, locale, text_hash).
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i := range chunks {
			c := chunks[i]
			if err := tx.Exec(`
				INSERT INTO copilot_kb_chunks (id, path, anchor, locale, section, text, text_hash, embedding, tokens, indexed_at)
				VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?, ?, NOW())
				ON CONFLICT DO NOTHING
			`, c.Path, c.Anchor, c.Locale, c.Section, c.Text, c.TextHash, c.Embedding, c.Tokens).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *kbChunkRepository) DeleteByPath(ctx context.Context, path, locale string) error {
	return r.db.WithContext(ctx).
		Where("path = ? AND locale = ?", path, locale).
		Delete(&CopilotKBChunk{}).Error
}

func (r *kbChunkRepository) DeleteByHashesNotIn(ctx context.Context, path, locale string, keepHashes []string) error {
	q := r.db.WithContext(ctx).Where("path = ? AND locale = ?", path, locale)
	if len(keepHashes) > 0 {
		q = q.Where("text_hash NOT IN ?", keepHashes)
	}
	return q.Delete(&CopilotKBChunk{}).Error
}

func (r *kbChunkRepository) SearchByEmbedding(ctx context.Context, embedding []float32, locale string, k int, sectionFilter string) ([]ChunkHit, error) {
	if k <= 0 || k > 50 {
		k = 5
	}
	v := pgvector.NewVector(embedding)
	q := r.db.WithContext(ctx).
		Table("copilot_kb_chunks").
		Select("*, 1 - (embedding <=> ?) AS score", v).
		Where("locale = ?", locale).
		Order(gorm.Expr("embedding <=> ?", v)).
		Limit(k)
	if sectionFilter != "" {
		q = q.Where("section = ?", sectionFilter)
	}
	type row struct {
		CopilotKBChunk
		Score float64 `gorm:"column:score"`
	}
	var rows []row
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ChunkHit, len(rows))
	for i, r := range rows {
		out[i] = ChunkHit{Chunk: r.CopilotKBChunk, Score: r.Score}
	}
	return out, nil
}

func (r *kbChunkRepository) CountByPath(ctx context.Context, path, locale string) (int, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&CopilotKBChunk{}).
		Where("path = ? AND locale = ?", path, locale).
		Count(&count).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, nil
		}
		return 0, err
	}
	return int(count), nil
}
```

- [ ] **Step 2: Write the integration test (gated)**

Create `apps/backend/internal/copilot/kb/repository_test.go`:

```go
package kb

import (
	"context"
	"os"
	"testing"

	"github.com/pgvector/pgvector-go"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func mustOpenPgvectorDB(t *testing.T) *gorm.DB {
	t.Helper()
	if os.Getenv("RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("set RUN_INTEGRATION_TESTS=true and bring up docker-compose to run pgvector tests")
	}
	dsn := os.Getenv("POSTGRES_TEST_DSN")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=postgres dbname=quokkaq_test port=5432 sslmode=disable"
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS vector`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&CopilotKBChunk{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`TRUNCATE copilot_kb_chunks`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestKBChunkRepository_UpsertAndSearch(t *testing.T) {
	db := mustOpenPgvectorDB(t)
	repo := NewKBChunkRepository(db)
	ctx := context.Background()

	chunks := []CopilotKBChunk{
		{Path: "en/admin/sso", Locale: "en", Section: "admin", Text: "configure OIDC", TextHash: "h1", Embedding: pgvector.NewVector(testVector(1)), Tokens: 3},
		{Path: "en/admin/sso", Locale: "en", Section: "admin", Text: "configure SAML", TextHash: "h2", Embedding: pgvector.NewVector(testVector(2)), Tokens: 3},
		{Path: "ru/admin/sso", Locale: "ru", Section: "admin", Text: "настройка OIDC", TextHash: "h1ru", Embedding: pgvector.NewVector(testVector(1)), Tokens: 3},
	}
	if err := repo.UpsertBatch(ctx, chunks); err != nil {
		t.Fatal(err)
	}

	hits, err := repo.SearchByEmbedding(ctx, testVector(1), "en", 5, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("expected hits")
	}
	if hits[0].Chunk.Locale != "en" {
		t.Errorf("locale filter broken: %+v", hits[0].Chunk)
	}
}

func TestKBChunkRepository_DeleteByHashesNotIn(t *testing.T) {
	db := mustOpenPgvectorDB(t)
	repo := NewKBChunkRepository(db)
	ctx := context.Background()
	_ = repo.UpsertBatch(ctx, []CopilotKBChunk{
		{Path: "p", Locale: "en", Text: "a", TextHash: "h1", Embedding: pgvector.NewVector(testVector(1)), Tokens: 1},
		{Path: "p", Locale: "en", Text: "b", TextHash: "h2", Embedding: pgvector.NewVector(testVector(2)), Tokens: 1},
	})
	if err := repo.DeleteByHashesNotIn(ctx, "p", "en", []string{"h1"}); err != nil {
		t.Fatal(err)
	}
	count, _ := repo.CountByPath(ctx, "p", "en")
	if count != 1 {
		t.Fatalf("expected 1 remaining, got %d", count)
	}
}

func testVector(seed int) []float32 {
	v := make([]float32, 1536)
	for i := range v {
		v[i] = float32((i+seed)%7) / 7.0
	}
	return v
}
```

- [ ] **Step 3: Run tests**

Without integration env (default):
Run: `cd apps/backend && go test ./internal/copilot/kb/`
Expected: SKIP (test gated by env).

With integration env (manual):
```bash
cd apps/backend
docker-compose up -d postgres
RUN_INTEGRATION_TESTS=true go test ./internal/copilot/kb/ -v
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/kb/repository.go apps/backend/internal/copilot/kb/repository_test.go
git commit -m "feat(copilot): add KB chunk repository with pgvector cosine search"
```

---

## Task 3: MDX chunker

**Files:**
- Create: `apps/backend/internal/copilot/kb/chunker.go`
- Create: `apps/backend/internal/copilot/kb/chunker_test.go`

The chunker reads an MDX file, parses frontmatter (locale, section, tags), strips MDX components and HTML, preserves headings as anchors, and emits ~500-token chunks with 50-token overlap that prefer breaking at heading boundaries.

- [ ] **Step 1: Write failing tests**

Create `apps/backend/internal/copilot/kb/chunker_test.go`:

```go
package kb

import (
	"strings"
	"testing"
)

func TestChunker_FrontmatterParse(t *testing.T) {
	t.Parallel()
	content := `---
locale: en
section: admin
tags: [sso, security]
---

# OIDC Setup

Some intro text.
`
	chunks, meta, err := Chunk("en/admin/sso/oidc.mdx", content)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Locale != "en" || meta.Section != "admin" {
		t.Errorf("meta: %+v", meta)
	}
	if len(chunks) == 0 {
		t.Fatal("expected at least one chunk")
	}
	if !strings.Contains(chunks[0].Text, "OIDC Setup") {
		t.Errorf("text missing heading: %q", chunks[0].Text)
	}
}

func TestChunker_PreservesAnchorFromHeading(t *testing.T) {
	t.Parallel()
	content := `---
locale: en
---

# OIDC Setup

Body.

## Group sync

More body.
`
	chunks, _, _ := Chunk("p.mdx", content)
	if len(chunks) < 2 {
		t.Fatalf("expected >=2 chunks, got %d", len(chunks))
	}
	// Find chunk for "Group sync"
	var groupChunk *Chunk
	for i := range chunks {
		if strings.Contains(chunks[i].Text, "Group sync") {
			groupChunk = &chunks[i]
			break
		}
	}
	if groupChunk == nil || groupChunk.Anchor != "group-sync" {
		t.Fatalf("group-sync chunk anchor wrong: %+v", groupChunk)
	}
}

func TestChunker_StripsMDXComponents(t *testing.T) {
	t.Parallel()
	content := `---
locale: en
---

<Note>This is a callout.</Note>

Plain text.

<CustomBlock prop="x">
  Inner text.
</CustomBlock>
`
	chunks, _, _ := Chunk("p.mdx", content)
	full := strings.Join(chunkTexts(chunks), "\n")
	if strings.Contains(full, "<Note>") || strings.Contains(full, "<CustomBlock") {
		t.Errorf("MDX tags not stripped: %q", full)
	}
	if !strings.Contains(full, "This is a callout") || !strings.Contains(full, "Plain text") {
		t.Errorf("inner text dropped: %q", full)
	}
}

func TestChunker_RespectsTokenBudget(t *testing.T) {
	t.Parallel()
	long := strings.Repeat("word ", 4000) // ~4000 words
	content := "---\nlocale: en\n---\n\n# Big\n\n" + long
	chunks, _, _ := Chunk("p.mdx", content)
	for i, c := range chunks {
		if c.Tokens > 600 {
			t.Errorf("chunk %d exceeds budget: %d tokens", i, c.Tokens)
		}
	}
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}
}

func TestChunker_DeterministicHash(t *testing.T) {
	t.Parallel()
	content := "---\nlocale: en\n---\n\n# H\n\nbody."
	c1, _, _ := Chunk("p", content)
	c2, _, _ := Chunk("p", content)
	if c1[0].TextHash != c2[0].TextHash {
		t.Errorf("hash not deterministic: %q vs %q", c1[0].TextHash, c2[0].TextHash)
	}
}

func chunkTexts(chunks []Chunk) []string {
	out := make([]string, len(chunks))
	for i, c := range chunks {
		out[i] = c.Text
	}
	return out
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd apps/backend && go test ./internal/copilot/kb/ -run TestChunker -v`
Expected: FAIL — `undefined: Chunk`.

- [ ] **Step 3: Implement the chunker**

Create `apps/backend/internal/copilot/kb/chunker.go`:

```go
package kb

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
)

// Chunk is a single chunk produced by the chunker.
type Chunk struct {
	Path     string
	Anchor   string
	Locale   string
	Section  string
	Text     string
	TextHash string
	Tokens   int
}

// Frontmatter is the parsed YAML-ish header.
type Frontmatter struct {
	Locale  string
	Section string
	Tags    []string
}

// chunkTokenTarget is the target chunk size in approximate tokens.
// We approximate tokens as words / 0.75 (English) — close enough for chunking.
const chunkTokenTarget = 500
const chunkTokenOverlap = 50
const chunkTokenMaxHardLimit = 600

var (
	frontmatterRe   = regexp.MustCompile(`(?s)^---\n(.*?)\n---\n`)
	mdxTagOpen      = regexp.MustCompile(`<[A-Z][A-Za-z0-9]*(?:\s+[^>]*)?>`)
	mdxTagClose     = regexp.MustCompile(`</[A-Z][A-Za-z0-9]*>`)
	mdxSelfClose    = regexp.MustCompile(`<[A-Z][A-Za-z0-9]*[^/]*/>`)
	htmlTag         = regexp.MustCompile(`<[a-z][^>]*>|</[a-z][^>]*>`)
	headingRe       = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)
	multiNewlineRe  = regexp.MustCompile(`\n{3,}`)
	whitespaceLineRe = regexp.MustCompile(`(?m)^[ \t]+$`)
)

// Chunk parses MDX content and returns chunks plus frontmatter metadata.
// path is the logical document path used to anchor chunks; locale falls back to "en".
func Chunk(path, content string) ([]Chunk, Frontmatter, error) {
	if content == "" {
		return nil, Frontmatter{}, errors.New("empty content")
	}
	meta, body := parseFrontmatter(content)
	cleaned := stripNonText(body)
	// Split by H1/H2/H3 as primary chunk boundaries; keep heading text inside the chunk.
	sections := splitByHeading(cleaned)

	out := make([]Chunk, 0, len(sections))
	for _, s := range sections {
		anchor := slugify(s.heading)
		// Further split each section if it exceeds budget.
		for _, piece := range packSection(s.text, chunkTokenTarget, chunkTokenOverlap) {
			ch := Chunk{
				Path:    path,
				Anchor:  anchor,
				Locale:  fallback(meta.Locale, "en"),
				Section: meta.Section,
				Text:    strings.TrimSpace(piece),
				Tokens:  approxTokens(piece),
			}
			if ch.Tokens > chunkTokenMaxHardLimit {
				ch.Text = trimToTokens(ch.Text, chunkTokenMaxHardLimit)
				ch.Tokens = approxTokens(ch.Text)
			}
			h := sha256.Sum256([]byte(ch.Path + "|" + ch.Anchor + "|" + ch.Text))
			ch.TextHash = hex.EncodeToString(h[:])
			out = append(out, ch)
		}
	}
	return out, meta, nil
}

func parseFrontmatter(content string) (Frontmatter, string) {
	m := frontmatterRe.FindStringSubmatchIndex(content)
	if m == nil {
		return Frontmatter{}, content
	}
	body := content[m[1]:]
	headerStr := content[m[2]:m[3]]
	fm := Frontmatter{}
	for _, line := range strings.Split(headerStr, "\n") {
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		switch k {
		case "locale":
			fm.Locale = strings.Trim(v, `"`)
		case "section":
			fm.Section = strings.Trim(v, `"`)
		case "tags":
			fm.Tags = parseInlineList(v)
		}
	}
	return fm, body
}

func parseInlineList(v string) []string {
	v = strings.TrimSpace(v)
	if !strings.HasPrefix(v, "[") || !strings.HasSuffix(v, "]") {
		return nil
	}
	inner := strings.TrimSpace(v[1 : len(v)-1])
	if inner == "" {
		return nil
	}
	parts := strings.Split(inner, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, strings.Trim(strings.TrimSpace(p), `"' `))
	}
	return out
}

func stripNonText(s string) string {
	s = mdxSelfClose.ReplaceAllString(s, "")
	s = mdxTagClose.ReplaceAllString(s, "")
	s = mdxTagOpen.ReplaceAllString(s, "")
	s = htmlTag.ReplaceAllString(s, "")
	s = whitespaceLineRe.ReplaceAllString(s, "")
	s = multiNewlineRe.ReplaceAllString(s, "\n\n")
	return s
}

type section struct{ heading, text string }

func splitByHeading(body string) []section {
	matches := headingRe.FindAllStringIndex(body, -1)
	if len(matches) == 0 {
		return []section{{heading: "", text: body}}
	}
	out := make([]section, 0, len(matches)+1)
	if matches[0][0] > 0 {
		out = append(out, section{heading: "", text: body[:matches[0][0]]})
	}
	for i, m := range matches {
		end := len(body)
		if i+1 < len(matches) {
			end = matches[i+1][0]
		}
		hSegment := body[m[0]:end]
		hParts := headingRe.FindStringSubmatch(hSegment)
		title := ""
		if len(hParts) >= 3 {
			title = strings.TrimSpace(hParts[2])
		}
		out = append(out, section{heading: title, text: hSegment})
	}
	return out
}

// packSection splits a single section into chunks of ~targetTokens, with overlap.
func packSection(text string, targetTokens, overlap int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	// Approximate: tokens ≈ words / 0.75, so words ≈ tokens * 0.75.
	wordsPerChunk := int(float64(targetTokens) * 0.75)
	overlapWords := int(float64(overlap) * 0.75)
	if wordsPerChunk <= 0 {
		wordsPerChunk = 200
	}
	if overlapWords < 0 {
		overlapWords = 0
	}
	step := wordsPerChunk - overlapWords
	if step <= 0 {
		step = wordsPerChunk
	}
	out := make([]string, 0)
	for start := 0; start < len(words); start += step {
		end := start + wordsPerChunk
		if end > len(words) {
			end = len(words)
		}
		out = append(out, strings.Join(words[start:end], " "))
		if end == len(words) {
			break
		}
	}
	return out
}

func approxTokens(s string) int {
	w := len(strings.Fields(s))
	return int(float64(w) / 0.75)
}

func trimToTokens(s string, maxTokens int) string {
	words := strings.Fields(s)
	keep := int(float64(maxTokens) * 0.75)
	if keep <= 0 || keep >= len(words) {
		return s
	}
	return strings.Join(words[:keep], " ")
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			out = append(out, r)
		} else if r == ' ' || r == '-' || r == '_' {
			out = append(out, '-')
		}
	}
	collapsed := strings.Trim(strings.ReplaceAll(string(out), "--", "-"), "-")
	return collapsed
}

func fallback(s, dflt string) string {
	if s == "" {
		return dflt
	}
	return s
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd apps/backend && go test ./internal/copilot/kb/ -run TestChunker -v`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/kb/chunker.go apps/backend/internal/copilot/kb/chunker_test.go
git commit -m "feat(copilot): add MDX chunker with frontmatter parsing and heading anchors"
```

---

## Task 4: Embedder interface and adapters

**Files:**
- Create: `apps/backend/internal/copilot/gateway/embedder.go`
- Create: `apps/backend/internal/copilot/gateway/embedder_anthropic.go`
- Create: `apps/backend/internal/copilot/gateway/embedder_yandex.go`
- Create: `apps/backend/internal/copilot/gateway/embedder_test.go`

Anthropic doesn't ship native embeddings. We default the Anthropic-paired tenant's embedder to **Voyage AI** (Anthropic-recommended) via the same HTTP-mock pattern as the chat adapter. Yandex has its own embeddings API.

- [ ] **Step 1: Define the Embedder interface**

Create `apps/backend/internal/copilot/gateway/embedder.go`:

```go
package gateway

import (
	"context"
	"errors"
)

// Embedder produces vector embeddings for text.
// Phase 2 supports two implementations: Voyage (paired with Anthropic) and Yandex.
type Embedder interface {
	Name() string
	Dimension() int
	Embed(ctx context.Context, texts []string) ([][]float32, error)
}

// EmbedderConfig is the union of provider-specific knobs read from env at startup.
type EmbedderConfig struct {
	VoyageAPIKey  string
	VoyageBaseURL string // default https://api.voyageai.com
	VoyageModel   string // default voyage-3

	YandexFolderID  string
	YandexAPIKey    string // optional API key auth
	YandexIAMSource IAMTokenSource // for IAM-token auth path
	YandexBaseURL   string // default https://llm.api.cloud.yandex.net
	YandexModelURI  string // e.g. emb://b1g123/text-search-doc/latest
}

// NewEmbedder picks an implementation by string name.
// Names: "voyage", "yandex". Empty defaults to "voyage".
func NewEmbedder(name string, cfg EmbedderConfig) (Embedder, error) {
	switch name {
	case "voyage", "":
		return newVoyageEmbedder(cfg), nil
	case "yandex":
		return newYandexEmbedder(cfg), nil
	default:
		return nil, errors.New("unknown embedder: " + name)
	}
}
```

- [ ] **Step 2: Voyage adapter (the "Anthropic default")**

Create `apps/backend/internal/copilot/gateway/embedder_anthropic.go`:

```go
package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const voyageDefaultBaseURL = "https://api.voyageai.com"
const voyageDefaultModel = "voyage-3"
const voyageDimension = 1536

type voyageEmbedder struct {
	cfg    EmbedderConfig
	client *http.Client
}

func newVoyageEmbedder(cfg EmbedderConfig) Embedder {
	if cfg.VoyageBaseURL == "" {
		cfg.VoyageBaseURL = voyageDefaultBaseURL
	}
	if cfg.VoyageModel == "" {
		cfg.VoyageModel = voyageDefaultModel
	}
	return &voyageEmbedder{cfg: cfg, client: &http.Client{Timeout: 60 * time.Second}}
}

func (v *voyageEmbedder) Name() string { return "voyage" }
func (v *voyageEmbedder) Dimension() int { return voyageDimension }

type voyageReq struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
}
type voyageResp struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (v *voyageEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	body, _ := json.Marshal(voyageReq{Input: texts, Model: v.cfg.VoyageModel})
	httpReq, err := http.NewRequestWithContext(ctx, "POST", v.cfg.VoyageBaseURL+"/v1/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+v.cfg.VoyageAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := v.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("voyage %d: %s", resp.StatusCode, string(b))
	}
	var out voyageResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if out.Error != nil {
		return nil, errors.New("voyage: " + out.Error.Message)
	}
	vecs := make([][]float32, len(out.Data))
	for i, d := range out.Data {
		vecs[i] = d.Embedding
	}
	return vecs, nil
}
```

- [ ] **Step 3: Yandex Embeddings adapter**

Create `apps/backend/internal/copilot/gateway/embedder_yandex.go`:

```go
package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const yandexEmbeddingDefaultBaseURL = "https://llm.api.cloud.yandex.net"

// IAMTokenSource lets the embedder fetch a fresh IAM token.
// Defined here (not in iam.go) to avoid circular deps in tests.
type IAMTokenSource interface {
	IAMToken(ctx context.Context) (string, error)
}

type yandexEmbedder struct {
	cfg    EmbedderConfig
	client *http.Client
}

func newYandexEmbedder(cfg EmbedderConfig) Embedder {
	if cfg.YandexBaseURL == "" {
		cfg.YandexBaseURL = yandexEmbeddingDefaultBaseURL
	}
	return &yandexEmbedder{cfg: cfg, client: &http.Client{Timeout: 60 * time.Second}}
}

func (y *yandexEmbedder) Name() string { return "yandex" }

// Yandex Embeddings produces 256-dim vectors. Phase 2 zero-pads to 1536 in the
// indexer (Phase 3 introduces per-provider chunk tables). For the Embedder
// interface, return what the provider actually emits — the indexer pads.
func (y *yandexEmbedder) Dimension() int { return 256 }

type yandexEmbReq struct {
	ModelURI string `json:"modelUri"`
	Text     string `json:"text"`
}
type yandexEmbResp struct {
	Embedding []float32 `json:"embedding"`
}

func (y *yandexEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	out := make([][]float32, 0, len(texts))
	for _, t := range texts {
		body, _ := json.Marshal(yandexEmbReq{ModelURI: y.cfg.YandexModelURI, Text: t})
		httpReq, err := http.NewRequestWithContext(ctx, "POST", y.cfg.YandexBaseURL+"/foundationModels/v1/textEmbedding", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		// Auth: prefer IAM token; fall back to API key (header `Authorization: Api-Key <key>`).
		if y.cfg.YandexIAMSource != nil {
			tok, err := y.cfg.YandexIAMSource.IAMToken(ctx)
			if err != nil {
				return nil, err
			}
			httpReq.Header.Set("Authorization", "Bearer "+tok)
		} else if y.cfg.YandexAPIKey != "" {
			httpReq.Header.Set("Authorization", "Api-Key "+y.cfg.YandexAPIKey)
		} else {
			return nil, errors.New("yandex embedder: no auth (set IAM source or API key)")
		}
		if y.cfg.YandexFolderID != "" {
			httpReq.Header.Set("x-folder-id", y.cfg.YandexFolderID)
		}
		httpReq.Header.Set("Content-Type", "application/json")
		resp, err := y.client.Do(httpReq)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode >= 400 {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("yandex embed %d: %s", resp.StatusCode, string(b))
		}
		var parsed yandexEmbResp
		if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
			resp.Body.Close()
			return nil, err
		}
		resp.Body.Close()
		out = append(out, parsed.Embedding)
	}
	return out, nil
}
```

- [ ] **Step 4: Adapter contract test (mock HTTP)**

Create `apps/backend/internal/copilot/gateway/embedder_test.go`:

```go
package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVoyageEmbedder_RoundTrip(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("auth: %q", r.Header.Get("Authorization"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{"embedding": []float32{0.1, 0.2}},
				{"embedding": []float32{0.3, 0.4}},
			},
		})
	}))
	defer srv.Close()

	emb, err := NewEmbedder("voyage", EmbedderConfig{VoyageAPIKey: "test-key", VoyageBaseURL: srv.URL, VoyageModel: "voyage-3"})
	if err != nil {
		t.Fatal(err)
	}
	out, err := emb.Embed(context.Background(), []string{"a", "b"})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0][0] != 0.1 {
		t.Fatalf("unexpected: %+v", out)
	}
}

func TestYandexEmbedder_RoundTripWithAPIKey(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Api-Key k1" {
			t.Errorf("auth: %q", r.Header.Get("Authorization"))
		}
		var body yandexEmbReq
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.ModelURI != "emb://folder/text/latest" {
			t.Errorf("modelUri: %q", body.ModelURI)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"embedding": []float32{0.5, 0.6}})
	}))
	defer srv.Close()

	emb, _ := NewEmbedder("yandex", EmbedderConfig{
		YandexBaseURL:  srv.URL,
		YandexFolderID: "folder",
		YandexAPIKey:   "k1",
		YandexModelURI: "emb://folder/text/latest",
	})
	out, err := emb.Embed(context.Background(), []string{"hello"})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || out[0][0] != 0.5 {
		t.Fatalf("unexpected: %+v", out)
	}
}

func TestNewEmbedder_DefaultsToVoyage(t *testing.T) {
	t.Parallel()
	emb, err := NewEmbedder("", EmbedderConfig{VoyageAPIKey: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if emb.Name() != "voyage" {
		t.Errorf("name: %q", emb.Name())
	}
}

func TestNewEmbedder_UnknownName(t *testing.T) {
	t.Parallel()
	if _, err := NewEmbedder("nope", EmbedderConfig{}); err == nil {
		t.Fatal("expected error on unknown embedder")
	}
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/gateway/ -run TestVoyage -v && go test ./internal/copilot/gateway/ -run TestYandexEmbedder -v && go test ./internal/copilot/gateway/ -run TestNewEmbedder -v`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/internal/copilot/gateway/embedder*.go
git commit -m "feat(copilot): add embedder interface with Voyage and Yandex adapters"
```

---

## Task 5: Wiki indexer (orchestration)

**Files:**
- Create: `apps/backend/internal/copilot/kb/indexer.go`
- Create: `apps/backend/internal/copilot/kb/indexer_test.go`

The indexer composes filesystem walking + chunker + embedder + repository. Tests use an in-memory embedder stub and SQLite (skipping pgvector queries — those are repo-tested separately).

- [ ] **Step 1: Failing tests**

Create `apps/backend/internal/copilot/kb/indexer_test.go`:

```go
package kb

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pgvector/pgvector-go"
)

type fakeEmbedder struct {
	dim int
}

func (f *fakeEmbedder) Name() string  { return "fake" }
func (f *fakeEmbedder) Dimension() int { return f.dim }
func (f *fakeEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i, t := range texts {
		v := make([]float32, f.dim)
		for j := 0; j < f.dim; j++ {
			v[j] = float32((len(t)+i+j)%7) / 7.0
		}
		out[i] = v
	}
	return out, nil
}

type capturingRepo struct {
	upserted []CopilotKBChunk
	deletedKeptHashes map[string][]string // key = path|locale
}

func (c *capturingRepo) UpsertBatch(_ context.Context, chunks []CopilotKBChunk) error {
	c.upserted = append(c.upserted, chunks...)
	return nil
}
func (c *capturingRepo) DeleteByPath(_ context.Context, _, _ string) error { return nil }
func (c *capturingRepo) DeleteByHashesNotIn(_ context.Context, path, locale string, keep []string) error {
	if c.deletedKeptHashes == nil {
		c.deletedKeptHashes = map[string][]string{}
	}
	c.deletedKeptHashes[path+"|"+locale] = keep
	return nil
}
func (c *capturingRepo) SearchByEmbedding(_ context.Context, _ []float32, _ string, _ int, _ string) ([]ChunkHit, error) {
	return nil, nil
}
func (c *capturingRepo) CountByPath(_ context.Context, _, _ string) (int, error) { return 0, nil }

func writeWiki(t *testing.T, dir string) {
	t.Helper()
	files := map[string]string{
		"en/admin/sso.mdx":  "---\nlocale: en\nsection: admin\n---\n\n# OIDC\n\nSet up OIDC.\n",
		"en/staff/use.mdx":  "---\nlocale: en\nsection: staff\n---\n\n# Daily\n\nServe tickets.\n",
		"ru/admin/sso.mdx":  "---\nlocale: ru\nsection: admin\n---\n\n# OIDC\n\nНастройка OIDC.\n",
		"ignore.txt":        "not mdx, ignored",
	}
	for rel, content := range files {
		full := filepath.Join(dir, rel)
		_ = os.MkdirAll(filepath.Dir(full), 0o755)
		_ = os.WriteFile(full, []byte(content), 0o644)
	}
}

func TestIndexer_IndexAll_WalksMDXOnly(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writeWiki(t, dir)
	repo := &capturingRepo{}
	idx := NewIndexer(repo, &fakeEmbedder{dim: 1536}, IndexerConfig{Root: dir})
	stats, err := idx.IndexAll(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if stats.FilesProcessed != 3 {
		t.Errorf("expected 3 files, got %d", stats.FilesProcessed)
	}
	if len(repo.upserted) == 0 {
		t.Fatal("no chunks upserted")
	}
	for _, c := range repo.upserted {
		if c.Locale == "" || c.Path == "" {
			t.Errorf("incomplete chunk: %+v", c)
		}
	}
}

func TestIndexer_PadsYandexShortVectorsTo1536(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writeWiki(t, dir)
	repo := &capturingRepo{}
	idx := NewIndexer(repo, &fakeEmbedder{dim: 256}, IndexerConfig{Root: dir})
	if _, err := idx.IndexAll(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, c := range repo.upserted {
		raw := c.Embedding.Slice()
		if len(raw) != 1536 {
			t.Fatalf("vector not padded to 1536: got %d", len(raw))
		}
	}
}

func TestIndexer_IndexFile_SkipsNonMDX(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writeWiki(t, dir)
	repo := &capturingRepo{}
	idx := NewIndexer(repo, &fakeEmbedder{dim: 1536}, IndexerConfig{Root: dir})
	stats, err := idx.IndexFile(context.Background(), "ignore.txt")
	if err != nil {
		t.Fatal(err)
	}
	if stats.FilesProcessed != 0 {
		t.Errorf("expected 0 processed, got %d", stats.FilesProcessed)
	}
}

func TestIndexer_DeletesStaleChunks(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writeWiki(t, dir)
	repo := &capturingRepo{}
	idx := NewIndexer(repo, &fakeEmbedder{dim: 1536}, IndexerConfig{Root: dir})
	if _, err := idx.IndexAll(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(repo.deletedKeptHashes) == 0 {
		t.Fatal("expected DeleteByHashesNotIn calls")
	}
	for key, hashes := range repo.deletedKeptHashes {
		if !strings.Contains(key, "|") {
			t.Errorf("bad key: %q", key)
		}
		if len(hashes) == 0 {
			t.Errorf("kept hashes empty for %q", key)
		}
	}
}
```

- [ ] **Step 2: Verify failing**

Run: `cd apps/backend && go test ./internal/copilot/kb/ -run TestIndexer -v`
Expected: FAIL — `undefined: NewIndexer`.

- [ ] **Step 3: Implement the indexer**

Create `apps/backend/internal/copilot/kb/indexer.go`:

```go
package kb

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"quokkaq-go-backend/internal/copilot/gateway"

	"github.com/pgvector/pgvector-go"
)

type IndexerConfig struct {
	Root          string // filesystem root for wiki MDX, e.g. apps/frontend/content/wiki
	BatchSize     int    // chunks per Embed call; default 32
	TargetDim     int    // pad / truncate to this dim; default 1536
}

type IndexStats struct {
	FilesProcessed int
	ChunksWritten  int
	ChunksSkipped  int
}

type Indexer struct {
	repo     KBChunkRepository
	embedder gateway.Embedder
	cfg      IndexerConfig
}

func NewIndexer(repo KBChunkRepository, emb gateway.Embedder, cfg IndexerConfig) *Indexer {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 32
	}
	if cfg.TargetDim <= 0 {
		cfg.TargetDim = 1536
	}
	return &Indexer{repo: repo, embedder: emb, cfg: cfg}
}

func (i *Indexer) IndexAll(ctx context.Context) (IndexStats, error) {
	stats := IndexStats{}
	if i.cfg.Root == "" {
		return stats, errors.New("indexer: empty root")
	}
	err := filepath.WalkDir(i.cfg.Root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".mdx") && !strings.HasSuffix(path, ".md") {
			return nil
		}
		rel, err := filepath.Rel(i.cfg.Root, path)
		if err != nil {
			return err
		}
		s, err := i.indexAbs(ctx, path, rel)
		if err != nil {
			slog.Warn("copilot kb: indexing failed", "path", rel, "err", err)
			return nil
		}
		stats.FilesProcessed += s.FilesProcessed
		stats.ChunksWritten += s.ChunksWritten
		stats.ChunksSkipped += s.ChunksSkipped
		return nil
	})
	if err != nil {
		return stats, err
	}
	return stats, nil
}

func (i *Indexer) IndexFile(ctx context.Context, relPath string) (IndexStats, error) {
	if !strings.HasSuffix(relPath, ".mdx") && !strings.HasSuffix(relPath, ".md") {
		return IndexStats{}, nil
	}
	abs := filepath.Join(i.cfg.Root, relPath)
	return i.indexAbs(ctx, abs, relPath)
}

func (i *Indexer) indexAbs(ctx context.Context, abs, relPath string) (IndexStats, error) {
	body, err := os.ReadFile(abs)
	if err != nil {
		return IndexStats{}, err
	}
	logicalPath := strings.TrimSuffix(strings.ReplaceAll(relPath, string(filepath.Separator), "/"), filepath.Ext(relPath))
	chunks, _, err := Chunk(logicalPath, string(body))
	if err != nil {
		return IndexStats{}, err
	}
	if len(chunks) == 0 {
		return IndexStats{FilesProcessed: 1}, nil
	}

	// Compute embeddings in batches.
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.Text
	}
	vecs, err := i.embedTexts(ctx, texts)
	if err != nil {
		return IndexStats{}, err
	}

	// Convert to model rows + hashes for delete-stale.
	out := make([]CopilotKBChunk, len(chunks))
	keepHashes := make([]string, len(chunks))
	for ci, c := range chunks {
		out[ci] = CopilotKBChunk{
			Path:      c.Path,
			Anchor:    c.Anchor,
			Locale:    c.Locale,
			Section:   c.Section,
			Text:      c.Text,
			TextHash:  c.TextHash,
			Embedding: pgvector.NewVector(padOrTruncate(vecs[ci], i.cfg.TargetDim)),
			Tokens:    c.Tokens,
		}
		keepHashes[ci] = c.TextHash
	}
	if err := i.repo.UpsertBatch(ctx, out); err != nil {
		return IndexStats{}, err
	}
	// Delete stale chunks for this (path, locale).
	if len(out) > 0 {
		if err := i.repo.DeleteByHashesNotIn(ctx, out[0].Path, out[0].Locale, keepHashes); err != nil {
			return IndexStats{}, err
		}
	}
	return IndexStats{FilesProcessed: 1, ChunksWritten: len(out)}, nil
}

func (i *Indexer) embedTexts(ctx context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, 0, len(texts))
	for start := 0; start < len(texts); start += i.cfg.BatchSize {
		end := start + i.cfg.BatchSize
		if end > len(texts) {
			end = len(texts)
		}
		v, err := i.embedder.Embed(ctx, texts[start:end])
		if err != nil {
			return nil, err
		}
		out = append(out, v...)
	}
	return out, nil
}

func padOrTruncate(v []float32, target int) []float32 {
	if len(v) == target {
		return v
	}
	if len(v) > target {
		return v[:target]
	}
	out := make([]float32, target)
	copy(out, v)
	return out
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/kb/ -run TestIndexer -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/copilot/kb/indexer.go apps/backend/internal/copilot/kb/indexer_test.go
git commit -m "feat(copilot): add wiki indexer with chunk-and-embed orchestration"
```

---

## Task 6: KB retriever

**Files:**
- Create: `apps/backend/internal/copilot/kb/retriever.go`
- Create: `apps/backend/internal/copilot/kb/retriever_test.go`

The retriever wraps the repo: embed query, search, return scored chunks with snippets.

- [ ] **Step 1: Write failing tests**

Create `apps/backend/internal/copilot/kb/retriever_test.go`:

```go
package kb

import (
	"context"
	"testing"

	"github.com/pgvector/pgvector-go"
)

type stubRepoForRetrieve struct {
	gotEmbedding []float32
	gotLocale    string
	gotK         int
	resp         []ChunkHit
}

func (s *stubRepoForRetrieve) UpsertBatch(_ context.Context, _ []CopilotKBChunk) error { return nil }
func (s *stubRepoForRetrieve) DeleteByPath(_ context.Context, _, _ string) error      { return nil }
func (s *stubRepoForRetrieve) DeleteByHashesNotIn(_ context.Context, _, _ string, _ []string) error {
	return nil
}
func (s *stubRepoForRetrieve) CountByPath(_ context.Context, _, _ string) (int, error) { return 0, nil }
func (s *stubRepoForRetrieve) SearchByEmbedding(_ context.Context, e []float32, locale string, k int, _ string) ([]ChunkHit, error) {
	s.gotEmbedding = e
	s.gotLocale = locale
	s.gotK = k
	return s.resp, nil
}

func TestRetriever_HappyPath(t *testing.T) {
	t.Parallel()
	repo := &stubRepoForRetrieve{
		resp: []ChunkHit{
			{Chunk: CopilotKBChunk{Path: "en/admin/sso", Anchor: "oidc", Locale: "en", Text: "configure OIDC at " + repeatStr("x", 500)}, Score: 0.92},
			{Chunk: CopilotKBChunk{Path: "en/admin/sso", Anchor: "saml", Locale: "en", Text: "configure SAML"}, Score: 0.81},
		},
	}
	r := NewRetriever(repo, &fakeEmbedder{dim: 1536})
	out, err := r.Retrieve(context.Background(), "how do I configure OIDC?", "en", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 {
		t.Fatalf("len=%d", len(out))
	}
	if len(out[0].Snippet) > 250 {
		t.Errorf("snippet should be capped: len=%d", len(out[0].Snippet))
	}
	if repo.gotLocale != "en" || repo.gotK != 5 {
		t.Errorf("repo args: locale=%q k=%d", repo.gotLocale, repo.gotK)
	}
}

func TestRetriever_DefaultK(t *testing.T) {
	t.Parallel()
	repo := &stubRepoForRetrieve{}
	r := NewRetriever(repo, &fakeEmbedder{dim: 1536})
	_, _ = r.Retrieve(context.Background(), "q", "en", 0)
	if repo.gotK != 5 {
		t.Errorf("default k mismatch: %d", repo.gotK)
	}
}

func TestRetriever_PadsEmbedding(t *testing.T) {
	t.Parallel()
	repo := &stubRepoForRetrieve{}
	r := NewRetriever(repo, &fakeEmbedder{dim: 256})
	_, _ = r.Retrieve(context.Background(), "q", "en", 3)
	if len(repo.gotEmbedding) != 1536 {
		t.Fatalf("embedding not padded: %d", len(repo.gotEmbedding))
	}
}

func repeatStr(s string, n int) string {
	out := make([]byte, n)
	for i := range out {
		out[i] = s[i%len(s)]
	}
	return string(out)
}

// silence unused-import warning when only some tests reference pgvector
var _ = pgvector.NewVector
```

- [ ] **Step 2: Implement retriever**

Create `apps/backend/internal/copilot/kb/retriever.go`:

```go
package kb

import (
	"context"

	"quokkaq-go-backend/internal/copilot/gateway"
)

type Retrieved struct {
	Path    string  `json:"path"`
	Anchor  string  `json:"anchor,omitempty"`
	Locale  string  `json:"locale"`
	Section string  `json:"section,omitempty"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
}

type Retriever struct {
	repo     KBChunkRepository
	embedder gateway.Embedder
}

func NewRetriever(repo KBChunkRepository, emb gateway.Embedder) *Retriever {
	return &Retriever{repo: repo, embedder: emb}
}

func (r *Retriever) Retrieve(ctx context.Context, query, locale string, k int) ([]Retrieved, error) {
	if k <= 0 {
		k = 5
	}
	vecs, err := r.embedder.Embed(ctx, []string{query})
	if err != nil {
		return nil, err
	}
	v := padOrTruncate(vecs[0], 1536)
	hits, err := r.repo.SearchByEmbedding(ctx, v, locale, k, "")
	if err != nil {
		return nil, err
	}
	out := make([]Retrieved, len(hits))
	for i, h := range hits {
		out[i] = Retrieved{
			Path:    h.Chunk.Path,
			Anchor:  h.Chunk.Anchor,
			Locale:  h.Chunk.Locale,
			Section: h.Chunk.Section,
			Snippet: snippet(h.Chunk.Text, 200),
			Score:   h.Score,
		}
	}
	return out, nil
}

func snippet(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/kb/ -run TestRetriever -v`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/kb/retriever.go apps/backend/internal/copilot/kb/retriever_test.go
git commit -m "feat(copilot): add KB retriever with snippet generation"
```

---

## Task 7: `search_wiki` tool

**Files:**
- Create: `apps/backend/internal/copilot/tools/tool_search_wiki.go`
- Create: `apps/backend/internal/copilot/tools/tool_search_wiki_test.go`

- [ ] **Step 1: Failing test**

Create `apps/backend/internal/copilot/tools/tool_search_wiki_test.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"testing"
)

type fakeWikiRetriever struct {
	gotQuery, gotLocale string
	gotK                int
	resp                []WikiHit
}

func (f *fakeWikiRetriever) Retrieve(_ context.Context, query, locale string, k int) ([]WikiHit, error) {
	f.gotQuery = query
	f.gotLocale = locale
	f.gotK = k
	return f.resp, nil
}

func TestSearchWikiTool_HappyPath(t *testing.T) {
	t.Parallel()
	r := &fakeWikiRetriever{resp: []WikiHit{
		{Path: "en/admin/sso", Anchor: "oidc", Title: "OIDC Setup", Snippet: "config", Score: 0.9},
	}}
	tool := NewSearchWikiTool(r)
	args := json.RawMessage(`{"query":"how do I configure OIDC?","k":3,"locale":"en"}`)
	out, err := tool.Handler(ToolCtx{CompanyID: "c1", Locale: "en", Roles: []string{"copilot:use"}}, args)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Hits []WikiHit `json:"hits"`
	}
	_ = json.Unmarshal(out.Content, &parsed)
	if len(parsed.Hits) != 1 || parsed.Hits[0].Anchor != "oidc" {
		t.Fatalf("hits: %+v", parsed.Hits)
	}
	if r.gotK != 3 || r.gotLocale != "en" {
		t.Errorf("retriever args: %+v", r)
	}
	if len(out.Citations) != 1 {
		t.Fatalf("citations: %+v", out.Citations)
	}
}

func TestSearchWikiTool_DefaultsLocaleFromCtx(t *testing.T) {
	t.Parallel()
	r := &fakeWikiRetriever{}
	tool := NewSearchWikiTool(r)
	_, err := tool.Handler(ToolCtx{Locale: "ru", Roles: []string{"copilot:use"}}, json.RawMessage(`{"query":"q"}`))
	if err != nil {
		t.Fatal(err)
	}
	if r.gotLocale != "ru" {
		t.Errorf("expected locale to default from ctx, got %q", r.gotLocale)
	}
}

func TestSearchWikiTool_RejectsEmptyQuery(t *testing.T) {
	t.Parallel()
	tool := NewSearchWikiTool(&fakeWikiRetriever{})
	if _, err := tool.Handler(ToolCtx{Roles: []string{"copilot:use"}}, json.RawMessage(`{"query":""}`)); err == nil {
		t.Fatal("expected error for empty query")
	}
}
```

- [ ] **Step 2: Implement**

Create `apps/backend/internal/copilot/tools/tool_search_wiki.go`:

```go
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

// WikiHit is the LLM-facing per-hit shape returned by the search_wiki tool.
type WikiHit struct {
	Path    string  `json:"path"`
	Anchor  string  `json:"anchor,omitempty"`
	Locale  string  `json:"locale,omitempty"`
	Title   string  `json:"title,omitempty"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
}

// WikiRetriever decouples the tool from the kb package.
type WikiRetriever interface {
	Retrieve(ctx context.Context, query, locale string, k int) ([]WikiHit, error)
}

func NewSearchWikiTool(r WikiRetriever) *Tool {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"query":{"type":"string","minLength":1},
			"k":{"type":"integer","minimum":1,"maximum":20,"default":5},
			"locale":{"type":"string","pattern":"^[a-z]{2}$"}
		},
		"required":["query"],
		"additionalProperties":false
	}`)
	return &Tool{
		Name:           "search_wiki",
		Description:    "Search the in-product wiki by natural-language query and return the top-k matching chunks with citations. Use this for 'how do I…' / 'what is…' style configuration questions.",
		Schema:         schema,
		RequiredScopes: []string{"copilot:use"},
		Handler: func(tctx ToolCtx, args json.RawMessage) (Result, error) {
			var in struct {
				Query  string `json:"query"`
				K      int    `json:"k"`
				Locale string `json:"locale"`
			}
			if err := json.Unmarshal(args, &in); err != nil {
				return Result{}, err
			}
			if strings.TrimSpace(in.Query) == "" {
				return Result{}, errors.New("query required")
			}
			locale := in.Locale
			if locale == "" {
				locale = tctx.Locale
			}
			if locale == "" {
				locale = "en"
			}
			hits, err := r.Retrieve(context.Background(), in.Query, locale, in.K)
			if err != nil {
				return Result{}, err
			}
			content, _ := json.Marshal(struct {
				Hits []WikiHit `json:"hits"`
			}{Hits: hits})
			cits := make([]Citation, 0, len(hits))
			for _, h := range hits {
				ref := h.Path
				if h.Anchor != "" {
					ref += "#" + h.Anchor
				}
				cits = append(cits, Citation{ToolName: "search_wiki", Ref: ref, Title: h.Title})
			}
			return Result{Content: content, Citations: cits}, nil
		},
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/tools/ -run TestSearchWiki -v`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/tools/tool_search_wiki*.go
git commit -m "feat(copilot): add search_wiki tool with citations"
```

---

## Task 8a: Yandex IAM token source

**Files:**
- Create: `apps/backend/internal/copilot/gateway/yandex_iam.go`
- Create: `apps/backend/internal/copilot/gateway/yandex_iam_test.go`

The IAM token endpoint exchanges either an OAuth token or a service-account JWT for a short-lived (12h) IAM token. We support service-account-key auth (most common in production) and cache tokens with a refresh window.

- [ ] **Step 1: Failing tests**

Create `apps/backend/internal/copilot/gateway/yandex_iam_test.go`:

```go
package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestYandexIAM_FetchAndCache(t *testing.T) {
	t.Parallel()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"iamToken":  "tok-abc",
			"expiresAt": time.Now().Add(2 * time.Hour).Format(time.RFC3339),
		})
	}))
	defer srv.Close()

	src := NewYandexIAMSource(YandexIAMConfig{
		IAMEndpointURL: srv.URL + "/iam/v1/tokens",
		// Use the dev path that posts a fixed payload (no real JWT signing).
		TestStubPayload: map[string]any{"yandexPassportOauthToken": "dev"},
	})
	tok, err := src.IAMToken(context.Background())
	if err != nil || tok != "tok-abc" {
		t.Fatalf("got tok=%q err=%v", tok, err)
	}
	// Cached
	tok2, _ := src.IAMToken(context.Background())
	if tok2 != "tok-abc" || calls != 1 {
		t.Fatalf("expected cache hit, calls=%d tok=%q", calls, tok2)
	}
}

func TestYandexIAM_RefreshesNearExpiry(t *testing.T) {
	t.Parallel()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"iamToken":  "tok-rotated",
			"expiresAt": time.Now().Add(30 * time.Second).Format(time.RFC3339),
		})
	}))
	defer srv.Close()

	src := NewYandexIAMSource(YandexIAMConfig{
		IAMEndpointURL: srv.URL,
		TestStubPayload: map[string]any{"yandexPassportOauthToken": "dev"},
		RefreshLeeway:   time.Minute, // refresh anything expiring within 1 min
	})
	_, _ = src.IAMToken(context.Background())
	_, _ = src.IAMToken(context.Background())
	if calls != 2 {
		t.Fatalf("expected refresh, calls=%d", calls)
	}
}
```

- [ ] **Step 2: Implement IAM source**

Create `apps/backend/internal/copilot/gateway/yandex_iam.go`:

```go
package gateway

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const yandexIAMDefaultEndpoint = "https://iam.api.cloud.yandex.net/iam/v1/tokens"

// YandexIAMConfig configures IAM token exchange.
// Production path: provide ServiceAccountID + KeyID + PrivateKey (PEM).
// Test path: pass TestStubPayload to bypass JWT signing (useful when the test server
// doesn't actually verify the assertion).
type YandexIAMConfig struct {
	IAMEndpointURL  string
	ServiceAccountID string
	KeyID            string
	PrivateKey       *rsa.PrivateKey

	RefreshLeeway   time.Duration // default 5 min — refresh if token expires within this window
	TestStubPayload map[string]any // overrides JWT generation; for tests only
	HTTPClient      *http.Client
}

type yandexIAMSource struct {
	cfg    YandexIAMConfig
	client *http.Client
	mu     sync.Mutex
	token  string
	expAt  time.Time
}

// NewYandexIAMSource returns an IAMTokenSource wired for Yandex Cloud's
// "service-account-key → JWT → IAM token" exchange. Tokens are cached and
// auto-refreshed.
func NewYandexIAMSource(cfg YandexIAMConfig) IAMTokenSource {
	if cfg.IAMEndpointURL == "" {
		cfg.IAMEndpointURL = yandexIAMDefaultEndpoint
	}
	if cfg.RefreshLeeway == 0 {
		cfg.RefreshLeeway = 5 * time.Minute
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	return &yandexIAMSource{cfg: cfg, client: hc}
}

func (s *yandexIAMSource) IAMToken(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.token != "" && time.Until(s.expAt) > s.cfg.RefreshLeeway {
		return s.token, nil
	}
	tok, exp, err := s.exchange(ctx)
	if err != nil {
		return "", err
	}
	s.token = tok
	s.expAt = exp
	return tok, nil
}

func (s *yandexIAMSource) exchange(ctx context.Context) (string, time.Time, error) {
	var payload []byte
	var err error
	if s.cfg.TestStubPayload != nil {
		payload, err = json.Marshal(s.cfg.TestStubPayload)
	} else {
		assertion, jerr := s.signJWT()
		if jerr != nil {
			return "", time.Time{}, jerr
		}
		payload, err = json.Marshal(map[string]string{"jwt": assertion})
	}
	if err != nil {
		return "", time.Time{}, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.cfg.IAMEndpointURL, bytes.NewReader(payload))
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return "", time.Time{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return "", time.Time{}, fmt.Errorf("yandex iam %d: %s", resp.StatusCode, string(b))
	}
	var out struct {
		IAMToken  string `json:"iamToken"`
		ExpiresAt string `json:"expiresAt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", time.Time{}, err
	}
	if out.IAMToken == "" {
		return "", time.Time{}, errors.New("yandex iam: empty token")
	}
	exp, _ := time.Parse(time.RFC3339, out.ExpiresAt)
	if exp.IsZero() {
		exp = time.Now().Add(time.Hour)
	}
	return out.IAMToken, exp, nil
}

func (s *yandexIAMSource) signJWT() (string, error) {
	if s.cfg.PrivateKey == nil || s.cfg.ServiceAccountID == "" || s.cfg.KeyID == "" {
		return "", errors.New("yandex iam: missing service-account credentials")
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"iss": s.cfg.ServiceAccountID,
		"aud": "https://iam.api.cloud.yandex.net/iam/v1/tokens",
		"iat": now.Unix(),
		"exp": now.Add(time.Hour).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodPS256, claims)
	tok.Header["kid"] = s.cfg.KeyID
	return tok.SignedString(s.cfg.PrivateKey)
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/gateway/ -run TestYandexIAM -v`
Expected: PASS — 2 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/gateway/yandex_iam*.go
git commit -m "feat(copilot): add Yandex IAM token source with refresh cache"
```

---

## Task 8b: YandexGPT chat adapter

**Files:**
- Create: `apps/backend/internal/copilot/gateway/yandex.go`
- Create: `apps/backend/internal/copilot/gateway/yandex_test.go`

YandexGPT v2 supports function calling and streaming. The wire shape is different from Anthropic — adapt the existing `LLMProvider` interface.

- [ ] **Step 1: Failing tests**

Create `apps/backend/internal/copilot/gateway/yandex_test.go`:

```go
package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestYandex_CreateMessage_TextOnly(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/foundationModels/v1/completion") {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer iam-tok" {
			t.Errorf("auth: %q", r.Header.Get("Authorization"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"alternatives": []map[string]any{
					{"message": map[string]string{"role": "assistant", "text": "Привет!"}, "status": "ALTERNATIVE_STATUS_FINAL"},
				},
				"usage":      map[string]any{"inputTextTokens": "10", "completionTokens": "3", "totalTokens": "13"},
				"modelVersion": "yandexgpt-lite",
			},
		})
	}))
	defer srv.Close()

	stub := stubIAMSource{token: "iam-tok"}
	p := NewYandexGPT(YandexGPTConfig{
		BaseURL:    srv.URL,
		FolderID:   "f1",
		ModelURI:   "gpt://f1/yandexgpt/latest",
		IAMSource:  stub,
	})
	out, err := p.CreateMessage(context.Background(), CreateMessageRequest{
		Model:    "gpt://f1/yandexgpt/latest",
		System:   "you are helpful",
		Messages: []ChatMessage{{Role: "user", Content: json.RawMessage(`"Привет"`)}},
		MaxTokens: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Text != "Привет!" {
		t.Errorf("text: %q", out.Text)
	}
	if out.Usage.InputTokens != 10 || out.Usage.OutputTokens != 3 {
		t.Errorf("usage: %+v", out.Usage)
	}
}

func TestYandex_StreamMessage_EmitsDeltas(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/x-ndjson")
		f := w.(http.Flusher)
		// Each line is a JSON object with the same shape as non-streaming, repeated with deltas.
		lines := []string{
			`{"result":{"alternatives":[{"message":{"role":"assistant","text":"Привет"}, "status":"ALTERNATIVE_STATUS_PARTIAL"}],"usage":{"inputTextTokens":"5","completionTokens":"1","totalTokens":"6"}}}`,
			`{"result":{"alternatives":[{"message":{"role":"assistant","text":"Привет!"}, "status":"ALTERNATIVE_STATUS_FINAL"}],"usage":{"inputTextTokens":"5","completionTokens":"3","totalTokens":"8"}}}`,
		}
		for _, l := range lines {
			_, _ = io.WriteString(w, l+"\n")
			f.Flush()
		}
	}))
	defer srv.Close()

	stub := stubIAMSource{token: "iam-tok"}
	p := NewYandexGPT(YandexGPTConfig{BaseURL: srv.URL, FolderID: "f1", ModelURI: "gpt://f1/yandexgpt/latest", IAMSource: stub})

	var buf strings.Builder
	var stop string
	var usage Usage
	sink := stubSink{
		text:     func(s string) { buf.WriteString(s) },
		complete: func(u Usage, sr string) { usage = u; stop = sr },
	}
	if err := p.StreamMessage(context.Background(), CreateMessageRequest{
		Model: "gpt://f1/yandexgpt/latest",
		Messages: []ChatMessage{{Role: "user", Content: json.RawMessage(`"hi"`)}},
		MaxTokens: 100,
	}, sink); err != nil {
		t.Fatal(err)
	}
	if buf.String() != "Привет!" {
		t.Errorf("buffered text: %q", buf.String())
	}
	if stop != "end_turn" {
		t.Errorf("stop: %q", stop)
	}
	if usage.InputTokens != 5 || usage.OutputTokens != 3 {
		t.Errorf("usage: %+v", usage)
	}
}

type stubIAMSource struct{ token string }

func (s stubIAMSource) IAMToken(_ context.Context) (string, error) { return s.token, nil }
```

- [ ] **Step 2: Implement YandexGPT adapter**

Create `apps/backend/internal/copilot/gateway/yandex.go`:

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
	"strconv"
	"strings"
	"time"
)

const yandexDefaultBaseURL = "https://llm.api.cloud.yandex.net"

type YandexGPTConfig struct {
	BaseURL    string
	FolderID   string
	ModelURI   string // default model URI; CreateMessageRequest.Model overrides
	APIKey     string // optional: alternative to IAM
	IAMSource  IAMTokenSource
	HTTPClient *http.Client
}

type yandexGPTProvider struct {
	cfg    YandexGPTConfig
	client *http.Client
}

func NewYandexGPT(cfg YandexGPTConfig) LLMProvider {
	if cfg.BaseURL == "" {
		cfg.BaseURL = yandexDefaultBaseURL
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 90 * time.Second}
	}
	return &yandexGPTProvider{cfg: cfg, client: hc}
}

func (y *yandexGPTProvider) Name() string { return "yandex" }

func (y *yandexGPTProvider) SupportedFeatures() ProviderFeatures {
	return ProviderFeatures{
		SupportsTools:     true,
		SupportsStreaming: true,
		SupportsEmbedding: false, // separate endpoint via embedder_yandex
		MaxContextTokens:  32_000,
	}
}

type yandexCompletionReq struct {
	ModelURI          string                  `json:"modelUri"`
	CompletionOptions yandexCompletionOptions `json:"completionOptions"`
	Messages          []yandexMessage         `json:"messages"`
	Tools             []yandexTool            `json:"tools,omitempty"`
}
type yandexCompletionOptions struct {
	Stream      bool    `json:"stream"`
	Temperature float32 `json:"temperature,omitempty"`
	MaxTokens   string  `json:"maxTokens"`
}
type yandexMessage struct {
	Role     string                  `json:"role"`
	Text     string                  `json:"text,omitempty"`
	ToolCallList *yandexToolCallList `json:"toolCallList,omitempty"`
	ToolResultList *yandexToolResultList `json:"toolResultList,omitempty"`
}
type yandexToolCallList struct {
	ToolCalls []yandexToolCall `json:"toolCalls"`
}
type yandexToolCall struct {
	FunctionCall yandexFunctionCall `json:"functionCall"`
}
type yandexFunctionCall struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}
type yandexToolResultList struct {
	ToolResults []yandexToolResult `json:"toolResults"`
}
type yandexToolResult struct {
	FunctionResult yandexFunctionResult `json:"functionResult"`
}
type yandexFunctionResult struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}
type yandexTool struct {
	Function yandexFunction `json:"function"`
}
type yandexFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters"`
}

type yandexCompletionResp struct {
	Result struct {
		Alternatives []struct {
			Message yandexMessage `json:"message"`
			Status  string        `json:"status"`
		} `json:"alternatives"`
		Usage struct {
			InputTextTokens  string `json:"inputTextTokens"`
			CompletionTokens string `json:"completionTokens"`
			TotalTokens      string `json:"totalTokens"`
		} `json:"usage"`
	} `json:"result"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

func (y *yandexGPTProvider) buildBody(req CreateMessageRequest, stream bool) yandexCompletionReq {
	model := req.Model
	if model == "" {
		model = y.cfg.ModelURI
	}
	out := yandexCompletionReq{
		ModelURI: model,
		CompletionOptions: yandexCompletionOptions{
			Stream:    stream,
			MaxTokens: strconv.Itoa(req.MaxTokens),
		},
	}
	if req.Temperature != nil {
		out.CompletionOptions.Temperature = *req.Temperature
	}
	if req.System != "" {
		out.Messages = append(out.Messages, yandexMessage{Role: "system", Text: req.System})
	}
	for _, m := range req.Messages {
		// Phase 2: rely on the agent loop preserving simple text messages.
		// Tool-result blocks are translated to ToolResultList.
		var asString string
		_ = json.Unmarshal(m.Content, &asString)
		if asString != "" {
			out.Messages = append(out.Messages, yandexMessage{Role: m.Role, Text: asString})
			continue
		}
		// Try tool_use / tool_result block decoding.
		var blocks []map[string]any
		if err := json.Unmarshal(m.Content, &blocks); err == nil {
			calls := []yandexToolCall{}
			results := []yandexToolResult{}
			textParts := []string{}
			for _, b := range blocks {
				switch b["type"] {
				case "text":
					if t, ok := b["text"].(string); ok {
						textParts = append(textParts, t)
					}
				case "tool_use":
					name, _ := b["name"].(string)
					rawInput, _ := json.Marshal(b["input"])
					calls = append(calls, yandexToolCall{FunctionCall: yandexFunctionCall{Name: name, Arguments: rawInput}})
				case "tool_result":
					content, _ := b["content"].(string)
					id, _ := b["tool_use_id"].(string)
					results = append(results, yandexToolResult{FunctionResult: yandexFunctionResult{Name: id, Content: content}})
				}
			}
			msg := yandexMessage{Role: m.Role}
			if len(textParts) > 0 {
				msg.Text = strings.Join(textParts, "\n")
			}
			if len(calls) > 0 {
				msg.ToolCallList = &yandexToolCallList{ToolCalls: calls}
			}
			if len(results) > 0 {
				msg.ToolResultList = &yandexToolResultList{ToolResults: results}
			}
			out.Messages = append(out.Messages, msg)
		}
	}
	for _, t := range req.Tools {
		out.Tools = append(out.Tools, yandexTool{Function: yandexFunction{Name: t.Name, Description: t.Description, Parameters: t.InputSchema}})
	}
	return out
}

func (y *yandexGPTProvider) authHeader(ctx context.Context, h http.Header) error {
	if y.cfg.IAMSource != nil {
		tok, err := y.cfg.IAMSource.IAMToken(ctx)
		if err != nil {
			return err
		}
		h.Set("Authorization", "Bearer "+tok)
		return nil
	}
	if y.cfg.APIKey != "" {
		h.Set("Authorization", "Api-Key "+y.cfg.APIKey)
		return nil
	}
	return errors.New("yandex: no auth configured")
}

func (y *yandexGPTProvider) CreateMessage(ctx context.Context, req CreateMessageRequest) (*Message, error) {
	body, _ := json.Marshal(y.buildBody(req, false))
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", y.cfg.BaseURL+"/foundationModels/v1/completion", bytes.NewReader(body))
	if err := y.authHeader(ctx, httpReq.Header); err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if y.cfg.FolderID != "" {
		httpReq.Header.Set("x-folder-id", y.cfg.FolderID)
	}
	resp, err := y.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("yandex %d: %s", resp.StatusCode, string(b))
	}
	var out yandexCompletionResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if out.Error != nil {
		return nil, fmt.Errorf("yandex code=%d: %s", out.Error.Code, out.Error.Message)
	}
	if len(out.Result.Alternatives) == 0 {
		return nil, errors.New("yandex: empty alternatives")
	}
	a := out.Result.Alternatives[0]
	msg := &Message{
		StopReason: stopReasonFromYandexStatus(a.Status),
		Text:       a.Message.Text,
		Provider:   "yandex",
		Model:      req.Model,
	}
	if a.Message.ToolCallList != nil {
		for _, c := range a.Message.ToolCallList.ToolCalls {
			msg.ToolCalls = append(msg.ToolCalls, ToolCall{
				ID:    c.FunctionCall.Name + "-call", // Yandex doesn't return a tool_use id; synthesize
				Name:  c.FunctionCall.Name,
				Input: c.FunctionCall.Arguments,
			})
		}
		if msg.StopReason == "end_turn" {
			msg.StopReason = "tool_use"
		}
	}
	in, _ := strconv.Atoi(out.Result.Usage.InputTextTokens)
	o, _ := strconv.Atoi(out.Result.Usage.CompletionTokens)
	msg.Usage = Usage{InputTokens: in, OutputTokens: o}
	return msg, nil
}

func (y *yandexGPTProvider) StreamMessage(ctx context.Context, req CreateMessageRequest, sink StreamSink) error {
	body, _ := json.Marshal(y.buildBody(req, true))
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", y.cfg.BaseURL+"/foundationModels/v1/completion", bytes.NewReader(body))
	if err := y.authHeader(ctx, httpReq.Header); err != nil {
		sink.OnError(err)
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if y.cfg.FolderID != "" {
		httpReq.Header.Set("x-folder-id", y.cfg.FolderID)
	}
	resp, err := y.client.Do(httpReq)
	if err != nil {
		sink.OnError(err)
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		e := fmt.Errorf("yandex %d: %s", resp.StatusCode, string(b))
		sink.OnError(e)
		return e
	}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024*1024), 4*1024*1024)
	var prev, finalText string
	var lastUsage Usage
	var lastStatus string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var chunk yandexCompletionResp
		if err := json.Unmarshal([]byte(line), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil {
			err := fmt.Errorf("yandex stream: %s", chunk.Error.Message)
			sink.OnError(err)
			return err
		}
		if len(chunk.Result.Alternatives) == 0 {
			continue
		}
		a := chunk.Result.Alternatives[0]
		// Yandex streams *cumulative* text, not deltas. Compute the delta.
		if delta := strings.TrimPrefix(a.Message.Text, prev); delta != "" {
			sink.OnTextDelta(delta)
			prev = a.Message.Text
		}
		finalText = a.Message.Text
		lastStatus = a.Status
		// Emit any synthesized tool calls as we see them (final-only typically).
		if a.Message.ToolCallList != nil {
			for _, c := range a.Message.ToolCallList.ToolCalls {
				sink.OnToolCall(ToolCall{ID: c.FunctionCall.Name + "-call", Name: c.FunctionCall.Name, Input: c.FunctionCall.Arguments})
			}
		}
		in, _ := strconv.Atoi(chunk.Result.Usage.InputTextTokens)
		o, _ := strconv.Atoi(chunk.Result.Usage.CompletionTokens)
		lastUsage = Usage{InputTokens: in, OutputTokens: o}
	}
	_ = finalText
	sink.OnComplete(lastUsage, stopReasonFromYandexStatus(lastStatus))
	return scanner.Err()
}

func (y *yandexGPTProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	return nil, errors.New("yandex chat provider does not implement Embed; use Yandex embedder")
}

func stopReasonFromYandexStatus(status string) string {
	switch status {
	case "ALTERNATIVE_STATUS_FINAL":
		return "end_turn"
	case "ALTERNATIVE_STATUS_TOOL_CALLS":
		return "tool_use"
	case "ALTERNATIVE_STATUS_PARTIAL":
		return "partial"
	case "ALTERNATIVE_STATUS_TRUNCATED_FINAL":
		return "max_tokens"
	default:
		return strings.ToLower(strings.TrimPrefix(status, "ALTERNATIVE_STATUS_"))
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/gateway/ -run TestYandex -v`
Expected: PASS — 2 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/gateway/yandex.go apps/backend/internal/copilot/gateway/yandex_test.go
git commit -m "feat(copilot): add YandexGPT chat adapter with streaming"
```

---

## Task 9: Per-tenant provider registry

**Files:**
- Create: `apps/backend/internal/copilot/gateway/registry.go`
- Create: `apps/backend/internal/copilot/gateway/registry_test.go`

The agent loop currently takes a `LLMProvider` directly. We add a registry that resolves per-tenant choice and add an indirection so the loop reads `provider := registry.For(companyID)` per request.

- [ ] **Step 1: Failing test**

Create `apps/backend/internal/copilot/gateway/registry_test.go`:

```go
package gateway

import (
	"context"
	"testing"
)

type fakeChooser struct {
	resp string
	err  error
}

func (f *fakeChooser) ChooseProvider(_ context.Context, _ string) (string, error) {
	return f.resp, f.err
}

type namedProvider struct{ name string }

func (n *namedProvider) Name() string { return n.name }
func (n *namedProvider) CreateMessage(_ context.Context, _ CreateMessageRequest) (*Message, error) {
	return nil, nil
}
func (n *namedProvider) StreamMessage(_ context.Context, _ CreateMessageRequest, _ StreamSink) error {
	return nil
}
func (n *namedProvider) Embed(_ context.Context, _ []string) ([][]float32, error) { return nil, nil }
func (n *namedProvider) SupportedFeatures() ProviderFeatures                       { return ProviderFeatures{} }

func TestProviderRegistry_FallsBackToDefault(t *testing.T) {
	t.Parallel()
	reg := NewProviderRegistry(&fakeChooser{resp: ""}, "anthropic", map[string]LLMProvider{
		"anthropic": &namedProvider{name: "anthropic"},
		"yandex":    &namedProvider{name: "yandex"},
	})
	p, err := reg.For(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if p.Name() != "anthropic" {
		t.Errorf("name: %q", p.Name())
	}
}

func TestProviderRegistry_HonorsTenantChoice(t *testing.T) {
	t.Parallel()
	reg := NewProviderRegistry(&fakeChooser{resp: "yandex"}, "anthropic", map[string]LLMProvider{
		"anthropic": &namedProvider{name: "anthropic"},
		"yandex":    &namedProvider{name: "yandex"},
	})
	p, _ := reg.For(context.Background(), "c1")
	if p.Name() != "yandex" {
		t.Errorf("name: %q", p.Name())
	}
}

func TestProviderRegistry_UnknownTenantChoiceFallsBack(t *testing.T) {
	t.Parallel()
	reg := NewProviderRegistry(&fakeChooser{resp: "openai"}, "anthropic", map[string]LLMProvider{
		"anthropic": &namedProvider{name: "anthropic"},
	})
	p, err := reg.For(context.Background(), "c1")
	if err != nil || p.Name() != "anthropic" {
		t.Fatalf("p=%v err=%v", p, err)
	}
}
```

- [ ] **Step 2: Implement**

Create `apps/backend/internal/copilot/gateway/registry.go`:

```go
package gateway

import (
	"context"
	"errors"
	"log/slog"
)

// TenantProviderChooser tells the registry which provider a tenant prefers.
// Wired in cmd/api as a wrapper over the tenants table (Phase 2 adds copilot_provider column).
type TenantProviderChooser interface {
	ChooseProvider(ctx context.Context, companyID string) (string, error)
}

type ProviderRegistry struct {
	chooser   TenantProviderChooser
	defaultID string
	providers map[string]LLMProvider
}

func NewProviderRegistry(chooser TenantProviderChooser, defaultID string, providers map[string]LLMProvider) *ProviderRegistry {
	if defaultID == "" {
		defaultID = "anthropic"
	}
	return &ProviderRegistry{chooser: chooser, defaultID: defaultID, providers: providers}
}

// For returns the provider for the given company.
// Falls back to the default when:
//   - the chooser returns empty
//   - the chooser returns a name not in the providers map
//   - the chooser returns an error (with a warning logged)
func (r *ProviderRegistry) For(ctx context.Context, companyID string) (LLMProvider, error) {
	choice, err := r.chooser.ChooseProvider(ctx, companyID)
	if err != nil {
		slog.Warn("copilot provider chooser failed; falling back", "company_id", companyID, "err", err)
		choice = ""
	}
	if choice != "" {
		if p, ok := r.providers[choice]; ok {
			return p, nil
		}
	}
	if def, ok := r.providers[r.defaultID]; ok {
		return def, nil
	}
	return nil, errors.New("copilot: no provider available")
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/gateway/ -run TestProviderRegistry -v`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/internal/copilot/gateway/registry.go apps/backend/internal/copilot/gateway/registry_test.go
git commit -m "feat(copilot): add per-tenant provider registry with default fallback"
```

---

## Task 10: Tenant config columns + service

**Files:**
- Modify: `apps/backend/internal/models/company.go`
- Create: `apps/backend/internal/copilot/quota/tenant_config.go`
- Create: `apps/backend/internal/copilot/quota/tenant_config_test.go`

Add `CopilotProvider`, `CopilotModel`, `CopilotEmbeddingProvider`, `CopilotPIILevel`, `CopilotLocalePref` columns to Company; provide a service to read them.

- [ ] **Step 1: Add columns to Company model**

Open `apps/backend/internal/models/company.go` (or wherever the Company struct is — find with `grep -rn "type Company struct" apps/backend/internal/models/`). Add fields (alongside the existing `CopilotEnabled` if it landed in Phase 1, otherwise add it here too):

```go
type Company struct {
    // ... existing fields ...

    // AI Copilot per-tenant config (Phase 2)
    CopilotProvider          *string `gorm:"size:32" json:"copilotProvider,omitempty"`           // "anthropic" | "yandex"
    CopilotModel             *string `gorm:"size:128" json:"copilotModel,omitempty"`             // provider-specific
    CopilotEmbeddingProvider *string `gorm:"size:32" json:"copilotEmbeddingProvider,omitempty"`  // "voyage" | "yandex"
    CopilotPIILevel          *string `gorm:"size:16" json:"copilotPIILevel,omitempty"`           // "strict" | "standard" | "relaxed"
    CopilotLocalePref        *string `gorm:"size:8" json:"copilotLocalePref,omitempty"`
}
```

GORM auto-migrate adds nullable columns on next start.

- [ ] **Step 2: Failing test for tenant config service**

Create `apps/backend/internal/copilot/quota/tenant_config_test.go`:

```go
package quota

import (
	"context"
	"testing"
)

func TestTenantConfig_ReturnsDefaultsWhenNull(t *testing.T) {
	t.Parallel()
	svc := NewTenantConfigService(&fakeTenantRepo{provider: nil})
	cfg, err := svc.Get(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Provider != "anthropic" || cfg.PIILevel != "standard" {
		t.Fatalf("defaults wrong: %+v", cfg)
	}
}

func TestTenantConfig_HonorsOverrides(t *testing.T) {
	t.Parallel()
	prov := "yandex"
	pii := "strict"
	emb := "yandex"
	svc := NewTenantConfigService(&fakeTenantRepo{provider: &prov, piiLevel: &pii, embedder: &emb})
	cfg, _ := svc.Get(context.Background(), "c1")
	if cfg.Provider != "yandex" || cfg.PIILevel != "strict" || cfg.EmbeddingProvider != "yandex" {
		t.Fatalf("override wrong: %+v", cfg)
	}
}

type fakeTenantRepo struct {
	provider, piiLevel, embedder, model, locale *string
}

func (f *fakeTenantRepo) GetCopilotConfig(_ context.Context, _ string) (*RawTenantConfig, error) {
	return &RawTenantConfig{
		Provider:          f.provider,
		Model:             f.model,
		EmbeddingProvider: f.embedder,
		PIILevel:          f.piiLevel,
		LocalePref:        f.locale,
	}, nil
}
```

- [ ] **Step 3: Implement service**

Create `apps/backend/internal/copilot/quota/tenant_config.go`:

```go
package quota

import (
	"context"
)

type RawTenantConfig struct {
	Provider          *string
	Model             *string
	EmbeddingProvider *string
	PIILevel          *string
	LocalePref        *string
}

type TenantConfig struct {
	Provider          string
	Model             string
	EmbeddingProvider string
	PIILevel          string
	LocalePref        string
}

type TenantConfigRepo interface {
	GetCopilotConfig(ctx context.Context, companyID string) (*RawTenantConfig, error)
}

type TenantConfigService struct{ repo TenantConfigRepo }

func NewTenantConfigService(repo TenantConfigRepo) *TenantConfigService {
	return &TenantConfigService{repo: repo}
}

func (s *TenantConfigService) Get(ctx context.Context, companyID string) (TenantConfig, error) {
	raw, err := s.repo.GetCopilotConfig(ctx, companyID)
	if err != nil {
		return TenantConfig{}, err
	}
	cfg := TenantConfig{
		Provider:          deref(raw.Provider, "anthropic"),
		Model:             deref(raw.Model, ""),
		EmbeddingProvider: deref(raw.EmbeddingProvider, "voyage"),
		PIILevel:          deref(raw.PIILevel, "standard"),
		LocalePref:        deref(raw.LocalePref, ""),
	}
	return cfg, nil
}

// ChooseProvider implements gateway.TenantProviderChooser.
func (s *TenantConfigService) ChooseProvider(ctx context.Context, companyID string) (string, error) {
	cfg, err := s.Get(ctx, companyID)
	if err != nil {
		return "", err
	}
	return cfg.Provider, nil
}

func deref(p *string, dflt string) string {
	if p == nil || *p == "" {
		return dflt
	}
	return *p
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && go test ./internal/copilot/quota/ -run TestTenantConfig -v`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/internal/models/company.go apps/backend/internal/copilot/quota/tenant_config.go apps/backend/internal/copilot/quota/tenant_config_test.go
git commit -m "feat(copilot): add tenant copilot config columns and service"
```

---

## Task 11: KB indexing Asynq job + reindex endpoint

**Files:**
- Modify: `apps/backend/internal/jobs/types.go`
- Modify: `apps/backend/internal/jobs/client.go`
- Create: `apps/backend/internal/jobs/copilot_kb_index.go`
- Create: `apps/backend/internal/copilot/handlers/kb_reindex.go`

- [ ] **Step 1: Job type and enqueue method**

In `apps/backend/internal/jobs/types.go`:

```go
const (
    // ... existing types ...
    TypeCopilotKBIndex = "copilot:kb_index"
)
```

In `apps/backend/internal/jobs/client.go`:

```go
type CopilotKBIndexPayload struct {
    Mode     string `json:"mode"`     // "all" | "file"
    FilePath string `json:"filePath,omitempty"`
}

// Add to JobClient interface
EnqueueCopilotKBIndex(payload CopilotKBIndexPayload) error

// On *jobClient:
func (c *jobClient) EnqueueCopilotKBIndex(payload CopilotKBIndexPayload) error {
    raw, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    _, err = c.client.Enqueue(asynq.NewTask(TypeCopilotKBIndex, raw), asynq.Queue("default"))
    return err
}
```

- [ ] **Step 2: Implement the job handler**

Create `apps/backend/internal/jobs/copilot_kb_index.go`:

```go
package jobs

import (
    "context"
    "encoding/json"
    "log/slog"

    "github.com/hibiken/asynq"
)

// CopilotKBIndexer is the subset of kb.Indexer the job calls.
type CopilotKBIndexer interface {
    IndexAll(ctx context.Context) (any, error) // any = avoid importing kb here
    IndexFile(ctx context.Context, relPath string) (any, error)
}

func HandleCopilotKBIndex(idx CopilotKBIndexer) func(context.Context, *asynq.Task) error {
    return func(ctx context.Context, task *asynq.Task) error {
        var payload CopilotKBIndexPayload
        _ = json.Unmarshal(task.Payload(), &payload)
        switch payload.Mode {
        case "file":
            stats, err := idx.IndexFile(ctx, payload.FilePath)
            if err != nil {
                slog.Error("copilot kb index file failed", "path", payload.FilePath, "err", err)
                return err
            }
            slog.Info("copilot kb indexed file", "path", payload.FilePath, "stats", stats)
        default:
            stats, err := idx.IndexAll(ctx)
            if err != nil {
                slog.Error("copilot kb index all failed", "err", err)
                return err
            }
            slog.Info("copilot kb indexed all", "stats", stats)
        }
        return nil
    }
}
```

> Note: the `any` return type here decouples `jobs` from `kb`. In `cmd/api` the adapter wraps `*kb.Indexer.IndexAll` and converts the return.

- [ ] **Step 3: Reindex HTTP endpoint**

Create `apps/backend/internal/copilot/handlers/kb_reindex.go`:

```go
package handlers

import (
    "encoding/json"
    "net/http"

    "quokkaq-go-backend/internal/jobs"
)

type KBReindexHandler struct {
    enqueuer KBReindexEnqueuer
}

type KBReindexEnqueuer interface {
    EnqueueCopilotKBIndex(payload jobs.CopilotKBIndexPayload) error
}

func NewKBReindexHandler(e KBReindexEnqueuer) *KBReindexHandler {
    return &KBReindexHandler{enqueuer: e}
}

type kbReindexBody struct {
    Mode     string `json:"mode"`
    FilePath string `json:"filePath,omitempty"`
}

// HandleReindex POST /api/copilot/kb/reindex
//
// @Summary  Trigger Copilot KB re-indexing (admin only)
// @Tags     copilot
// @Accept   json
// @Produce  json
// @Param    body body kbReindexBody true "Mode + optional file path"
// @Success  202  {object} map[string]string
// @Router   /api/copilot/kb/reindex [post]
// @Security BearerAuth
func (h *KBReindexHandler) HandleReindex(w http.ResponseWriter, r *http.Request) {
    ident, ok := identityFromRequest(r)
    if !ok {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }
    if !hasRole(ident.Roles, "copilot:admin") {
        http.Error(w, "forbidden", http.StatusForbidden)
        return
    }
    var body kbReindexBody
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.Mode == "" {
        body.Mode = "all"
    }
    if body.Mode != "all" && body.Mode != "file" {
        http.Error(w, "invalid mode", http.StatusBadRequest)
        return
    }
    if body.Mode == "file" && body.FilePath == "" {
        http.Error(w, "filePath required when mode=file", http.StatusBadRequest)
        return
    }
    if err := h.enqueuer.EnqueueCopilotKBIndex(jobs.CopilotKBIndexPayload{Mode: body.Mode, FilePath: body.FilePath}); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusAccepted)
    _ = json.NewEncoder(w).Encode(map[string]string{"status": "queued"})
}

func hasRole(roles []string, want string) bool {
    for _, r := range roles {
        if r == want {
            return true
        }
    }
    return false
}
```

- [ ] **Step 4: Compile + commit**

Run: `cd apps/backend && go build ./...`
Expected: success.

```bash
git add apps/backend/internal/jobs/types.go apps/backend/internal/jobs/client.go apps/backend/internal/jobs/copilot_kb_index.go apps/backend/internal/copilot/handlers/kb_reindex.go
git commit -m "feat(copilot): add KB index Asynq job and reindex endpoint"
```

---

## Task 12: Tenant config admin endpoint

**Files:**
- Create: `apps/backend/internal/copilot/handlers/tenant_config.go`

- [ ] **Step 1: Implement the endpoints**

Create `apps/backend/internal/copilot/handlers/tenant_config.go`:

```go
package handlers

import (
    "encoding/json"
    "net/http"

    "quokkaq-go-backend/internal/copilot/quota"
)

type TenantConfigHandler struct {
    svc *quota.TenantConfigService
    setter TenantConfigSetter
}

type TenantConfigSetter interface {
    SetCopilotConfig(ctx interface{}, companyID string, patch quota.RawTenantConfig) error
}

func NewTenantConfigHandler(svc *quota.TenantConfigService, setter TenantConfigSetter) *TenantConfigHandler {
    return &TenantConfigHandler{svc: svc, setter: setter}
}

// HandleGet GET /api/copilot/tenant-config (admin)
//
// @Summary  Get the calling tenant's Copilot config
// @Tags     copilot
// @Produce  json
// @Success  200 {object} quota.TenantConfig
// @Router   /api/copilot/tenant-config [get]
// @Security BearerAuth
func (h *TenantConfigHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
    ident, ok := identityFromRequest(r)
    if !ok {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }
    if !hasRole(ident.Roles, "copilot:admin") {
        http.Error(w, "forbidden", http.StatusForbidden)
        return
    }
    cfg, err := h.svc.Get(r.Context(), ident.CompanyID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(cfg)
}

// HandlePatch PATCH /api/copilot/tenant-config (admin)
//
// @Summary  Update the calling tenant's Copilot config
// @Tags     copilot
// @Accept   json
// @Produce  json
// @Param    body body quota.RawTenantConfig true "Patch fields (any subset)"
// @Success  204
// @Router   /api/copilot/tenant-config [patch]
// @Security BearerAuth
func (h *TenantConfigHandler) HandlePatch(w http.ResponseWriter, r *http.Request) {
    ident, ok := identityFromRequest(r)
    if !ok {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }
    if !hasRole(ident.Roles, "copilot:admin") {
        http.Error(w, "forbidden", http.StatusForbidden)
        return
    }
    var patch quota.RawTenantConfig
    if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
        http.Error(w, "invalid body", http.StatusBadRequest)
        return
    }
    if err := h.setter.SetCopilotConfig(r.Context(), ident.CompanyID, patch); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 2: Compile + commit**

Run: `cd apps/backend && go build ./internal/copilot/handlers/`
Expected: success.

```bash
git add apps/backend/internal/copilot/handlers/tenant_config.go
git commit -m "feat(copilot): add tenant config admin GET/PATCH handler"
```

---

## Task 13: Eval harness — rubric and stub provider

**Files:**
- Create: `apps/backend/internal/copilot/eval/rubric.go`
- Create: `apps/backend/internal/copilot/eval/rubric_test.go`
- Create: `apps/backend/internal/copilot/eval/stub_provider.go`

The harness has three pieces (split across Tasks 13–14): rubric matchers, deterministic LLM stub, and the runner. Tests gate prompt and tool changes in CI.

- [ ] **Step 1: Failing rubric tests**

Create `apps/backend/internal/copilot/eval/rubric_test.go`:

```go
package eval

import "testing"

func TestRubric_MustMentionPasses(t *testing.T) {
	t.Parallel()
	r := Rubric{MustMention: []string{"avg wait", "throughput"}, Locale: "en"}
	res := r.Evaluate("The avg wait was 3 min and throughput was 22/h.", "en")
	if !res.Pass {
		t.Errorf("expected pass: %+v", res)
	}
}

func TestRubric_MissingMention(t *testing.T) {
	t.Parallel()
	r := Rubric{MustMention: []string{"avg wait", "throughput"}, Locale: "en"}
	res := r.Evaluate("Throughput was 22/h.", "en")
	if res.Pass {
		t.Error("expected fail")
	}
	if len(res.MissingMentions) != 1 || res.MissingMentions[0] != "avg wait" {
		t.Errorf("missing: %+v", res.MissingMentions)
	}
}

func TestRubric_MustNotAssertCatchesForbidden(t *testing.T) {
	t.Parallel()
	r := Rubric{MustNotAssert: []string{"100% accurate", "guaranteed"}, Locale: "en"}
	res := r.Evaluate("This is 100% accurate.", "en")
	if res.Pass {
		t.Error("expected fail")
	}
	if len(res.ForbiddenAsserted) != 1 {
		t.Errorf("forbidden: %+v", res.ForbiddenAsserted)
	}
}

func TestRubric_LocaleMismatch(t *testing.T) {
	t.Parallel()
	r := Rubric{Locale: "ru"}
	// English-only response when ru expected.
	res := r.Evaluate("This is the answer.", "ru")
	if res.Pass {
		t.Error("expected fail on locale mismatch")
	}
	if !res.LocaleMismatch {
		t.Error("LocaleMismatch flag not set")
	}
}

func TestRubric_LocaleRussianDetected(t *testing.T) {
	t.Parallel()
	r := Rubric{Locale: "ru"}
	res := r.Evaluate("Среднее ожидание 3 мин.", "ru")
	if !res.Pass {
		t.Errorf("ru text rejected: %+v", res)
	}
}
```

- [ ] **Step 2: Implement rubric**

Create `apps/backend/internal/copilot/eval/rubric.go`:

```go
package eval

import (
	"strings"
	"unicode"
)

type Rubric struct {
	MustMention   []string `yaml:"must_mention"`
	MustNotAssert []string `yaml:"must_not_assert"`
	Locale        string   `yaml:"locale"`
}

type RubricResult struct {
	Pass               bool
	MissingMentions    []string
	ForbiddenAsserted  []string
	LocaleMismatch     bool
}

func (r Rubric) Evaluate(answer, expectedLocale string) RubricResult {
	res := RubricResult{Pass: true}
	low := strings.ToLower(answer)
	for _, m := range r.MustMention {
		if !strings.Contains(low, strings.ToLower(m)) {
			res.MissingMentions = append(res.MissingMentions, m)
			res.Pass = false
		}
	}
	for _, f := range r.MustNotAssert {
		if strings.Contains(low, strings.ToLower(f)) {
			res.ForbiddenAsserted = append(res.ForbiddenAsserted, f)
			res.Pass = false
		}
	}
	if expectedLocale != "" {
		if !localeMatches(answer, expectedLocale) {
			res.LocaleMismatch = true
			res.Pass = false
		}
	}
	return res
}

// localeMatches uses a heuristic: if expectedLocale is "ru" the answer must contain
// at least one Cyrillic letter; if "en" it must contain ASCII letters and no
// majority-Cyrillic content.
func localeMatches(answer, expected string) bool {
	hasCyrillic := false
	hasLatin := false
	cyrillicCount, latinCount := 0, 0
	for _, r := range answer {
		switch {
		case unicode.Is(unicode.Cyrillic, r):
			hasCyrillic = true
			cyrillicCount++
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z'):
			hasLatin = true
			latinCount++
		}
	}
	switch expected {
	case "ru":
		return hasCyrillic && cyrillicCount >= latinCount
	case "en":
		return hasLatin && latinCount >= cyrillicCount
	default:
		return true
	}
}
```

- [ ] **Step 3: Run rubric tests**

Run: `cd apps/backend && go test ./internal/copilot/eval/ -run TestRubric -v`
Expected: PASS — 5 tests.

- [ ] **Step 4: Stub provider**

Create `apps/backend/internal/copilot/eval/stub_provider.go`:

```go
package eval

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"

	"quokkaq-go-backend/internal/copilot/gateway"
)

// FixtureScript is a deterministic per-question script that the EvalProvider replays.
// Each entry is a single LLM "turn".
type FixtureScript struct {
	Turns []FixtureTurn
}

type FixtureTurn struct {
	Text       string
	ToolCalls  []FixtureToolCall
	StopReason string // end_turn | tool_use
	Usage      gateway.Usage
}

type FixtureToolCall struct {
	ID    string
	Name  string
	Input string // raw JSON
}

// EvalProvider replays a single FixtureScript per question. Used by the eval runner.
type EvalProvider struct {
	mu      sync.Mutex
	script  FixtureScript
	idx     int
}

func NewEvalProvider(script FixtureScript) *EvalProvider {
	return &EvalProvider{script: script}
}

func (p *EvalProvider) Name() string { return "eval-stub" }

func (p *EvalProvider) SupportedFeatures() gateway.ProviderFeatures {
	return gateway.ProviderFeatures{SupportsTools: true, SupportsStreaming: true}
}

func (p *EvalProvider) CreateMessage(ctx context.Context, req gateway.CreateMessageRequest) (*gateway.Message, error) {
	return nil, errors.New("eval-stub: use StreamMessage")
}

func (p *EvalProvider) StreamMessage(ctx context.Context, req gateway.CreateMessageRequest, sink gateway.StreamSink) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.idx >= len(p.script.Turns) {
		sink.OnError(errors.New("eval-stub: no more turns"))
		return errors.New("script exhausted")
	}
	t := p.script.Turns[p.idx]
	p.idx++
	if t.Text != "" {
		// emit as one chunk for simplicity
		sink.OnTextDelta(t.Text)
	}
	for _, c := range t.ToolCalls {
		sink.OnToolCall(gateway.ToolCall{ID: c.ID, Name: c.Name, Input: json.RawMessage(c.Input)})
	}
	stop := t.StopReason
	if stop == "" {
		if len(t.ToolCalls) > 0 {
			stop = "tool_use"
		} else {
			stop = "end_turn"
		}
	}
	sink.OnComplete(t.Usage, stop)
	return nil
}

func (p *EvalProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i, t := range texts {
		v := make([]float32, 1536)
		for j := 0; j < 1536; j++ {
			v[j] = float32((len(t)+i+j)%7) / 7.0
		}
		out[i] = v
	}
	return out, nil
}

// AssertNoMoreTurns can be called by tests after a question runs to confirm the script was exhausted.
func (p *EvalProvider) AssertNoMoreTurns() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.idx == len(p.script.Turns)
}

// helper for golden YAML decoding (used by Task 14)
func parseFixtureTextSafely(s string) string {
	return strings.TrimSpace(s)
}
```

- [ ] **Step 5: Compile + commit**

Run: `cd apps/backend && go build ./internal/copilot/eval/`
Expected: success.

```bash
git add apps/backend/internal/copilot/eval/rubric.go apps/backend/internal/copilot/eval/rubric_test.go apps/backend/internal/copilot/eval/stub_provider.go
git commit -m "feat(copilot): add eval rubric matchers and deterministic LLM stub"
```

---

## Task 14: Eval harness — runner, golden set, CLI

**Files:**
- Create: `apps/backend/internal/copilot/eval/runner.go`
- Create: `apps/backend/internal/copilot/eval/runner_test.go`
- Create: `apps/backend/internal/copilot/eval/cmd/main.go`
- Create: `apps/backend/internal/copilot/eval/golden/001-unit-summary-en.yaml`
- Create: `apps/backend/internal/copilot/eval/golden/002-unit-summary-ru.yaml`
- Create: `apps/backend/internal/copilot/eval/golden/003-service-breakdown-en.yaml`
- Create: `apps/backend/internal/copilot/eval/golden/README.md`

The runner loads YAML cases, drives the agent loop with the stub provider, asserts tool-selection + rubric, returns a `Report`.

- [ ] **Step 1: Add yaml dep**

Run: `cd apps/backend && go get gopkg.in/yaml.v3`
Expected: success.

- [ ] **Step 2: Failing runner test**

Create `apps/backend/internal/copilot/eval/runner_test.go`:

```go
package eval

import (
	"context"
	"testing"
)

func TestRunner_HappyPath(t *testing.T) {
	t.Parallel()
	suite := []GoldenCase{
		{
			ID:           "fake-1",
			Question:     "What's the avg wait?",
			Locale:       "en",
			ExpectedTools: []string{"get_unit_summary"},
			Rubric: Rubric{
				MustMention: []string{"avg wait"},
				Locale:      "en",
			},
			Script: FixtureScript{Turns: []FixtureTurn{
				{
					ToolCalls: []FixtureToolCall{{ID: "t1", Name: "get_unit_summary", Input: `{"unit_id":"u1","period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}}`}},
					StopReason: "tool_use",
				},
				{
					Text:       "Avg wait was 3 minutes.",
					StopReason: "end_turn",
				},
			}},
		},
	}
	report, err := RunSuite(context.Background(), suite, NewMinimalRegistryForTests())
	if err != nil {
		t.Fatal(err)
	}
	if report.Failed != 0 {
		t.Errorf("expected 0 failed, got %d (%+v)", report.Failed, report.Cases)
	}
}

func TestRunner_DetectsMissingTool(t *testing.T) {
	t.Parallel()
	suite := []GoldenCase{
		{
			ID: "missing-tool",
			ExpectedTools: []string{"get_unit_summary"},
			Locale:        "en",
			Script:        FixtureScript{Turns: []FixtureTurn{{Text: "I don't know", StopReason: "end_turn"}}},
		},
	}
	report, _ := RunSuite(context.Background(), suite, NewMinimalRegistryForTests())
	if report.Failed != 1 {
		t.Fatalf("expected 1 failed, got %d (%+v)", report.Failed, report.Cases)
	}
}
```

- [ ] **Step 3: Implement runner**

Create `apps/backend/internal/copilot/eval/runner.go`:

```go
package eval

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"quokkaq-go-backend/internal/copilot/agent"
	"quokkaq-go-backend/internal/copilot/gateway"
	"quokkaq-go-backend/internal/copilot/tools"

	"gopkg.in/yaml.v3"
)

type GoldenCase struct {
	ID            string         `yaml:"id"`
	Question      string         `yaml:"question"`
	Locale        string         `yaml:"locale"`
	ExpectedTools []string       `yaml:"expected_tools"`
	Rubric        Rubric         `yaml:"rubric"`
	Script        FixtureScript  `yaml:"script"`
}

type CaseReport struct {
	ID         string
	Pass       bool
	Reasons    []string
	ToolsCalled []string
	Answer     string
}

type Report struct {
	Total  int
	Passed int
	Failed int
	Cases  []CaseReport
}

func LoadSuiteDir(dir string) ([]GoldenCase, error) {
	cases := []GoldenCase{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		var c GoldenCase
		if err := yaml.Unmarshal(body, &c); err != nil {
			return nil, fmt.Errorf("%s: %w", e.Name(), err)
		}
		cases = append(cases, c)
	}
	return cases, nil
}

// captureSinkAggregate captures text + tool calls.
type captureSinkAggregate struct {
	text   strings.Builder
	tools  []string
}

func (c *captureSinkAggregate) Emit(e agent.Event) error {
	if e.Type == agent.EvTextDelta {
		var d struct{ Delta string `json:"delta"` }
		_ = json.Unmarshal(e.Data, &d)
		c.text.WriteString(d.Delta)
	}
	if e.Type == agent.EvToolCallStarted {
		var d struct{ Name string `json:"name"` }
		_ = json.Unmarshal(e.Data, &d)
		c.tools = append(c.tools, d.Name)
	}
	return nil
}

func RunSuite(ctx context.Context, suite []GoldenCase, registry *tools.Registry) (Report, error) {
	rep := Report{Total: len(suite)}
	for _, c := range suite {
		stub := NewEvalProvider(c.Script)
		loop := agent.NewLoop(stub, registry, agent.DefaultPolicy())
		sink := &captureSinkAggregate{}
		_, _ = loop.Run(ctx, agent.RunInput{
			System: "you are an eval harness",
			UserMessage: gateway.ChatMessage{
				Role:    "user",
				Content: json.RawMessage(`"` + c.Question + `"`),
			},
			ToolCtx:          tools.ToolCtx{CompanyID: "eval", UserID: "eval", Roles: []string{"copilot:use", "stats:read", "unit:read"}, Locale: c.Locale},
			MaxTokensPerTurn: 1024,
		}, sink)

		caseRep := CaseReport{ID: c.ID, ToolsCalled: sink.tools, Answer: sink.text.String(), Pass: true}
		// Tool assertion
		if len(c.ExpectedTools) > 0 {
			missing := setSubtract(c.ExpectedTools, sink.tools)
			if len(missing) > 0 {
				caseRep.Pass = false
				caseRep.Reasons = append(caseRep.Reasons, "missing tools: "+strings.Join(missing, ","))
			}
		}
		// Rubric
		rubricRes := c.Rubric.Evaluate(sink.text.String(), c.Locale)
		if !rubricRes.Pass {
			caseRep.Pass = false
			if len(rubricRes.MissingMentions) > 0 {
				caseRep.Reasons = append(caseRep.Reasons, "missing mentions: "+strings.Join(rubricRes.MissingMentions, ","))
			}
			if len(rubricRes.ForbiddenAsserted) > 0 {
				caseRep.Reasons = append(caseRep.Reasons, "forbidden asserted: "+strings.Join(rubricRes.ForbiddenAsserted, ","))
			}
			if rubricRes.LocaleMismatch {
				caseRep.Reasons = append(caseRep.Reasons, "locale mismatch")
			}
		}
		if caseRep.Pass {
			rep.Passed++
		} else {
			rep.Failed++
		}
		rep.Cases = append(rep.Cases, caseRep)
	}
	return rep, nil
}

func setSubtract(want, got []string) []string {
	have := map[string]struct{}{}
	for _, g := range got {
		have[g] = struct{}{}
	}
	var missing []string
	for _, w := range want {
		if _, ok := have[w]; !ok {
			missing = append(missing, w)
		}
	}
	return missing
}

// NewMinimalRegistryForTests registers Phase 1 tools with no-op handlers
// so the agent loop can dispatch without a real DB.
func NewMinimalRegistryForTests() *tools.Registry {
	reg := tools.NewRegistry()
	noop := func(_ tools.ToolCtx, args json.RawMessage) (tools.Result, error) {
		return tools.Result{Content: args}, nil
	}
	reg.Register(&tools.Tool{Name: "list_units", Schema: json.RawMessage(`{}`), Handler: noop, RequiredScopes: []string{"unit:read"}})
	reg.Register(&tools.Tool{Name: "get_unit_summary", Schema: json.RawMessage(`{}`), Handler: noop, RequiredScopes: []string{"stats:read"}})
	reg.Register(&tools.Tool{Name: "get_service_breakdown", Schema: json.RawMessage(`{}`), Handler: noop, RequiredScopes: []string{"stats:read"}})
	reg.Register(&tools.Tool{Name: "get_hourly_load", Schema: json.RawMessage(`{}`), Handler: noop, RequiredScopes: []string{"stats:read"}})
	reg.Register(&tools.Tool{Name: "search_wiki", Schema: json.RawMessage(`{}`), Handler: noop, RequiredScopes: []string{"copilot:use"}})
	return reg
}
```

- [ ] **Step 4: CLI binary**

Create `apps/backend/internal/copilot/eval/cmd/main.go`:

```go
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"quokkaq-go-backend/internal/copilot/eval"
)

func main() {
	dir := flag.String("dir", "internal/copilot/eval/golden", "golden cases directory")
	flag.Parse()

	cases, err := eval.LoadSuiteDir(*dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "load suite:", err)
		os.Exit(2)
	}
	rep, err := eval.RunSuite(context.Background(), cases, eval.NewMinimalRegistryForTests())
	if err != nil {
		fmt.Fprintln(os.Stderr, "run:", err)
		os.Exit(2)
	}
	fmt.Printf("Total: %d   Passed: %d   Failed: %d\n", rep.Total, rep.Passed, rep.Failed)
	for _, c := range rep.Cases {
		status := "PASS"
		if !c.Pass {
			status = "FAIL"
		}
		fmt.Printf("[%s] %s  tools=%v\n", status, c.ID, c.ToolsCalled)
		for _, r := range c.Reasons {
			fmt.Printf("    - %s\n", r)
		}
	}
	if rep.Failed > 0 {
		os.Exit(1)
	}
}
```

- [ ] **Step 5: Three starter golden cases**

Create `apps/backend/internal/copilot/eval/golden/001-unit-summary-en.yaml`:

```yaml
id: unit-summary-en
question: "How was unit u1 last week?"
locale: en
expected_tools: [get_unit_summary]
rubric:
  must_mention: ["avg wait", "throughput"]
  must_not_assert: ["100% accurate", "guaranteed"]
  locale: en
script:
  turns:
    - tool_calls:
        - id: t1
          name: get_unit_summary
          input: '{"unit_id":"u1","period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}}'
      stop_reason: tool_use
      usage: {inputTokens: 30, outputTokens: 12}
    - text: "Last week the avg wait was 3 minutes and throughput was 22/h."
      stop_reason: end_turn
      usage: {inputTokens: 35, outputTokens: 14}
```

Create `apps/backend/internal/copilot/eval/golden/002-unit-summary-ru.yaml`:

```yaml
id: unit-summary-ru
question: "Как прошла прошлая неделя в филиале u1?"
locale: ru
expected_tools: [get_unit_summary]
rubric:
  must_mention: ["среднее ожидание"]
  locale: ru
script:
  turns:
    - tool_calls:
        - id: t1
          name: get_unit_summary
          input: '{"unit_id":"u1","period":{"from":"2026-04-18T00:00:00Z","to":"2026-04-25T00:00:00Z"}}'
      stop_reason: tool_use
    - text: "На прошлой неделе среднее ожидание составило 3 минуты."
      stop_reason: end_turn
```

Create `apps/backend/internal/copilot/eval/golden/003-service-breakdown-en.yaml`:

```yaml
id: service-breakdown-en
question: "Top services by abandonment last month for u1"
locale: en
expected_tools: [get_service_breakdown]
rubric:
  must_mention: ["abandonment"]
  locale: en
script:
  turns:
    - tool_calls:
        - id: t1
          name: get_service_breakdown
          input: '{"unit_id":"u1","period":{"from":"2026-03-25T00:00:00Z","to":"2026-04-25T00:00:00Z"},"group_by":"service"}'
      stop_reason: tool_use
    - text: "Top abandonment-rate services: Loans (12%), Mortgages (9%)."
      stop_reason: end_turn
```

Create `apps/backend/internal/copilot/eval/golden/README.md`:

```markdown
# Eval golden cases

Each YAML file under this directory is a single deterministic eval case.

## Schema

- `id` — unique identifier (file basename also serves as ordering key)
- `question` — the user prompt that exercises the agent
- `locale` — `en` | `ru`; locale heuristic asserts the answer is in this language
- `expected_tools` — set of tool names that MUST appear among emitted `tool_call_started` events (order-independent, extra tools tolerated)
- `rubric` — `must_mention`, `must_not_assert`, `locale` matchers
- `script` — fixture turns the eval-stub LLM provider replays:
  - `turns[].text` — text the model would emit during this turn
  - `turns[].tool_calls` — tool calls the model would emit (with synthetic IDs)
  - `turns[].stop_reason` — `end_turn` | `tool_use` (auto-derived if empty)
  - `turns[].usage` — input/output tokens for this turn

## Running

```bash
cd apps/backend
go run ./internal/copilot/eval/cmd            # default dir
go run ./internal/copilot/eval/cmd -dir=path  # override
```

CI runs this on every PR that touches `apps/backend/internal/copilot/**` or `apps/frontend/content/wiki/**`.

## Adding new cases

1. Copy an existing file. Use the next free numeric prefix (e.g. `030-...`).
2. Run `go run ./internal/copilot/eval/cmd` locally and confirm PASS.
3. Commit. CI guards regressions.
```

- [ ] **Step 6: Run runner test**

Run: `cd apps/backend && go test ./internal/copilot/eval/ -run TestRunner -v`
Expected: PASS — 2 tests.

- [ ] **Step 7: Run the CLI**

Run: `cd apps/backend && go run ./internal/copilot/eval/cmd -dir=internal/copilot/eval/golden`
Expected: `Total: 3   Passed: 3   Failed: 0` and exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/internal/copilot/eval/
git commit -m "feat(copilot): add eval harness with runner, golden cases, and CLI"
```

---

## Task 15: Eval harness CI integration

**Files:**
- Modify: `.github/workflows/ci.yml` (or whichever CI workflow file the project uses)

- [ ] **Step 1: Locate CI workflow**

Run: `grep -l "go test\|nx test" .github/workflows/*.yml | head -3`
Expected: at least one file path.

- [ ] **Step 2: Add eval job**

Append a new job (or step within an existing backend job) that runs only on changes to relevant paths:

```yaml
copilot-eval:
  runs-on: ubuntu-latest
  if: |
    contains(github.event.pull_request.changed_files, 'apps/backend/internal/copilot/') ||
    contains(github.event.pull_request.changed_files, 'apps/frontend/content/wiki/')
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: '1.26'
    - name: Run Copilot eval
      run: |
        cd apps/backend
        go run ./internal/copilot/eval/cmd
```

> If the project uses a different CI shape (e.g. Nx-based job), adapt accordingly. The mechanic is "fail PR if eval regresses".

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(copilot): run eval harness on copilot/wiki changes"
```

---

## Task 16: Frontend — citation pills

**Files:**
- Create: `apps/frontend/lib/copilot/citations.ts`
- Create: `apps/frontend/lib/copilot/citations.test.ts`
- Create: `apps/frontend/components/copilot/CitationPill.tsx`
- Modify: `apps/frontend/components/copilot/MessageBubble.tsx`
- Modify: `apps/frontend/components/copilot/CopilotDrawer.tsx`

- [ ] **Step 1: Citation URL builder**

Create `apps/frontend/lib/copilot/citations.ts`:

```ts
export interface CitationRef {
  toolName: string;
  ref: string;
  title?: string;
}

export function buildCitationHref(c: CitationRef, locale: string): string {
  if (c.toolName === 'search_wiki') {
    // ref is "<path>" or "<path>#<anchor>"
    const [path, anchor] = c.ref.split('#');
    const localePrefixed = path.startsWith(`${locale}/`) ? path : `${locale}/${path}`;
    return `/${localePrefixed}${anchor ? `#${anchor}` : ''}`.replace(/\/+/g, '/').replace(/^\/help/, '/help');
  }
  // Future: entity citations
  return '#';
}
```

- [ ] **Step 2: Tests**

Create `apps/frontend/lib/copilot/citations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCitationHref } from './citations';

describe('buildCitationHref', () => {
  it('produces /help/<path>#<anchor>', () => {
    const href = buildCitationHref({ toolName: 'search_wiki', ref: 'help/admin/sso#oidc' }, 'en');
    expect(href).toContain('/admin/sso');
    expect(href).toContain('#oidc');
  });

  it('prefixes locale when missing', () => {
    const href = buildCitationHref({ toolName: 'search_wiki', ref: 'admin/sso' }, 'ru');
    expect(href.startsWith('/ru/')).toBe(true);
  });

  it('returns # for unknown tool', () => {
    const href = buildCitationHref({ toolName: 'unknown', ref: 'x' }, 'en');
    expect(href).toBe('#');
  });
});
```

- [ ] **Step 3: `CitationPill` component**

Create `apps/frontend/components/copilot/CitationPill.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { buildCitationHref, type CitationRef } from '@/lib/copilot/citations';

interface Props {
  citation: CitationRef;
  locale: string;
  index: number;
}

export function CitationPill({ citation, locale, index }: Props) {
  const t = useTranslations('copilot.citation');
  const href = buildCitationHref(citation, locale);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={citation.title ?? t('openInWiki')}
      className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-medium text-primary hover:bg-primary/25"
    >
      {index + 1}
    </a>
  );
}
```

- [ ] **Step 4: Plumb citations into messages**

Update `apps/frontend/components/copilot/MessageBubble.tsx` — extend `CopilotMessage`:

```tsx
import type { CitationRef } from '@/lib/copilot/citations';

export interface CopilotMessage {
  // ... existing fields ...
  citations?: CitationRef[];
}
```

Render a small footer below the markdown when citations exist:

```tsx
{message.citations && message.citations.length > 0 && (
  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] opacity-80">
    <span>Sources:</span>
    {message.citations.map((c, i) => <CitationPill key={i} citation={c} locale={locale} index={i} />)}
  </div>
)}
```

(Add a `locale` prop on `MessageBubble` and pass it from `MessageList` → `CopilotDrawer`.)

- [ ] **Step 5: Aggregate citations from SSE stream**

In `apps/frontend/components/copilot/CopilotDrawer.tsx` extend `applyEvent`:

```tsx
case 'citation': {
  return {
    ...m,
    citations: [...(m.citations ?? []), {
      toolName: e.data.toolName,
      ref: e.data.ref,
      title: e.data.title,
    }],
  };
}
```

- [ ] **Step 6: Add i18n strings**

Append to `apps/frontend/messages/en/copilot.json` (under root):

```json
"citation": {
  "openInWiki": "Open in wiki"
},
```

And to `ru/copilot.json`:

```json
"citation": {
  "openInWiki": "Открыть в wiki"
},
```

- [ ] **Step 7: Run tests**

Run: `cd apps/frontend && pnpm vitest run lib/copilot/citations.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/lib/copilot/citations.ts apps/frontend/lib/copilot/citations.test.ts apps/frontend/components/copilot/CitationPill.tsx apps/frontend/components/copilot/MessageBubble.tsx apps/frontend/components/copilot/CopilotDrawer.tsx apps/frontend/messages/en/copilot.json apps/frontend/messages/ru/copilot.json
git commit -m "feat(copilot): render citation pills inline below assistant messages"
```

---

## Task 17: Frontend — command-palette entry

**Files:**
- Create: `apps/frontend/components/copilot/PaletteCopilotEntry.tsx`
- Modify: existing palette component (find via `grep -rn "CommandDialog\|CommandPalette" apps/frontend/components`)

The repo already has a command palette; this task adds an entry. **Locate the palette before writing code** — its API determines how new commands register.

- [ ] **Step 1: Locate the palette**

Run: `grep -rn "CommandDialog\|CommandPalette\|cmdk" apps/frontend/components apps/frontend/app | head -10`
Inspect the output. The palette is likely in `apps/frontend/components/<something>/CommandPalette.tsx` or imported from `cmdk` directly. Note the registration mechanism — typically a `<CommandItem>` inside a `<CommandGroup>`, or a `commands` array prop.

- [ ] **Step 2: Add the Copilot entry component**

Create `apps/frontend/components/copilot/PaletteCopilotEntry.tsx` with the API shape that matches the existing palette. Below is the **shadcn/ui cmdk** shape (the most likely match — adapt if the palette differs):

```tsx
'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCopilot } from './CopilotProvider';

interface Props {
  onClose?: () => void;
}

export function PaletteCopilotEntry({ onClose }: Props) {
  const t = useTranslations('copilot.palette');
  const { open, setCurrentThreadId } = useCopilot();
  // The cmdk-style API uses CommandItem; if the existing palette renders a list of
  // {id, label, icon, action} entries, adapt to that shape instead.
  return (
    <button
      type="button"
      onClick={() => {
        setCurrentThreadId(null); // forces a fresh thread on next send
        open();
        onClose?.();
      }}
      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted"
    >
      <Sparkles size={14} />
      {t('askCopilot')}
    </button>
  );
}
```

- [ ] **Step 3: Register in the existing palette**

Open the palette component and inject `<PaletteCopilotEntry />` near the top of the actions list (so it's the first hit when no query is typed). Example for shadcn `<CommandList>` / `<CommandGroup>`:

```tsx
import { PaletteCopilotEntry } from '@/components/copilot/PaletteCopilotEntry';

<CommandGroup heading={t('common.assistant')}>
  <CommandItem onSelect={() => { /* see PaletteCopilotEntry — call its props */ }}>
    <PaletteCopilotEntry onClose={() => setOpen(false)} />
  </CommandItem>
</CommandGroup>
```

If the palette is built differently, register as the project expects — keep `PaletteCopilotEntry` as the action body.

- [ ] **Step 4: i18n strings**

Append to `apps/frontend/messages/en/copilot.json`:

```json
"palette": {
  "askCopilot": "Ask Copilot…"
},
```

And to `ru/copilot.json`:

```json
"palette": {
  "askCopilot": "Спросить Copilot…"
},
```

- [ ] **Step 5: Type-check + commit**

Run: `cd apps/frontend && pnpm tsc --noEmit`
Expected: success.

```bash
git add apps/frontend/components/copilot/PaletteCopilotEntry.tsx apps/frontend/messages/en/copilot.json apps/frontend/messages/ru/copilot.json
# Plus the palette file you modified.
git commit -m "feat(copilot): add Ask Copilot entry to command palette"
```

---

## Task 18: Frontend — `ToolCallCard` upgrade

**Files:**
- Modify: `apps/frontend/components/copilot/ToolCallCard.tsx`

Phase 1's tool-call card shows status + duration. Phase 2 adds:
- A small JSON-tree renderer for `resultSummary` (collapsible per key)
- Status icons (✓ / ✕ / ⏱ / 🔒)
- Auto-collapse for `ok` results > 5 keys

- [ ] **Step 1: Replace `ToolCallCard.tsx`**

Replace the contents of `apps/frontend/components/copilot/ToolCallCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X, Clock, Lock, ChevronDown, ChevronRight } from 'lucide-react';

export interface ToolCallCardProps {
  name: string;
  status: 'running' | 'ok' | 'rbac_denied' | 'error' | 'timeout' | 'invalid_args';
  durationMs?: number;
  errorMessage?: string;
  resultSummary?: unknown;
}

const StatusIcon = ({ status }: { status: ToolCallCardProps['status'] }) => {
  switch (status) {
    case 'running':
      return <Clock size={12} className="animate-pulse" />;
    case 'ok':
      return <Check size={12} className="text-emerald-700" />;
    case 'rbac_denied':
      return <Lock size={12} className="text-red-700" />;
    case 'timeout':
      return <Clock size={12} className="text-red-700" />;
    case 'error':
    case 'invalid_args':
      return <X size={12} className="text-red-700" />;
  }
};

export function ToolCallCard(props: ToolCallCardProps) {
  const t = useTranslations('copilot.toolCall');
  const [open, setOpen] = useState(props.status !== 'ok');
  const label =
    props.status === 'running'
      ? t('running', { name: props.name })
      : props.status === 'rbac_denied'
        ? t('denied', { name: props.name })
        : props.status === 'ok'
          ? t('complete', { name: props.name, durationMs: props.durationMs ?? 0 })
          : t('error', { name: props.name, message: props.errorMessage ?? '' });

  return (
    <div className="my-2 rounded-md border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-2"
      >
        <span className="flex items-center gap-1.5">
          <StatusIcon status={props.status} />
          <span>{label}</span>
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && props.resultSummary !== undefined && (
        <div className="border-t p-2">
          <JsonTree data={props.resultSummary} depth={0} />
        </div>
      )}
    </div>
  );
}

function JsonTree({ data, depth }: { data: unknown; depth: number }) {
  if (data === null) return <span className="text-muted-foreground">null</span>;
  if (typeof data !== 'object') {
    return <span className="text-emerald-700">{JSON.stringify(data)}</span>;
  }
  const isArray = Array.isArray(data);
  const entries = isArray ? (data as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-muted-foreground">{isArray ? '[]' : '{}'}</span>;
  return (
    <div className={depth === 0 ? '' : 'border-l border-muted pl-2'}>
      {entries.map(([k, v]) => (
        <details key={k} className="my-0.5" open={depth < 1}>
          <summary className="cursor-pointer">
            <span className="font-medium">{k}</span>
            {typeof v !== 'object' && <span className="ml-1 text-muted-foreground">: {JSON.stringify(v)}</span>}
          </summary>
          {typeof v === 'object' && v !== null && <JsonTree data={v} depth={depth + 1} />}
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && pnpm tsc --noEmit`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/copilot/ToolCallCard.tsx
git commit -m "feat(copilot): upgrade tool-call card with status icons and JSON tree"
```

---

## Task 19: Wire Phase 2 into `cmd/api/main.go`

**Files:**
- Modify: `apps/backend/cmd/api/main.go`
- Modify: `apps/backend/cmd/api/copilot_adapters.go`
- Modify: `apps/backend/.env.example`

Adds: KB indexer/retriever construction, embedder factory, YandexGPT provider, ProviderRegistry replacing the direct Anthropic injection, KB reindex + tenant config routes, Asynq handler for KB index, optional cron schedule for periodic reindex.

- [ ] **Step 1: Append env vars**

Append to `apps/backend/.env.example`:

```bash
# AI Copilot — Phase 2
COPILOT_DEFAULT_EMBEDDER=voyage
COPILOT_VOYAGE_API_KEY=
COPILOT_VOYAGE_MODEL=voyage-3
COPILOT_KB_ROOT=apps/frontend/content/wiki
COPILOT_KB_REINDEX_CRON=                # leave empty to disable; e.g. "@daily"
COPILOT_YANDEX_FOLDER_ID=
COPILOT_YANDEX_MODEL_URI=gpt://b1g.../yandexgpt/latest
COPILOT_YANDEX_EMBED_MODEL_URI=emb://b1g.../text-search-doc/latest
COPILOT_YANDEX_API_KEY=                  # one of these two auth modes:
COPILOT_YANDEX_SA_KEY_FILE=              # path to service-account JSON (preferred)
```

- [ ] **Step 2: Add construction block in main.go**

Inside the existing `if copilotEnabled { ... }` block, after the Anthropic provider is created:

```go
// Embedder factory (Phase 2)
defaultEmbedder := os.Getenv("COPILOT_DEFAULT_EMBEDDER")
if defaultEmbedder == "" { defaultEmbedder = "voyage" }
embCfg := copilotgateway.EmbedderConfig{
    VoyageAPIKey:   os.Getenv("COPILOT_VOYAGE_API_KEY"),
    VoyageModel:    os.Getenv("COPILOT_VOYAGE_MODEL"),
    YandexFolderID: os.Getenv("COPILOT_YANDEX_FOLDER_ID"),
    YandexAPIKey:   os.Getenv("COPILOT_YANDEX_API_KEY"),
    YandexModelURI: os.Getenv("COPILOT_YANDEX_EMBED_MODEL_URI"),
}
embedder, err := copilotgateway.NewEmbedder(defaultEmbedder, embCfg)
if err != nil {
    slog.Warn("copilot embedder init", "err", err) // continue with no embedder
}

// KB
kbRepo := copilotkb.NewKBChunkRepository(database.DB)
kbIndexer := copilotkb.NewIndexer(kbRepo, embedder, copilotkb.IndexerConfig{
    Root: orDefault(os.Getenv("COPILOT_KB_ROOT"), "apps/frontend/content/wiki"),
})
kbRetriever := copilotkb.NewRetriever(kbRepo, embedder)

// search_wiki tool registration (extend existing registry)
copilotRegistry.Register(copilottools.NewSearchWikiTool(&copilotWikiRetrieverAdapter{r: kbRetriever}))

// Build provider map
providers := map[string]copilotgateway.LLMProvider{
    "anthropic": copilotProvider, // from Phase 1
}

// Optional Yandex provider
if yfolder := os.Getenv("COPILOT_YANDEX_FOLDER_ID"); yfolder != "" {
    var iam copilotgateway.IAMTokenSource
    if saKeyPath := os.Getenv("COPILOT_YANDEX_SA_KEY_FILE"); saKeyPath != "" {
        if src, err := loadYandexIAMSource(saKeyPath); err == nil {
            iam = src
        } else {
            slog.Warn("copilot yandex IAM init", "err", err)
        }
    }
    yandexProvider := copilotgateway.NewYandexGPT(copilotgateway.YandexGPTConfig{
        FolderID:  yfolder,
        ModelURI:  os.Getenv("COPILOT_YANDEX_MODEL_URI"),
        APIKey:    os.Getenv("COPILOT_YANDEX_API_KEY"),
        IAMSource: iam,
    })
    providers["yandex"] = yandexProvider
}

// Tenant config + provider registry
tenantConfigSvc := copilotquota.NewTenantConfigService(&copilotTenantConfigRepoAdapter{db: database.DB})
providerRegistry := copilotgateway.NewProviderRegistry(tenantConfigSvc, "anthropic", providers)

// The Phase 1 agent loop took a single LLMProvider. Replace its construction
// to take the registry by per-request resolution. (See Step 3 in cmd/api: refactor
// chat handler to resolve provider per request via registry.For(ctx, companyID).)
copilotChat = copilothandlers.NewChatHandlerWithRegistry(
    providerRegistry, // new constructor — see chat.go change below
    copilotRegistry,
    copilotPolicy,
    copilotConvoSvc,
    copilotQuotaSvc,
    copilotSystemPrompt,
)

// KB reindex + tenant config handlers
kbReindexHandler := copilothandlers.NewKBReindexHandler(jobClient)
tenantConfigHandler := copilothandlers.NewTenantConfigHandler(tenantConfigSvc, &copilotTenantConfigSetterAdapter{db: database.DB})

// Asynq handler registration for kb index
kbIndexHandler := jobs.HandleCopilotKBIndex(&copilotKBIndexerAdapter{idx: kbIndexer})
// asynqMux.HandleFunc(jobs.TypeCopilotKBIndex, kbIndexHandler) — adjust to existing mux name

// Optional cron schedule for periodic reindex
if cron := os.Getenv("COPILOT_KB_REINDEX_CRON"); cron != "" && scheduler != nil {
    if _, err := scheduler.Register(cron, asynq.NewTask(jobs.TypeCopilotKBIndex, mustJSON(jobs.CopilotKBIndexPayload{Mode: "all"}))); err != nil {
        slog.Error("copilot KB reindex schedule", "err", err)
    }
}
```

Add the missing imports:

```go
copilotkb "quokkaq-go-backend/internal/copilot/kb"
```

- [ ] **Step 3: Refactor `ChatHandler` to use the registry**

In `apps/backend/internal/copilot/handlers/chat.go`, add an alternate constructor:

```go
type ChatHandlerRegistryDeps struct {
    Registry  *gateway.ProviderRegistry
    Tools     *tools.Registry
    Policy    agent.Policy
    Convo     *conversation.Service
    Quota     *quota.Service
    SysPrompt string
    DefaultModel string
}

// NewChatHandlerWithRegistry resolves the provider per request from the registry.
// Replaces NewChatHandler when Phase 2 wires multi-provider support.
func NewChatHandlerWithRegistry(reg *gateway.ProviderRegistry, toolReg *tools.Registry, policy agent.Policy, convo *conversation.Service, q *quota.Service, sysPrompt string) *ChatHandler {
    return &ChatHandler{
        loop: nil, // resolved per request
        loopFactory: func(p gateway.LLMProvider) *agent.Loop {
            return agent.NewLoop(p, toolReg, policy)
        },
        providerRegistry: reg,
        convoSvc: convo,
        quotaSvc: q,
        systemPrompt: sysPrompt,
    }
}
```

Update `HandleMessage` to call `h.providerRegistry.For(r.Context(), ident.CompanyID)` and build the loop on the fly. Keep the Phase 1 path working when `providerRegistry == nil`.

```go
// In HandleMessage, replace `h.loop.Run(...)` with:
loop := h.loop
if loop == nil && h.providerRegistry != nil {
    p, err := h.providerRegistry.For(r.Context(), ident.CompanyID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    loop = h.loopFactory(p)
}
res, runErr := loop.Run(r.Context(), agent.RunInput{...}, sink)
```

Add the new fields to the `ChatHandler` struct accordingly.

- [ ] **Step 4: Adapter additions in `copilot_adapters.go`**

Append to `apps/backend/cmd/api/copilot_adapters.go`:

```go
// copilotWikiRetrieverAdapter bridges kb.Retriever to tools.WikiRetriever.
type copilotWikiRetrieverAdapter struct{ r *copilotkb.Retriever }

func (a *copilotWikiRetrieverAdapter) Retrieve(ctx context.Context, query, locale string, k int) ([]copilottools.WikiHit, error) {
    rs, err := a.r.Retrieve(ctx, query, locale, k)
    if err != nil {
        return nil, err
    }
    out := make([]copilottools.WikiHit, len(rs))
    for i, h := range rs {
        out[i] = copilottools.WikiHit{Path: h.Path, Anchor: h.Anchor, Locale: h.Locale, Snippet: h.Snippet, Score: h.Score}
    }
    return out, nil
}

// copilotKBIndexerAdapter bridges kb.Indexer to jobs.CopilotKBIndexer.
type copilotKBIndexerAdapter struct{ idx *copilotkb.Indexer }

func (a *copilotKBIndexerAdapter) IndexAll(ctx context.Context) (any, error) {
    return a.idx.IndexAll(ctx)
}
func (a *copilotKBIndexerAdapter) IndexFile(ctx context.Context, rel string) (any, error) {
    return a.idx.IndexFile(ctx, rel)
}

// copilotTenantConfigRepoAdapter satisfies quota.TenantConfigRepo by reading the
// new copilot_* columns from the companies table.
type copilotTenantConfigRepoAdapter struct{ db *gorm.DB }

func (a *copilotTenantConfigRepoAdapter) GetCopilotConfig(ctx context.Context, companyID string) (*copilotquota.RawTenantConfig, error) {
    var c models.Company
    if err := a.db.WithContext(ctx).Select(
        "copilot_provider, copilot_model, copilot_embedding_provider, copilot_pii_level, copilot_locale_pref",
    ).Where("id = ?", companyID).First(&c).Error; err != nil {
        return nil, err
    }
    return &copilotquota.RawTenantConfig{
        Provider: c.CopilotProvider,
        Model:    c.CopilotModel,
        EmbeddingProvider: c.CopilotEmbeddingProvider,
        PIILevel: c.CopilotPIILevel,
        LocalePref: c.CopilotLocalePref,
    }, nil
}

// copilotTenantConfigSetterAdapter writes the same columns.
type copilotTenantConfigSetterAdapter struct{ db *gorm.DB }

func (a *copilotTenantConfigSetterAdapter) SetCopilotConfig(ctx interface{}, companyID string, patch copilotquota.RawTenantConfig) error {
    fields := map[string]interface{}{}
    if patch.Provider != nil { fields["copilot_provider"] = *patch.Provider }
    if patch.Model != nil { fields["copilot_model"] = *patch.Model }
    if patch.EmbeddingProvider != nil { fields["copilot_embedding_provider"] = *patch.EmbeddingProvider }
    if patch.PIILevel != nil { fields["copilot_pii_level"] = *patch.PIILevel }
    if patch.LocalePref != nil { fields["copilot_locale_pref"] = *patch.LocalePref }
    if len(fields) == 0 {
        return nil
    }
    return a.db.Model(&models.Company{}).Where("id = ?", companyID).Updates(fields).Error
}

// loadYandexIAMSource reads a Yandex SA key JSON and returns an IAM source.
func loadYandexIAMSource(path string) (copilotgateway.IAMTokenSource, error) {
    body, err := os.ReadFile(path)
    if err != nil {
        return nil, err
    }
    var key struct {
        ID               string `json:"id"`
        ServiceAccountID string `json:"service_account_id"`
        PrivateKey       string `json:"private_key"`
    }
    if err := json.Unmarshal(body, &key); err != nil {
        return nil, err
    }
    block, _ := pem.Decode([]byte(key.PrivateKey))
    if block == nil {
        return nil, errors.New("yandex SA: bad PEM")
    }
    parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        return nil, err
    }
    rsaKey, ok := parsed.(*rsa.PrivateKey)
    if !ok {
        return nil, errors.New("yandex SA: not RSA")
    }
    return copilotgateway.NewYandexIAMSource(copilotgateway.YandexIAMConfig{
        ServiceAccountID: key.ServiceAccountID,
        KeyID:            key.ID,
        PrivateKey:       rsaKey,
    }), nil
}

func orDefault(s, d string) string { if s == "" { return d }; return s }
func mustJSON(v any) []byte         { b, _ := json.Marshal(v); return b }
```

Add the missing imports to the file:

```go
import (
    "crypto/rsa"
    "crypto/x509"
    "encoding/json"
    "encoding/pem"
    "errors"
    "os"

    "quokkaq-go-backend/internal/copilot/gateway"
    copilotgateway "quokkaq-go-backend/internal/copilot/gateway"
    copilotkb "quokkaq-go-backend/internal/copilot/kb"
    copilotquota "quokkaq-go-backend/internal/copilot/quota"
    copilottools "quokkaq-go-backend/internal/copilot/tools"
    "quokkaq-go-backend/internal/models"
)
```

- [ ] **Step 5: Mount routes**

Add inside the `r.Route("/api/copilot", ...)` block (extending Phase 1):

```go
r.With(adminOnly).Post("/kb/reindex", kbReindexHandler.HandleReindex)
r.With(adminOnly).Get("/tenant-config", tenantConfigHandler.HandleGet)
r.With(adminOnly).Patch("/tenant-config", tenantConfigHandler.HandlePatch)
```

`adminOnly` is the middleware the project uses for `copilot:admin`-gated routes (likely already exists for other admin endpoints — find with `grep`).

- [ ] **Step 6: Build + integration smoke**

Run: `cd apps/backend && go build ./...`
Expected: success.

Local smoke:
```bash
cd apps/backend
docker-compose up -d postgres redis
RUN_AUTO_MIGRATE=true COPILOT_ENABLED=true COPILOT_ANTHROPIC_API_KEY=test COPILOT_VOYAGE_API_KEY=test COPILOT_KB_ROOT=$PWD/../frontend/content/wiki ./bin/server &
# Hit reindex endpoint with admin token
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"mode":"all"}' http://localhost:3001/api/copilot/kb/reindex
# expect: 202 {"status":"queued"}
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/cmd/api/main.go apps/backend/cmd/api/copilot_adapters.go apps/backend/.env.example
git commit -m "feat(copilot): wire Phase 2 (KB, Yandex provider, registry, admin endpoints)"
```

---

## Task 20: Regenerate OpenAPI and Orval

- [ ] **Step 1: Regenerate**

Run: `pnpm nx openapi backend && pnpm nx orval frontend`
Expected: success; new endpoints `/api/copilot/kb/reindex`, `/api/copilot/tenant-config` appear.

- [ ] **Step 2: CI sync check**

Run: `pnpm nx run frontend:openapi:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/docs apps/frontend/src/lib/api/generated
git commit -m "chore(copilot): regenerate OpenAPI and Orval client for Phase 2"
```

---

## Acceptance criteria (Phase 2 sign-off)

1. `cd apps/backend && go build ./... && go test ./...` passes (KB integration test gated; runs when `RUN_INTEGRATION_TESTS=true`).
2. `cd apps/frontend && pnpm vitest run components/copilot/ lib/copilot/` passes.
3. `pnpm nx openapi backend && pnpm nx orval frontend` produce no diffs.
4. With `COPILOT_KB_ROOT` pointing at the wiki, `POST /api/copilot/kb/reindex {mode:"all"}` returns 202; the Asynq job runs and `SELECT count(*) FROM copilot_kb_chunks` is non-zero in Postgres.
5. Asking the Copilot drawer "How do I configure SSO with Azure AD?" produces an answer that includes ≥1 citation pill linking to a `/help/...` page; clicking the pill opens the wiki at the expected anchor.
6. With a tenant whose `copilot_provider = 'yandex'` (set via `PATCH /api/copilot/tenant-config`), the next message is served by Yandex (verify by `Provider` field in the persisted `copilot_messages.provider` column or by tracing `copilot.llm.create_message` span attribute).
7. `cd apps/backend && go run ./internal/copilot/eval/cmd` returns `Failed: 0`.
8. CI workflow runs the eval job on PRs that touch `apps/backend/internal/copilot/**` or `apps/frontend/content/wiki/**`.
9. Command palette ⌘+K shows "Ask Copilot…" as a top entry; selecting it opens the drawer with a fresh thread.
10. Tool-call cards render the JSON-tree summary; collapsed by default for `ok` results; expanded for errors and RBAC denials.

## Out of Phase 2 — explicit deferrals

- Entity-lookup tools (`lookup_ticket`, `search_clients`, `lookup_support_report`, `search_audit_events`, `get_staff_performance`, `get_survey_aggregates`, `get_sla_breaches`) — **Phase 3**.
- Full PII tag walker + property-based fuzz — **Phase 3**.
- Per-plan token quotas + cost dashboard — **Phase 3**.
- Full Grafana boards — **Phase 3**.
- Accessibility audit — **Phase 3**.
- Per-provider chunk tables for embedding-dim mismatch — Phase 3 (currently Yandex's 256-dim is zero-padded to 1536).
- GigaChat adapter — Appendix A in this plan; swap Tasks 8a–8b if first design partner needs it instead of Yandex.

---

## Appendix A — GigaChat alternative

If GigaChat is chosen instead of YandexGPT, replace Tasks 8a–8b with these two tasks. The rest of the plan (registry, tenant config, eval, frontend) is provider-agnostic.

### A.1 GigaChat OAuth source

GigaChat (Sber) authenticates via OAuth2 client-credentials. Tokens are short-lived (~30 min); cache and refresh.

```go
// apps/backend/internal/copilot/gateway/gigachat_oauth.go
type GigaChatOAuthConfig struct {
    AuthURL      string // default https://ngw.devices.sberbank.ru:9443/api/v2/oauth
    ClientID     string
    ClientSecret string
    Scope        string // "GIGACHAT_API_PERS" | "GIGACHAT_API_B2B" | "GIGACHAT_API_CORP"
    RefreshLeeway time.Duration // default 5 min
    HTTPClient   *http.Client
}

type gigaOAuthSource struct { /* mu, token, expAt, cfg, client */ }

func (g *gigaOAuthSource) IAMToken(ctx context.Context) (string, error) {
    // POST to AuthURL with Basic auth (clientID:clientSecret), body "scope=...".
    // Response: {access_token, expires_at}.
    // Same shape as Yandex IAM source — reuse cache pattern.
}
```

### A.2 GigaChat chat adapter

API base `https://gigachat.devices.sberbank.ru/api/v1`. Endpoint `/chat/completions` is OpenAI-compatible (function calling supported, streaming via SSE). Implement against this OpenAI-style wire format, identical structure to the YandexGPT adapter.

The rest of the plan (registry default, tenant config, eval, frontend, citations, palette, CI) is unchanged — you flip the entry in `providers["gigachat"] = ...` and tenants opt in via `PATCH /api/copilot/tenant-config {"provider":"gigachat"}`.
