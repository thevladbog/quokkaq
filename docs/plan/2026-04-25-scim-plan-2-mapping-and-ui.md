# SCIM 2.0 — Plan 2: Mapping, Lifecycle, Admin UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the foundation built in Plan 1 into a fully functional SCIM provisioning experience: tenants can map SCIM groups to QuokkaQ roles, IdP-driven membership changes flow into per-user role grants automatically, deactivated users go through retention-based PII anonymization, JIT-SSO finds SCIM-provisioned users by `externalId`, and tenant admins manage everything from `/settings/sso/scim/*` in the frontend.

**Architecture:** Extends `internal/scim/` with mapping CRUD + recompute pipeline, adds Asynq jobs (`scim.recompute_user_grants`, `pii.anonymize_user`, `pii.anonymize_users_due`, `scim.token_rotation_finalize`), modifies `internal/auth/` for SCIM-aware JIT, and adds a sibling `internal/scim_admin/` package for the admin management API (separate from the SCIM endpoints — different shape, different auth, OpenAPI-tracked).

**Tech Stack:** Same as Plan 1, plus: Next.js 16 + React 19 + TanStack Query + Zustand + React Hook Form + Zod + Tailwind 4 + next-intl (frontend layer); Asynq scheduler.

**Source spec:** `docs/plan/2026-04-25-scim-2.0-enterprise-provisioning-design.md`
**Predecessor:** `docs/plan/2026-04-25-scim-plan-1-foundation.md` (must ship first)
**Successor:** `docs/plan/2026-04-25-scim-plan-3-rollout.md` (testing, docs, rollout)

**Out of scope for Plan 2 (deferred to Plan 3):**
- RFC conformance test job (Microsoft / Okta validators) in CI
- k6 load testing
- Playwright E2E suite
- Public docs (`docs.quokkaq.ru/scim/...`)
- IdP-specific guides (Okta, Keycloak, Entra ID)
- Internal `scim-runbook.md`
- Phased rollout (alpha → beta → GA) as a project deliverable

---

## File structure

### Created files (Go backend)

```
apps/backend/internal/scim/
├── service/
│   ├── mapping_service.go              # mapping CRUD + recompute orchestration
│   ├── recompute_service.go            # diff + atomic write of role assignments
│   ├── anonymization_service.go        # PII scrub
│   └── grace_period_service.go         # finalize token_rotation_pending after 24h
├── repository/
│   ├── mapping_repo.go                 # scim_group_mappings CRUD
│   └── role_assignment_repo.go         # write/read role assignments WITH source filter
└── jobs/
    ├── recompute_user_grants.go        # Asynq task type
    ├── anonymize_user.go
    ├── anonymize_users_due.go
    └── token_rotation_finalize.go

apps/backend/internal/scim_admin/        # Admin management API — distinct from SCIM
├── handlers/
│   ├── tokens.go
│   ├── mappings.go
│   ├── settings.go
│   ├── activity.go
│   └── stats.go
├── service/
│   └── admin_service.go
└── routes.go
```

### Modified files (Go backend)

| File | Change |
|---|---|
| `apps/backend/internal/auth/` (SSO/JIT) | Match user by `scim_external_id` from SSO subject claim before falling back to email; respect `scim.allow_jit_sso` per-tenant flag |
| `apps/backend/internal/users/service.go` | Honor `scim_managed_attribute` rule: refuse direct edits of SCIM-managed fields when `scim_metadata.source='scim'` |
| `apps/backend/internal/scim/service/user_service.go` | Implement auto-link path when tenant flag enabled (Plan 1 left this as a stub) |
| `apps/backend/cmd/api/main.go` | Register admin routes, register Asynq jobs, register scheduled crons |
| `apps/backend/configs/openapi/` | Admin endpoints added to main OpenAPI spec → orval regen for frontend |

### Created files (Frontend)

```
apps/frontend/app/[locale]/settings/sso/scim/
├── page.tsx                            # Overview / Setup
├── tokens/page.tsx
├── mappings/page.tsx
├── groups/page.tsx
├── users/page.tsx                      # filtered view of /settings/users
├── activity/page.tsx
└── layout.tsx                          # shared sidebar nav

apps/frontend/components/scim/
├── TokenRevealModal.tsx
├── TokenList.tsx
├── MappingEditor.tsx
├── MappingTable.tsx
├── SourceBadge.tsx
├── ProvisioningEventRow.tsx
├── ProvisioningEventDrawer.tsx
└── EnableScimCard.tsx

apps/frontend/hooks/scim/
├── use-tokens.ts                       # TanStack Query hooks
├── use-mappings.ts
├── use-groups.ts
├── use-activity.ts
├── use-settings.ts
└── use-stats.ts

apps/frontend/messages/en.json           # add settings.sso.scim.* keys
apps/frontend/messages/ru.json           # mirror
```

### Migrations

```
20260425_006_role_assignments_source.up.sql / .down.sql
20260425_007_scim_settings.up.sql / .down.sql                # per-tenant settings table
```

---

## Phase 2.A — `role_assignments.source` migration

### Task 1 — Migration 006

**Pre-flight:** verify role-assignments table name from Plan 1 Task 0.4. Plan continues using placeholder `user_role_assignments` — adjust during impl.

**Files:**
- Create: `apps/backend/migrations/20260425_006_role_assignments_source.up.sql`
- Create: `apps/backend/migrations/20260425_006_role_assignments_source.down.sql`

- [ ] **Step 1.1: Up**

```sql
ALTER TABLE user_role_assignments
    ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'scim'));

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_source
    ON user_role_assignments(user_id, source);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_source_company
    ON user_role_assignments(source, company_id)
    WHERE source = 'scim';
```

- [ ] **Step 1.2: Down**

```sql
DROP INDEX IF EXISTS idx_user_role_assignments_source_company;
DROP INDEX IF EXISTS idx_user_role_assignments_user_source;
ALTER TABLE user_role_assignments DROP COLUMN IF EXISTS source;
```

- [ ] **Step 1.3: Apply, verify, rollback-test, re-apply**

```bash
make migrate-up
psql "$DATABASE_URL" -c "\d user_role_assignments" | grep source
make migrate-down && make migrate-up
```

- [ ] **Step 1.4: Commit**

```bash
git add apps/backend/migrations/20260425_006_role_assignments_source.*
git commit -m "feat(scim): add source column to role assignments"
```

### Task 2 — Migration 007: per-tenant SCIM settings

**Files:**
- Create: `apps/backend/migrations/20260425_007_scim_settings.up.sql`
- Create: `apps/backend/migrations/20260425_007_scim_settings.down.sql`

- [ ] **Step 2.1: Up**

```sql
CREATE TABLE IF NOT EXISTS scim_tenant_settings (
    company_id              UUID        PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    enabled                 BOOLEAN     NOT NULL DEFAULT false,
    allow_jit_sso           BOOLEAN     NOT NULL DEFAULT true,
    auto_link_existing_users BOOLEAN    NOT NULL DEFAULT false,
    retention_days          INTEGER     NOT NULL DEFAULT 365 CHECK (retention_days IN (-1, 90, 180, 365)),
    -- retention_days = -1 means "never auto-anonymize"
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by              UUID        REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_scim_tenant_settings_enabled
    ON scim_tenant_settings(enabled) WHERE enabled = true;
```

- [ ] **Step 2.2: Down**

```sql
DROP TABLE IF EXISTS scim_tenant_settings;
```

- [ ] **Step 2.3: Apply, verify, rollback-test, re-apply, commit**

```bash
make migrate-up && make migrate-down && make migrate-up
git add apps/backend/migrations/20260425_007_scim_settings.*
git commit -m "feat(scim): add per-tenant settings table"
```

---

## Phase 2.B — Mapping CRUD (repo + service + audit)

### Task 3 — Mapping repository

**Files:**
- Create: `apps/backend/internal/scim/repository/mapping_repo.go`
- Create: `apps/backend/internal/scim/repository/mapping_repo_integration_test.go`

- [ ] **Step 3.1: Add SCIMGroupMapping model**

Append to `apps/backend/internal/scim/repository/models.go`:
```go
type SCIMGroupMapping struct {
	ID           uuid.UUID  `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID    uuid.UUID  `gorm:"type:uuid;not null"`
	ScimGroupID  uuid.UUID  `gorm:"type:uuid;not null"`
	RoleCode     string     `gorm:"type:varchar(64);not null"`
	UnitID       *uuid.UUID `gorm:"type:uuid"`
	ServiceIDs   pq.UUIDArray `gorm:"type:uuid[]"`
	IsActive     bool       `gorm:"not null;default:true"`
	CreatedAt    time.Time  `gorm:"not null;default:now()"`
	CreatedBy    *uuid.UUID `gorm:"type:uuid"`
	UpdatedAt    time.Time  `gorm:"not null;default:now()"`
}

func (SCIMGroupMapping) TableName() string { return "scim_group_mappings" }
```

(Import `github.com/lib/pq` for `pq.UUIDArray`.)

- [ ] **Step 3.2: Write failing test**

```go
//go:build integration

func TestMappingRepo_CRUD(t *testing.T) {
	db := openTestDB(t)
	repo := NewMappingRepo(db)
	ctx := context.Background()

	co := ensureCompany(t, db)
	defer cleanupCompany(t, db, co)

	// Seed group + unit
	groupID := ensureScimGroup(t, db, co, "ops")
	unitID := ensureUnit(t, db, co, "MSK-001")

	m := &SCIMGroupMapping{
		CompanyID:   co,
		ScimGroupID: groupID,
		RoleCode:    "operator",
		UnitID:      &unitID,
		ServiceIDs:  pq.UUIDArray{uuid.New()},
	}
	require.NoError(t, repo.Create(ctx, m))

	got, err := repo.ListByGroup(ctx, co, groupID)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "operator", got[0].RoleCode)

	// Update is_active
	require.NoError(t, repo.SetActive(ctx, m.ID, false))
	got, _ = repo.ListByGroup(ctx, co, groupID)
	require.False(t, got[0].IsActive)

	// Delete
	require.NoError(t, repo.Delete(ctx, m.ID))
	got, _ = repo.ListByGroup(ctx, co, groupID)
	require.Len(t, got, 0)
}

func TestMappingRepo_DeactivateOnUnitDelete(t *testing.T) {
	// When a unit is soft-deleted, the trigger or service must mark
	// all mappings referencing it as is_active=false.
	// This test validates either a DB trigger OR the service-layer cascade.
}
```

- [ ] **Step 3.3: Implement**

`mapping_repo.go`:
```go
package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/gorm"
)

var ErrMappingNotFound = errors.New("mapping not found")

type MappingRepo struct{ db *gorm.DB }

func NewMappingRepo(db *gorm.DB) *MappingRepo { return &MappingRepo{db: db} }

func (r *MappingRepo) Create(ctx context.Context, m *SCIMGroupMapping) error {
	return r.db.WithContext(ctx).Create(m).Error
}

func (r *MappingRepo) Update(ctx context.Context, m *SCIMGroupMapping) error {
	return r.db.WithContext(ctx).
		Model(&SCIMGroupMapping{}).
		Where("id = ?", m.ID).
		Updates(map[string]any{
			"role_code":   m.RoleCode,
			"unit_id":     m.UnitID,
			"service_ids": m.ServiceIDs,
			"is_active":   m.IsActive,
			"updated_at":  gorm.Expr("now()"),
		}).Error
}

func (r *MappingRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&SCIMGroupMapping{}, "id = ?", id).Error
}

func (r *MappingRepo) SetActive(ctx context.Context, id uuid.UUID, active bool) error {
	return r.db.WithContext(ctx).
		Model(&SCIMGroupMapping{}).
		Where("id = ?", id).
		Updates(map[string]any{"is_active": active, "updated_at": gorm.Expr("now()")}).Error
}

func (r *MappingRepo) ListByGroup(ctx context.Context, companyID, groupID uuid.UUID) ([]SCIMGroupMapping, error) {
	var rows []SCIMGroupMapping
	err := r.db.WithContext(ctx).
		Where("company_id = ? AND scim_group_id = ?", companyID, groupID).
		Find(&rows).Error
	return rows, err
}

func (r *MappingRepo) ListByCompany(ctx context.Context, companyID uuid.UUID) ([]SCIMGroupMapping, error) {
	var rows []SCIMGroupMapping
	err := r.db.WithContext(ctx).
		Where("company_id = ?", companyID).
		Order("created_at DESC").
		Find(&rows).Error
	return rows, err
}

// DeactivateByUnit is called by the service layer when a unit is deleted.
// Returns the list of affected mapping IDs so callers can enqueue recompute.
func (r *MappingRepo) DeactivateByUnit(ctx context.Context, unitID uuid.UUID) ([]uuid.UUID, error) {
	var affected []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&SCIMGroupMapping{}).
		Where("unit_id = ? AND is_active = TRUE", unitID).
		Pluck("id", &affected).Error
	if err != nil {
		return nil, err
	}
	if len(affected) == 0 {
		return nil, nil
	}
	err = r.db.WithContext(ctx).
		Model(&SCIMGroupMapping{}).
		Where("id IN ?", affected).
		Updates(map[string]any{"is_active": false, "updated_at": gorm.Expr("now()")}).Error
	return affected, err
}
```

- [ ] **Step 3.4: Run, commit**

```bash
cd apps/backend && DATABASE_URL_TEST=$DATABASE_URL go test -tags integration ./internal/scim/repository/ -v
git add apps/backend/internal/scim/repository/mapping_repo.go apps/backend/internal/scim/repository/mapping_repo_integration_test.go apps/backend/internal/scim/repository/models.go
git commit -m "feat(scim): add mapping repository (CRUD + cascade-on-unit-delete)"
```

### Task 4 — Mapping service with validation

**Files:**
- Create: `apps/backend/internal/scim/service/mapping_service.go`
- Create: `apps/backend/internal/scim/service/mapping_service_test.go`

- [ ] **Step 4.1: Define service with role/unit/services validation**

`mapping_service.go`:
```go
package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/quokkaq/backend/internal/scim/repository"
)

var (
	ErrInvalidMapping = errors.New("invalid mapping (role/unit/services constraint violated)")
	ErrUnknownGroup   = errors.New("scim group not found")
	ErrUnknownUnit    = errors.New("unit not found")
)

// MappingService owns the rules that map SCIM-group memberships to QuokkaQ
// grants. Recompute is triggered separately (recompute_service.go).
type MappingService struct {
	repo       *repository.MappingRepo
	groupRepo  *repository.GroupRepo
	unitsCheck UnitExistenceChecker  // adapter for `units` table
	enqueueRec func(ctx context.Context, companyID uuid.UUID, scimGroupID uuid.UUID) error
}

// UnitExistenceChecker — adapter over existing internal/units repo.
type UnitExistenceChecker interface {
	UnitExists(ctx context.Context, companyID, unitID uuid.UUID) (bool, error)
}

type CreateMappingInput struct {
	CompanyID   uuid.UUID
	ScimGroupID uuid.UUID
	RoleCode    string
	UnitID      *uuid.UUID
	ServiceIDs  []uuid.UUID
	CreatedBy   uuid.UUID
}

func (s *MappingService) Create(ctx context.Context, in CreateMappingInput) (*repository.SCIMGroupMapping, error) {
	if err := validateMappingShape(in.RoleCode, in.UnitID, in.ServiceIDs); err != nil {
		return nil, err
	}
	if _, err := s.groupRepo.FindByID(ctx, in.CompanyID, in.ScimGroupID); err != nil {
		return nil, ErrUnknownGroup
	}
	if in.UnitID != nil {
		ok, err := s.unitsCheck.UnitExists(ctx, in.CompanyID, *in.UnitID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrUnknownUnit
		}
	}
	m := &repository.SCIMGroupMapping{
		CompanyID:   in.CompanyID,
		ScimGroupID: in.ScimGroupID,
		RoleCode:    in.RoleCode,
		UnitID:      in.UnitID,
		ServiceIDs:  toPQUUIDArray(in.ServiceIDs),
		IsActive:    true,
		CreatedBy:   &in.CreatedBy,
	}
	if err := s.repo.Create(ctx, m); err != nil {
		return nil, err
	}
	if s.enqueueRec != nil {
		_ = s.enqueueRec(ctx, in.CompanyID, in.ScimGroupID)
	}
	return m, nil
}

// Update / Delete / SetActive analogous — each enqueues recompute for
// affected scim_group_id.

func validateMappingShape(role string, unitID *uuid.UUID, services []uuid.UUID) error {
	switch role {
	case "tenant_admin":
		if unitID != nil || len(services) > 0 {
			return ErrInvalidMapping
		}
	case "unit_manager":
		if unitID == nil || len(services) > 0 {
			return ErrInvalidMapping
		}
	case "operator":
		if unitID == nil {
			return ErrInvalidMapping
		}
		// services empty = "all services in unit" — allowed
	default:
		return ErrInvalidMapping
	}
	return nil
}
```

- [ ] **Step 4.2: Tests for the validation matrix**

```go
func TestValidateMappingShape(t *testing.T) {
	unit := uuid.New()
	services := []uuid.UUID{uuid.New()}
	cases := []struct {
		name    string
		role    string
		unitID  *uuid.UUID
		svcs    []uuid.UUID
		wantErr bool
	}{
		{"tenant_admin no unit no svcs", "tenant_admin", nil, nil, false},
		{"tenant_admin with unit", "tenant_admin", &unit, nil, true},
		{"tenant_admin with svcs", "tenant_admin", nil, services, true},
		{"unit_manager with unit", "unit_manager", &unit, nil, false},
		{"unit_manager no unit", "unit_manager", nil, nil, true},
		{"unit_manager with svcs", "unit_manager", &unit, services, true},
		{"operator with unit + svcs", "operator", &unit, services, false},
		{"operator with unit, no svcs", "operator", &unit, nil, false},
		{"operator no unit", "operator", nil, services, true},
		{"unknown role", "viewer", &unit, nil, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateMappingShape(c.role, c.unitID, c.svcs)
			if c.wantErr {
				require.ErrorIs(t, err, ErrInvalidMapping)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
```

- [ ] **Step 4.3: Audit log writes**

Add `s.audit.Write(ctx, "scim.mapping.changed", ...)` after each Create / Update / Delete via the existing `audit_log_repo`. Use `middleware.AuditActor(ctx)` for `actor_type='scim'` (when called from SCIM endpoint) or `actor_type='user'` (when called from admin mgmt API — Phase 2.H).

- [ ] **Step 4.4: Commit**

```bash
git add apps/backend/internal/scim/service/mapping_service.go apps/backend/internal/scim/service/mapping_service_test.go
git commit -m "feat(scim): add mapping service with validation matrix and audit"
```

---

## Phase 2.C — Recompute service

The recompute service is the heart of Plan 2: given a `user_id`, compute the **desired** set of role assignments from current group memberships + active mappings, diff against the **current** SCIM-source assignments, and apply add/remove atomically.

Idempotent — running it twice in a row produces no changes. Concurrent runs for the same user are deduplicated at the Asynq queue level (newer enqueue replaces older pending one with the same key).

### Task 5 — Role-assignment repository (source-aware)

**Files:**
- Create: `apps/backend/internal/scim/repository/role_assignment_repo.go`
- Create: `apps/backend/internal/scim/repository/role_assignment_repo_integration_test.go`

The repo wraps the existing `user_role_assignments` table. Plan 1 didn't touch it; here we add the `source` column write/read.

- [ ] **Step 5.1: Define model**

Append to `models.go`:
```go
type UserRoleAssignment struct {
	ID         uuid.UUID    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	CompanyID  uuid.UUID    `gorm:"type:uuid;not null"`
	UserID     uuid.UUID    `gorm:"type:uuid;not null"`
	RoleCode   string       `gorm:"type:varchar(64);not null"`
	UnitID     *uuid.UUID   `gorm:"type:uuid"`
	ServiceIDs pq.UUIDArray `gorm:"type:uuid[]"`
	Source     string       `gorm:"type:varchar(16);not null;default:'manual'"` // 'manual' | 'scim'
	CreatedAt  time.Time    `gorm:"not null;default:now()"`
	UpdatedAt  time.Time    `gorm:"not null;default:now()"`
}

func (UserRoleAssignment) TableName() string { return "user_role_assignments" }
```

- [ ] **Step 5.2: Test (integration)**

```go
//go:build integration

func TestRoleAssignmentRepo_FilterBySource(t *testing.T) {
	db := openTestDB(t)
	repo := NewRoleAssignmentRepo(db)
	ctx := context.Background()

	co := ensureCompany(t, db)
	uid := ensureUser(t, db, co, "x@y", "", true)
	defer cleanupCompany(t, db, co)

	// Two manual + one scim
	require.NoError(t, repo.Insert(ctx, &UserRoleAssignment{
		CompanyID: co, UserID: uid, RoleCode: "operator", Source: "manual",
	}))
	require.NoError(t, repo.Insert(ctx, &UserRoleAssignment{
		CompanyID: co, UserID: uid, RoleCode: "unit_manager", Source: "manual",
	}))
	require.NoError(t, repo.Insert(ctx, &UserRoleAssignment{
		CompanyID: co, UserID: uid, RoleCode: "operator", Source: "scim",
	}))

	scim, err := repo.ListBySource(ctx, uid, "scim")
	require.NoError(t, err)
	require.Len(t, scim, 1)

	manual, err := repo.ListBySource(ctx, uid, "manual")
	require.NoError(t, err)
	require.Len(t, manual, 2)

	// ReplaceForSource removes only scim, leaves manual
	require.NoError(t, repo.ReplaceForSource(ctx, uid, "scim", []*UserRoleAssignment{
		{CompanyID: co, UserID: uid, RoleCode: "tenant_admin", Source: "scim"},
	}))

	scim, _ = repo.ListBySource(ctx, uid, "scim")
	require.Len(t, scim, 1)
	require.Equal(t, "tenant_admin", scim[0].RoleCode)

	manual, _ = repo.ListBySource(ctx, uid, "manual")
	require.Len(t, manual, 2, "manual grants must be preserved")
}
```

- [ ] **Step 5.3: Implement**

`role_assignment_repo.go`:
```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RoleAssignmentRepo struct{ db *gorm.DB }

func NewRoleAssignmentRepo(db *gorm.DB) *RoleAssignmentRepo {
	return &RoleAssignmentRepo{db: db}
}

func (r *RoleAssignmentRepo) Insert(ctx context.Context, a *UserRoleAssignment) error {
	return r.db.WithContext(ctx).Create(a).Error
}

func (r *RoleAssignmentRepo) ListBySource(ctx context.Context, userID uuid.UUID, source string) ([]UserRoleAssignment, error) {
	var rows []UserRoleAssignment
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND source = ?", userID, source).
		Find(&rows).Error
	return rows, err
}

// ReplaceForSource atomically replaces all assignments of the given source
// for one user. Other-source assignments are preserved (Layered authority
// model — spec §4.1).
func (r *RoleAssignmentRepo) ReplaceForSource(ctx context.Context, userID uuid.UUID, source string, desired []*UserRoleAssignment) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND source = ?", userID, source).
			Delete(&UserRoleAssignment{}).Error; err != nil {
			return err
		}
		if len(desired) == 0 {
			return nil
		}
		return tx.Create(desired).Error
	})
}
```

- [ ] **Step 5.4: Run, commit**

```bash
cd apps/backend && DATABASE_URL_TEST=$DATABASE_URL go test -tags integration ./internal/scim/repository/ -v
git add apps/backend/internal/scim/repository/role_assignment_repo.go apps/backend/internal/scim/repository/role_assignment_repo_integration_test.go apps/backend/internal/scim/repository/models.go
git commit -m "feat(scim): add source-aware role assignment repository"
```

### Task 6 — Recompute service (pure logic + role precedence)

**Files:**
- Create: `apps/backend/internal/scim/service/recompute_service.go`
- Create: `apps/backend/internal/scim/service/recompute_service_test.go`

The pure algorithm is decoupled from DB so it can be unit-tested table-driven without integration plumbing.

- [ ] **Step 6.1: Test the pure algorithm**

`recompute_service_test.go`:
```go
package service

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/quokkaq/backend/internal/scim/repository"
)

// computeDesiredGrants is exposed for testing (lowercase if you prefer
// private — then this test file goes in the same package).
func TestComputeDesiredGrants_NoMappings_NoGrants(t *testing.T) {
	got := computeDesiredGrants(nil)
	require.Empty(t, got)
}

func TestComputeDesiredGrants_MultipleGroupsUnion(t *testing.T) {
	unit := uuid.New()
	svc1, svc2 := uuid.New(), uuid.New()

	mappings := []repository.SCIMGroupMapping{
		{RoleCode: "operator", UnitID: &unit, ServiceIDs: []uuid.UUID{svc1}, IsActive: true},
		{RoleCode: "operator", UnitID: &unit, ServiceIDs: []uuid.UUID{svc2}, IsActive: true},
	}
	got := computeDesiredGrants(mappings)
	require.Len(t, got, 1)
	require.ElementsMatch(t, []uuid.UUID{svc1, svc2}, got[0].ServiceIDs)
}

func TestComputeDesiredGrants_RolePrecedence(t *testing.T) {
	unit := uuid.New()
	mappings := []repository.SCIMGroupMapping{
		{RoleCode: "operator", UnitID: &unit, IsActive: true},
		{RoleCode: "unit_manager", UnitID: &unit, IsActive: true},
	}
	got := computeDesiredGrants(mappings)
	// Both kept (audit trail), but conflict-resolution metadata says manager wins
	require.Len(t, got, 2)
	// ... add precedence assertion via a flag or via the service-level diff test
}

func TestComputeDesiredGrants_TenantAdminFromOneGroup(t *testing.T) {
	mappings := []repository.SCIMGroupMapping{
		{RoleCode: "tenant_admin", IsActive: true},
		{RoleCode: "operator", UnitID: ptrUUID(), IsActive: true},
	}
	got := computeDesiredGrants(mappings)
	// tenant_admin row + operator row — both stored; precedence at enforcement layer.
	require.Len(t, got, 2)
}

func TestComputeDesiredGrants_InactiveMappingsIgnored(t *testing.T) {
	unit := uuid.New()
	mappings := []repository.SCIMGroupMapping{
		{RoleCode: "operator", UnitID: &unit, IsActive: false},
	}
	require.Empty(t, computeDesiredGrants(mappings))
}

func ptrUUID() *uuid.UUID { id := uuid.New(); return &id }
```

- [ ] **Step 6.2: Implement the pure algorithm**

`recompute_service.go`:
```go
package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/quokkaq/backend/internal/scim/repository"
)

// DesiredGrant is the (role, unit) tuple plus union'd service ids.
// Multiple grants for the same (role, unit) collapse into one row with
// the union of service_ids.
type DesiredGrant struct {
	RoleCode   string
	UnitID     *uuid.UUID
	ServiceIDs []uuid.UUID
}

// computeDesiredGrants implements step 3 of spec §4.3:
// collapse by (role, unit), union service_ids, drop inactive.
// Conflict resolution (tenant_admin > unit_manager > operator) is NOT applied
// here — both rows are persisted for clean reversal on group removal. The
// permission-enforcement layer applies precedence at lookup time.
func computeDesiredGrants(mappings []repository.SCIMGroupMapping) []DesiredGrant {
	type key struct {
		role string
		unit string // serialized uuid or "" for nil
	}
	bag := map[key]map[uuid.UUID]struct{}{}
	for _, m := range mappings {
		if !m.IsActive {
			continue
		}
		k := key{role: m.RoleCode}
		if m.UnitID != nil {
			k.unit = m.UnitID.String()
		}
		set, ok := bag[k]
		if !ok {
			set = map[uuid.UUID]struct{}{}
			bag[k] = set
		}
		for _, sid := range m.ServiceIDs {
			set[sid] = struct{}{}
		}
	}
	out := make([]DesiredGrant, 0, len(bag))
	for k, set := range bag {
		g := DesiredGrant{RoleCode: k.role}
		if k.unit != "" {
			id, _ := uuid.Parse(k.unit)
			g.UnitID = &id
		}
		for sid := range set {
			g.ServiceIDs = append(g.ServiceIDs, sid)
		}
		out = append(out, g)
	}
	return out
}

// RecomputeService glues mappings + role-assignments and writes the diff.
type RecomputeService struct {
	mappingRepo *repository.MappingRepo
	groupRepo   *repository.GroupRepo
	userGroups  UserGroupReader
	roleRepo    *repository.RoleAssignmentRepo
	audit       AuditWriter // adapter over existing audit_log_repo
}

// UserGroupReader returns SCIM-group memberships for a user.
type UserGroupReader interface {
	GroupsOfUser(ctx context.Context, companyID, userID uuid.UUID) ([]uuid.UUID, error)
}

// AuditWriter is the slice of internal/audit_log_repo this service needs.
type AuditWriter interface {
	Write(ctx context.Context, eventType string, payload any) error
}

// RecomputeUserGrants is the algorithm spec §4.3 — returns the diff size
// for metrics / observability.
func (s *RecomputeService) RecomputeUserGrants(ctx context.Context, companyID, userID uuid.UUID) (added, removed int, err error) {
	// 1. Groups
	groupIDs, err := s.userGroups.GroupsOfUser(ctx, companyID, userID)
	if err != nil {
		return 0, 0, err
	}

	// 2. Active mappings of those groups
	var mappings []repository.SCIMGroupMapping
	for _, gid := range groupIDs {
		ms, err := s.mappingRepo.ListByGroup(ctx, companyID, gid)
		if err != nil {
			return 0, 0, err
		}
		mappings = append(mappings, ms...)
	}

	// 3. Compute desired
	desired := computeDesiredGrants(mappings)

	// 4. Build target rows and current snapshot
	target := make([]*repository.UserRoleAssignment, 0, len(desired))
	for _, d := range desired {
		target = append(target, &repository.UserRoleAssignment{
			CompanyID:  companyID,
			UserID:     userID,
			RoleCode:   d.RoleCode,
			UnitID:     d.UnitID,
			ServiceIDs: toPQUUIDArray(d.ServiceIDs),
			Source:     "scim",
		})
	}
	current, err := s.roleRepo.ListBySource(ctx, userID, "scim")
	if err != nil {
		return 0, 0, err
	}

	// 5. Replace atomically
	if err := s.roleRepo.ReplaceForSource(ctx, userID, "scim", target); err != nil {
		return 0, 0, err
	}

	added, removed = diffSize(current, target)

	// 6. Audit (only if change)
	if added+removed > 0 {
		_ = s.audit.Write(ctx, "scim.user.grants_recomputed", map[string]any{
			"user_id":   userID,
			"added":     added,
			"removed":   removed,
		})
	}
	return added, removed, nil
}

func diffSize(current []repository.UserRoleAssignment, target []*repository.UserRoleAssignment) (added, removed int) {
	// Pragmatic: ReplaceForSource always deletes + inserts, so absolute counts.
	// More precise diffing is possible but not required for metrics.
	added = len(target)
	removed = len(current)
	return
}
```

- [ ] **Step 6.3: Run, commit**

```bash
cd apps/backend && go test ./internal/scim/service/ -v
git add apps/backend/internal/scim/service/recompute_service.go apps/backend/internal/scim/service/recompute_service_test.go
git commit -m "feat(scim): add recompute service (mapping → grants diff)"
```

### Task 7 — Asynq job `scim.recompute_user_grants`

**Files:**
- Create: `apps/backend/internal/scim/jobs/recompute_user_grants.go`
- Create: `apps/backend/internal/scim/jobs/recompute_user_grants_test.go`

- [ ] **Step 7.1: Define payload + handler**

`recompute_user_grants.go`:
```go
// Package jobs holds Asynq task definitions for SCIM async work.
//
// Conventions:
//   - Task type names are prefixed with the package: scim.<verb>_<noun>
//   - Payloads are JSON, defined as exported structs in this file
//   - Handlers are pure functions; they fetch the service via a closure on
//     registration in cmd/api/main.go
package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/quokkaq/backend/internal/scim/service"
)

const TaskRecomputeUserGrants = "scim.recompute_user_grants"

type RecomputeUserGrantsPayload struct {
	CompanyID uuid.UUID `json:"company_id"`
	UserID    uuid.UUID `json:"user_id"`
}

// NewRecomputeUserGrantsTask builds a unique-keyed task — concurrent enqueues
// for the same user collapse to one (newer wins).
func NewRecomputeUserGrantsTask(p RecomputeUserGrantsPayload) (*asynq.Task, error) {
	body, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(
		TaskRecomputeUserGrants,
		body,
		asynq.Unique(asynq.UniqueOpt{TTL: time.Minute}),
		asynq.MaxRetry(5),
		asynq.Timeout(30 * time.Second),
	), nil
}

// HandleRecomputeUserGrants is registered with the Asynq mux in main.go.
func HandleRecomputeUserGrants(svc *service.RecomputeService) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var p RecomputeUserGrantsPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("unmarshal payload: %w: %w", asynq.SkipRetry, err)
		}
		_, _, err := svc.RecomputeUserGrants(ctx, p.CompanyID, p.UserID)
		return err
	}
}
```

(The exact `asynq.Unique` import shape may differ slightly — verify against the version pinned in `go.mod`.)

- [ ] **Step 7.2: Test (with miniredis-backed asynq client + in-process handler)**

```go
func TestRecomputeUserGrantsJob_HappyPath(t *testing.T) {
	mr := miniredis.RunT(t)
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	defer client.Close()

	companyID, userID := uuid.New(), uuid.New()
	task, err := NewRecomputeUserGrantsTask(RecomputeUserGrantsPayload{
		CompanyID: companyID, UserID: userID,
	})
	require.NoError(t, err)
	info, err := client.Enqueue(task)
	require.NoError(t, err)
	require.Equal(t, "scim.recompute_user_grants", info.Type)
}

func TestNewRecomputeUserGrantsTask_DedupesByUser(t *testing.T) {
	// Enqueueing twice for the same user within UniqueOpt.TTL should error or no-op.
	mr := miniredis.RunT(t)
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	defer client.Close()

	uid := uuid.New()
	t1, _ := NewRecomputeUserGrantsTask(RecomputeUserGrantsPayload{UserID: uid})
	t2, _ := NewRecomputeUserGrantsTask(RecomputeUserGrantsPayload{UserID: uid})

	_, err := client.Enqueue(t1)
	require.NoError(t, err)
	_, err = client.Enqueue(t2)
	require.ErrorIs(t, err, asynq.ErrDuplicateTask)
}
```

(Note: `asynq.Unique` keys on the marshaled payload; if you need per-user dedup with the company changing, structure the unique key. For Plan 2 simplicity, assume one IdP per tenant so payload uniqueness == user uniqueness.)

- [ ] **Step 7.3: Commit**

```bash
git add apps/backend/internal/scim/jobs/recompute_user_grants.go apps/backend/internal/scim/jobs/recompute_user_grants_test.go
git commit -m "feat(scim): add Asynq task for recompute_user_grants"
```

### Task 8 — Bulk recompute job (for mapping changes / group deletes)

**Files:**
- Create: `apps/backend/internal/scim/jobs/recompute_group_members.go`
- Create: `apps/backend/internal/scim/jobs/recompute_group_members_test.go`

When admin saves a mapping or a group is deleted, every member of that group needs recompute. We could enqueue per-user tasks directly, but for groups with thousands of members we want one bulk task that itself fans out at controlled rate.

- [ ] **Step 8.1: Implement bulk job**

```go
const TaskRecomputeGroupMembers = "scim.recompute_group_members"

type RecomputeGroupMembersPayload struct {
	CompanyID uuid.UUID `json:"company_id"`
	GroupID   uuid.UUID `json:"group_id"`
}

func NewRecomputeGroupMembersTask(p RecomputeGroupMembersPayload) (*asynq.Task, error) {
	body, _ := json.Marshal(p)
	return asynq.NewTask(
		TaskRecomputeGroupMembers,
		body,
		asynq.Unique(asynq.UniqueOpt{TTL: 5 * time.Minute}),
		asynq.MaxRetry(3),
		asynq.Timeout(5 * time.Minute),
	), nil
}

// HandleRecomputeGroupMembers fans out per-user recompute at 100 users/sec
// (spec §5.9 — async batched 100/sec via Asynq rate limit).
func HandleRecomputeGroupMembers(groupRepo *repository.GroupRepo, client *asynq.Client) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var p RecomputeGroupMembersPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("%w: %w", asynq.SkipRetry, err)
		}
		members, err := groupRepo.ListMembers(ctx, p.CompanyID, p.GroupID)
		if err != nil {
			return err
		}
		ticker := time.NewTicker(10 * time.Millisecond) // 100/sec
		defer ticker.Stop()
		for _, uid := range members {
			<-ticker.C
			task, _ := NewRecomputeUserGrantsTask(RecomputeUserGrantsPayload{
				CompanyID: p.CompanyID, UserID: uid,
			})
			if _, err := client.EnqueueContext(ctx, task); err != nil &&
				!errors.Is(err, asynq.ErrDuplicateTask) {
				return err
			}
		}
		return nil
	}
}
```

- [ ] **Step 8.2: Tests + commit**

```bash
git add apps/backend/internal/scim/jobs/recompute_group_members.go apps/backend/internal/scim/jobs/recompute_group_members_test.go
git commit -m "feat(scim): add bulk recompute job (fan out at 100 users/sec)"
```

## Phase 2.D — Recompute triggers

Wire recompute calls into the SCIM endpoints (Plan 1 left `// TODO recompute` markers in `GroupService.AddMembers / RemoveMembers / ReplaceMembers`).

### Task 9 — Inject `EnqueueRecompute` into Plan 1 group service

**Files:**
- Modify: `apps/backend/internal/scim/service/group_service.go`

- [ ] **Step 9.1: Add enqueue function field + wiring**

Add to `GroupService`:
```go
type GroupService struct {
	repo               *repository.GroupRepo
	userRepo           *repository.UserRepo
	enqueueRecompute   func(ctx context.Context, companyID, userID uuid.UUID) error
	enqueueGroupBulk   func(ctx context.Context, companyID, groupID uuid.UUID) error
}

// NewGroupService accepts both enqueuers. They may be nil for tests.
func NewGroupService(
	repo *repository.GroupRepo,
	userRepo *repository.UserRepo,
	enqueueUser func(context.Context, uuid.UUID, uuid.UUID) error,
	enqueueGroupBulk func(context.Context, uuid.UUID, uuid.UUID) error,
) *GroupService {
	if enqueueUser == nil {
		enqueueUser = func(_ context.Context, _, _ uuid.UUID) error { return nil }
	}
	if enqueueGroupBulk == nil {
		enqueueGroupBulk = func(_ context.Context, _, _ uuid.UUID) error { return nil }
	}
	return &GroupService{repo: repo, userRepo: userRepo, enqueueRecompute: enqueueUser, enqueueGroupBulk: enqueueGroupBulk}
}
```

In each member-mutation path call the appropriate enqueuer:
- `AddMembers` per-user (≤10 sync, otherwise bulk — see spec §4.4)
- `RemoveMembers` per-user (≤10 sync, otherwise bulk)
- `ReplaceMembers` always bulk
- `Delete (group)` always bulk

For `≤10 sync` we **call** `RecomputeUserGrants` directly (synchronous, fast); for bulk we **enqueue** the bulk job.

```go
const SyncRecomputeThreshold = 10

func (s *GroupService) AddMembers(ctx context.Context, companyID, groupID uuid.UUID, ids []uuid.UUID) error {
	if err := s.repo.AddMembers(ctx, companyID, groupID, ids); err != nil {
		return err
	}
	if len(ids) <= SyncRecomputeThreshold {
		for _, uid := range ids {
			if err := s.enqueueRecompute(ctx, companyID, uid); err != nil {
				return err
			}
		}
		return nil
	}
	return s.enqueueGroupBulk(ctx, companyID, groupID)
}
// (RemoveMembers / ReplaceMembers / Delete — same pattern.)
```

Note: `enqueueRecompute` here is named "enqueue" but for ≤10 it should run sync (call the recompute service directly, no Asynq). To keep the interface simple, the Plan 1 wiring in `cmd/api/main.go` uses a single function that decides sync vs async:

```go
// In cmd/api/main.go:
recomputeFn := func(ctx context.Context, companyID, userID uuid.UUID) error {
	_, _, err := recomputeService.RecomputeUserGrants(ctx, companyID, userID)
	return err
}
groupService := service.NewGroupService(groupRepo, userRepo, recomputeFn, bulkEnqueueFn)
```

- [ ] **Step 9.2: Test the threshold logic**

```go
func TestGroupService_AddMembers_SyncBelowThreshold(t *testing.T) {
	var perUserCalls int
	var bulkCalls int
	enqUser := func(_ context.Context, _, _ uuid.UUID) error { perUserCalls++; return nil }
	enqBulk := func(_ context.Context, _, _ uuid.UUID) error { bulkCalls++; return nil }

	svc := NewGroupService(/*repo*/nil, /*userRepo*/nil, enqUser, enqBulk)
	ids := make([]uuid.UUID, 5)
	for i := range ids { ids[i] = uuid.New() }
	// (Need to stub repo.AddMembers — extract repo to interface for test.)
	_ = svc.AddMembers(context.Background(), uuid.New(), uuid.New(), ids)
	require.Equal(t, 5, perUserCalls)
	require.Equal(t, 0, bulkCalls)
}

func TestGroupService_AddMembers_BulkAboveThreshold(t *testing.T) { /* analogous */ }
```

(Refactor `GroupService.repo` to an interface to enable stubbing — small change.)

- [ ] **Step 9.3: Commit**

```bash
cd apps/backend && go test ./internal/scim/service/ -v
git add apps/backend/internal/scim/service/group_service.go apps/backend/internal/scim/service/group_service_test.go
git commit -m "feat(scim): wire recompute triggers into group membership ops"
```

### Task 10 — Recompute trigger on mapping change (Phase 2.B `MappingService`)

**Files:**
- Modify: `apps/backend/internal/scim/service/mapping_service.go`

- [ ] **Step 10.1: After Create / Update / Delete / SetActive, enqueue bulk recompute for the affected `scim_group_id`**

The `enqueueRec` field on `MappingService` was added in Task 4 (Phase 2.B). Now it actually does something: enqueue `scim.recompute_group_members` task with the affected `(companyID, scimGroupID)`.

```go
// In NewMappingService — accept the bulk-enqueue function.
func NewMappingService(repo *repository.MappingRepo, groupRepo *repository.GroupRepo, units UnitExistenceChecker, audit AuditWriter, enqBulk func(ctx context.Context, companyID, groupID uuid.UUID) error) *MappingService {
	return &MappingService{repo: repo, groupRepo: groupRepo, unitsCheck: units, audit: audit, enqueueRec: enqBulk}
}
```

- [ ] **Step 10.2: Test that Create/Update/Delete each enqueue once**

```go
func TestMappingService_Create_EnqueuesBulkRecompute(t *testing.T) {
	var enqueued []uuid.UUID
	enq := func(_ context.Context, _ uuid.UUID, gid uuid.UUID) error {
		enqueued = append(enqueued, gid)
		return nil
	}
	// stub repos returning success...
	svc := NewMappingService(/*repo*/stubRepo, /*groupRepo*/stubGroupRepo, /*units*/stubUnits, /*audit*/&fakeAudit{}, enq)
	groupID := uuid.New()
	_, err := svc.Create(context.Background(), CreateMappingInput{
		CompanyID: uuid.New(), ScimGroupID: groupID, RoleCode: "tenant_admin",
	})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{groupID}, enqueued)
}
```

- [ ] **Step 10.3: Commit**

```bash
git commit -am "feat(scim): trigger bulk recompute on mapping changes"
```

### Task 11 — Cascade on unit/service deletion

**Files:**
- Modify: `apps/backend/internal/units/service.go` (or wherever existing units `Delete` lives) — emit `unit.deleted` event
- Modify: `apps/backend/internal/scim/service/mapping_service.go` — subscribe to `unit.deleted`, call `MappingRepo.DeactivateByUnit`, enqueue recompute for affected groups

Mechanics depend on whether the project has a domain event bus or just direct service calls. For Plan 2:

- [ ] **Step 11.1: Add `OnUnitDeleted(ctx, unitID)` method to MappingService**

```go
// OnUnitDeleted is invoked by internal/units when a unit is soft-deleted.
// Marks all mappings → that unit as inactive and enqueues recompute for
// every affected group's members.
func (s *MappingService) OnUnitDeleted(ctx context.Context, companyID, unitID uuid.UUID) error {
	mappingIDs, err := s.repo.DeactivateByUnit(ctx, unitID)
	if err != nil {
		return err
	}
	if len(mappingIDs) == 0 {
		return nil
	}
	// Get distinct group IDs from these mappings → enqueue bulk per group.
	groupIDs, err := s.repo.GroupIDsByMappingIDs(ctx, mappingIDs) // add this method
	if err != nil {
		return err
	}
	for _, gid := range groupIDs {
		if err := s.enqueueRec(ctx, companyID, gid); err != nil {
			return err
		}
	}
	_ = s.audit.Write(ctx, "scim.mapping.deactivated_on_unit_delete", map[string]any{
		"unit_id": unitID, "mappings_affected": len(mappingIDs),
	})
	return nil
}
```

- [ ] **Step 11.2: Wire into `internal/units.Service.Delete`**

After existing `Delete` succeeds:
```go
if s.scimMappingHook != nil {
	_ = s.scimMappingHook.OnUnitDeleted(ctx, companyID, unitID)
}
```

The `scimMappingHook` field is optional — if `internal/scim` is disabled at runtime (env flag false), pass nil.

- [ ] **Step 11.3: Test + commit**

```bash
git commit -am "feat(scim): cascade mapping deactivation on unit deletion"
```

---

## Phase 2.E — PII anonymization

### Task 12 — `anonymize_user` Asynq job

**Files:**
- Create: `apps/backend/internal/scim/service/anonymization_service.go`
- Create: `apps/backend/internal/scim/jobs/anonymize_user.go`
- Create: `apps/backend/internal/scim/jobs/anonymize_user_test.go`

- [ ] **Step 12.1: Implement the anonymization function**

`anonymization_service.go`:
```go
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// AnonymizationService scrubs PII for users past their retention period.
// Always operates on already-deactivated users — call sites verify this.
type AnonymizationService struct {
	users  UserAnonymizer  // adapter over internal/users
	audit  AuditWriter
}

// UserAnonymizer is the slice of internal/users.Service that performs the
// destructive write. Implementation handles cascade to derived tables.
type UserAnonymizer interface {
	AnonymizePIIByID(ctx context.Context, userID uuid.UUID) (originalEmail, originalFullName string, err error)
}

func (s *AnonymizationService) AnonymizeUser(ctx context.Context, userID uuid.UUID) error {
	email, name, err := s.users.AnonymizePIIByID(ctx, userID)
	if err != nil {
		return err
	}
	_ = s.audit.Write(ctx, "scim.user.anonymized", map[string]any{
		"user_id":     userID,
		"email_hash":  hashShort(email),
		"name_hash":   hashShort(name),
		"anonymized":  time.Now().UTC().Format(time.RFC3339),
	})
	return nil
}

func hashShort(s string) string {
	if s == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(strings.ToLower(s)))
	return hex.EncodeToString(sum[:])[:12]
}
```

The actual destructive update (in `internal/users.Service.AnonymizePIIByID`) does, atomically:
```sql
UPDATE users SET
    email = 'anon-' || substr(md5(random()::text), 1, 8) || '@deleted.local',
    first_name = NULL,
    last_name = NULL,
    middle_name = NULL,
    phone = NULL,
    employee_id = NULL,
    scim_external_id = NULL,
    scim_metadata = jsonb_build_object('source', 'scim', 'anonymized_at', now()::text),
    pii_anonymized_at = now()
WHERE id = ?;
```

(Engineer adds the corresponding migration / SQL or uses GORM's `Updates()`.)

- [ ] **Step 12.2: Asynq job wrapper**

`anonymize_user.go`:
```go
const TaskAnonymizeUser = "pii.anonymize_user"

type AnonymizeUserPayload struct {
	UserID uuid.UUID `json:"user_id"`
}

func NewAnonymizeUserTask(p AnonymizeUserPayload) (*asynq.Task, error) {
	body, _ := json.Marshal(p)
	return asynq.NewTask(
		TaskAnonymizeUser, body,
		asynq.Unique(asynq.UniqueOpt{TTL: time.Hour}),
		asynq.MaxRetry(3),
	), nil
}

func HandleAnonymizeUser(svc *service.AnonymizationService) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var p AnonymizeUserPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("%w: %w", asynq.SkipRetry, err)
		}
		return svc.AnonymizeUser(ctx, p.UserID)
	}
}
```

- [ ] **Step 12.3: Test + commit**

```bash
git add apps/backend/internal/scim/service/anonymization_service.go apps/backend/internal/scim/jobs/anonymize_user.go apps/backend/internal/scim/jobs/anonymize_user_test.go
git commit -m "feat(scim): add anonymize_user job and service"
```

### Task 13 — Daily scheduler `pii.anonymize_users_due`

**Files:**
- Create: `apps/backend/internal/scim/jobs/anonymize_users_due.go`
- Create: `apps/backend/internal/scim/service/anonymization_due_service.go`

- [ ] **Step 13.1: Daily-fire Asynq task**

`anonymize_users_due.go`:
```go
const TaskAnonymizeUsersDue = "pii.anonymize_users_due"

func NewAnonymizeUsersDueTask() *asynq.Task {
	return asynq.NewTask(TaskAnonymizeUsersDue, nil)
}

func HandleAnonymizeUsersDue(svc *service.AnonymizationDueService, client *asynq.Client) asynq.HandlerFunc {
	return func(ctx context.Context, _ *asynq.Task) error {
		// Stream users due for anonymization, one query per tenant.
		// (See AnonymizationDueService.ListDueUsers.)
		due, err := svc.ListDueUsers(ctx)
		if err != nil {
			return err
		}
		for _, uid := range due {
			task, _ := NewAnonymizeUserTask(AnonymizeUserPayload{UserID: uid})
			_, _ = client.EnqueueContext(ctx, task)
		}
		return nil
	}
}
```

- [ ] **Step 13.2: `ListDueUsers` query**

`anonymization_due_service.go`:
```go
// ListDueUsers selects users whose retention has elapsed.
// Honors per-tenant retention_days from scim_tenant_settings (-1 = never).
func (s *AnonymizationDueService) ListDueUsers(ctx context.Context) ([]uuid.UUID, error) {
	const q = `
		SELECT u.id
		FROM users u
		JOIN scim_tenant_settings t ON t.company_id = u.company_id
		WHERE u.deactivated_at IS NOT NULL
		  AND u.pii_anonymized_at IS NULL
		  AND t.retention_days > 0
		  AND u.deactivated_at < now() - (t.retention_days || ' days')::interval
	`
	var ids []uuid.UUID
	if err := s.db.WithContext(ctx).Raw(q).Scan(&ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}
```

- [ ] **Step 13.3: Schedule via Asynq Periodic**

In `cmd/api/main.go`:
```go
scheduler := asynq.NewScheduler(asynq.RedisClientOpt{...}, nil)
_, err := scheduler.Register("@daily", jobs.NewAnonymizeUsersDueTask())
// also "0 7 * * *" if you want a fixed UTC time.
```

- [ ] **Step 13.4: Test + commit**

```bash
git commit -am "feat(scim): add daily PII anonymization scheduler"
```

### Task 14 — Verify retention `never` behaviour

- [ ] **Step 14.1: Test**

```go
func TestListDueUsers_RetentionNever_NotIncluded(t *testing.T) {
	// Seed a tenant with retention_days = -1 and a user deactivated 5 years ago.
	// ListDueUsers must NOT return that user.
}
```

Confirms the `t.retention_days > 0` guard works.

- [ ] **Step 14.2: Commit**

```bash
git commit -am "test(scim): verify retention=never excludes users from anonymization"
```

---

## Phase 2.F — Token rotation grace-period finalize

### Task 15 — `scim.token_rotation_finalize` daily cron

**Files:**
- Create: `apps/backend/internal/scim/jobs/token_rotation_finalize.go`

- [ ] **Step 15.1: Implement**

```go
const TaskTokenRotationFinalize = "scim.token_rotation_finalize"

func NewTokenRotationFinalizeTask() *asynq.Task {
	return asynq.NewTask(TaskTokenRotationFinalize, nil)
}

func HandleTokenRotationFinalize(repo *repository.TokenRepo) asynq.HandlerFunc {
	return func(ctx context.Context, _ *asynq.Task) error {
		// Find tokens in pending_revocation older than 24h.
		const graceHours = 24
		const q = `
			SELECT id FROM scim_provisioning_tokens
			WHERE status = 'pending_revocation'
			  AND created_at < now() - interval '%d hours'
		`
		var ids []uuid.UUID
		if err := repo.DB().Raw(fmt.Sprintf(q, graceHours)).Scan(&ids).Error; err != nil {
			return err
		}
		for _, id := range ids {
			_ = repo.Revoke(ctx, id, nil)
		}
		return nil
	}
}
```

(Add a `DB()` accessor to `TokenRepo` for raw queries — or extract a query method.)

- [ ] **Step 15.2: Schedule hourly (more granular than daily so 24h-since-rotation is approximate ±1h)**

```go
scheduler.Register("0 * * * *", jobs.NewTokenRotationFinalizeTask())
```

- [ ] **Step 15.3: Test + commit**

```bash
git commit -am "feat(scim): finalize token rotation 24h after pending_revocation"
```

---

## Phase 2.G — JIT-SSO integration

The auth code in `internal/auth/` currently does JIT user creation by email. Plan 2 makes it SCIM-aware:
1. First match by `scim_external_id` against the SSO `sub` claim
2. Fallback by `email`, linking `sub → scim_external_id` if user found and currently has nil
3. Honor per-tenant `scim.allow_jit_sso` flag

### Task 16 — Modify `internal/auth/` SSO callback

**Files:**
- Modify: `apps/backend/internal/auth/sso_callback.go` (or wherever the OIDC/SAML callback handler lives — verify path during impl)

- [ ] **Step 16.1: Read existing callback flow**

Find the function that, after IdP token exchange, looks up the user by email and (if not found) creates a new one. Diagram it before changing.

- [ ] **Step 16.2: Patch lookup order**

```go
// After validating IdP claims:
//   sub := claims.Subject
//   email := claims.Email
//   companyID := derivedFromIdPConfig

// 1. Try by scim_external_id = sub
if sub != "" {
	u, err := userRepo.FindByExternalID(ctx, companyID, sub)  // existing internal/users repo or new method
	if err == nil {
		return loginExisting(ctx, u)
	}
}

// 2. Try by email (existing behaviour)
u, err := userRepo.FindByEmail(ctx, companyID, email)
if err == nil {
	// Link sub → scim_external_id when null
	if u.ScimExternalID == nil && sub != "" {
		_ = userRepo.SetSCIMExternalID(ctx, u.ID, sub)
	}
	return loginExisting(ctx, u)
}

// 3. JIT — only if tenant allows
allowed := scimSettings.AllowJITSSO(ctx, companyID) // default true
if !allowed {
	return failJIT(w, r, "Account not provisioned. Contact your administrator.")
}
return jitCreate(ctx, ...)  // existing
```

- [ ] **Step 16.3: Test the three paths**

```go
func TestSSOCallback_MatchesByExternalID(t *testing.T) { /* ... */ }
func TestSSOCallback_LinksOnEmailMatch(t *testing.T)   { /* ... */ }
func TestSSOCallback_RefusesJITWhenDisabled(t *testing.T) {
	// scim_tenant_settings.allow_jit_sso = false → 403
}
```

- [ ] **Step 16.4: Commit**

```bash
git commit -am "feat(scim): JIT-SSO matches by scim_external_id, honors tenant flag"
```

### Task 17 — Auto-link existing users in `POST /Users`

Plan 1 left this stubbed — the tenant-flag pathway returns ErrUserDuplicate. Now we read the actual flag and link.

**Files:**
- Modify: `apps/backend/internal/scim/service/user_service.go`

- [ ] **Step 17.1: Replace the stub `autoLink` function**

In Plan 1, the field was `autoLink func(ctx, companyID) (bool, error)` defaulting to `false`. Now wire it:
```go
// In cmd/api/main.go:
autoLinkFn := func(ctx context.Context, companyID uuid.UUID) (bool, error) {
	s, err := scimSettingsRepo.Get(ctx, companyID)
	if err != nil {
		return false, err
	}
	return s.AutoLinkExistingUsers, nil
}
userSvc := service.NewUserService(usersDomain, scimUserRepo, autoLinkFn, middleware.TokenID)
```

- [ ] **Step 17.2: When auto-linking, also overwrite SCIM-mappable attributes**

Plan 1's auto-link path only set `scim_external_id` — left the existing user's name, phone, etc. untouched. Spec §5.1 says "existing manual grants stay" but attributes should be SCIM-overwritten. Add an UpdateFromSCIM call after SetSCIMLink:

```go
// In CreateFromSCIM auto-link branch:
if err := s.repo.SetSCIMLink(ctx, existing.ID, in.ExternalID, metaJSON); err != nil { ... }
if err := s.domain.UpdateFromSCIM(ctx, DomainUpdateInput{
	CompanyID: companyID,
	UserID:    existing.ID,
	DomainCreateInput: domainIn,
}); err != nil {
	return nil, err
}
return s.toResource(ctx, companyID, existing.ID)
```

- [ ] **Step 17.3: Test + commit**

```go
func TestUserService_CreateFromSCIM_AutoLinkOverwritesAttributes(t *testing.T) {
	// existing user with name=Old, phone=+1
	// SCIM POST with name=New, phone=+7 + auto_link enabled
	// → user has scim_external_id linked AND name=New, phone=+7
}
```

```bash
git commit -am "feat(scim): auto-link existing users overwrites SCIM-mappable attributes"
```

## Phase 2.H — Admin management API (`internal/scim_admin/`)

These endpoints are **distinct from SCIM** — they're consumed by the QuokkaQ frontend (admin UI). Auth via existing JWT + `tenant_admin` RBAC. Routed under `/api/v1/admin/scim/...` (not `/scim/v2/...`).

The package lives in a sibling `internal/scim_admin/` directory rather than inside `internal/scim/` so the SCIM module stays focused on RFC 7644 traffic only — different consumers, different shape, different OpenAPI spec.

### Task 18 — Admin routes scaffold + RBAC middleware

**Files:**
- Create: `apps/backend/internal/scim_admin/routes.go`
- Create: `apps/backend/internal/scim_admin/handlers/`
- Create: `apps/backend/internal/scim_admin/middleware.go`

- [ ] **Step 18.1: Define routes**

`routes.go`:
```go
package scim_admin

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/quokkaq/backend/internal/scim_admin/handlers"
)

type Config struct {
	Tokens     *handlers.TokensHandler
	Mappings   *handlers.MappingsHandler
	Settings   *handlers.SettingsHandler
	Activity   *handlers.ActivityHandler
	Stats      *handlers.StatsHandler
	RequireTenantAdmin func(http.Handler) http.Handler // existing RBAC mw
}

func Mount(cfg Config) http.Handler {
	r := chi.NewRouter()
	r.Use(cfg.RequireTenantAdmin)

	r.Route("/tokens", func(r chi.Router) {
		r.Get("/", cfg.Tokens.List)
		r.Post("/", cfg.Tokens.Generate)
		r.Post("/{id}/rotate", cfg.Tokens.Rotate)
		r.Post("/{id}/revoke", cfg.Tokens.Revoke)
	})
	r.Route("/mappings", func(r chi.Router) {
		r.Get("/", cfg.Mappings.List)
		r.Post("/", cfg.Mappings.Create)
		r.Patch("/{id}", cfg.Mappings.Update)
		r.Delete("/{id}", cfg.Mappings.Delete)
	})
	r.Route("/settings", func(r chi.Router) {
		r.Get("/", cfg.Settings.Get)
		r.Patch("/", cfg.Settings.Update)
	})
	r.Get("/activity", cfg.Activity.List)
	r.Get("/stats", cfg.Stats.Summary)

	return r
}
```

- [ ] **Step 18.2: Verify the existing tenant_admin RBAC middleware**

Find it in the existing codebase (probably `internal/auth/middleware.go` or `internal/rbac/`). Ensure it returns 403 for non-tenant-admin and 401 for unauth.

- [ ] **Step 18.3: Wire in `cmd/api/main.go`**

```go
adminMount := scim_admin.Mount(scim_admin.Config{...})
router.Mount("/api/v1/admin/scim", adminMount)
```

- [ ] **Step 18.4: Commit**

```bash
git commit -am "feat(scim-admin): scaffold admin management API routes"
```

### Task 19 — Tokens handler

**Files:**
- Create: `apps/backend/internal/scim_admin/handlers/tokens.go`
- Create: `apps/backend/internal/scim_admin/handlers/tokens_test.go`

- [ ] **Step 19.1: List, Generate (single-shot reveal), Rotate, Revoke**

```go
type TokensHandler struct {
	svc *scimsvc.TokenService
	repo *repository.TokenRepo
}

type TokenSummary struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Prefix      string  `json:"prefix"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"created_at"`
	LastUsedAt  *string `json:"last_used_at,omitempty"`
	RotatedFrom *string `json:"rotated_from,omitempty"`
}

func (h *TokensHandler) List(w http.ResponseWriter, r *http.Request) {
	companyID := authctx.CompanyID(r.Context())
	rows, err := h.repo.ListByCompany(r.Context(), companyID, false)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	out := make([]TokenSummary, 0, len(rows))
	for _, t := range rows {
		ts := TokenSummary{
			ID: t.ID.String(), Name: t.Name, Prefix: t.TokenPrefix,
			Status: t.Status, CreatedAt: t.CreatedAt.Format(time.RFC3339),
		}
		if t.LastUsedAt != nil {
			s := t.LastUsedAt.Format(time.RFC3339)
			ts.LastUsedAt = &s
		}
		out = append(out, ts)
	}
	writeJSON(w, 200, out)
}

type GenerateTokenRequest struct {
	Name string `json:"name" validate:"required,min=1,max=120"`
}

type GenerateTokenResponse struct {
	Token   TokenSummary `json:"token"`
	RawToken string      `json:"raw_token"` // shown ONCE
}

func (h *TokensHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req GenerateTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeJSON(w, 400, map[string]string{"error": "name required"})
		return
	}
	companyID := authctx.CompanyID(r.Context())
	userID := authctx.UserID(r.Context())
	out, err := h.svc.Generate(r.Context(), scimsvc.GenerateTokenInput{
		CompanyID: companyID, Name: req.Name, CreatedBy: &userID,
	})
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, GenerateTokenResponse{
		Token: TokenSummary{
			ID: out.Token.ID.String(), Name: out.Token.Name,
			Prefix: out.Token.TokenPrefix, Status: out.Token.Status,
			CreatedAt: out.Token.CreatedAt.Format(time.RFC3339),
		},
		RawToken: out.RawToken, // single-shot reveal
	})
}

func (h *TokensHandler) Rotate(w http.ResponseWriter, r *http.Request) {
	id, _ := uuid.Parse(chi.URLParam(r, "id"))
	out, err := h.svc.Rotate(r.Context(), id, scimsvc.RotateTokenInput{})
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, GenerateTokenResponse{
		Token: TokenSummary{ID: out.Token.ID.String(), Name: out.Token.Name, Prefix: out.Token.TokenPrefix, Status: out.Token.Status, CreatedAt: out.Token.CreatedAt.Format(time.RFC3339)},
		RawToken: out.RawToken,
	})
}

func (h *TokensHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	id, _ := uuid.Parse(chi.URLParam(r, "id"))
	userID := authctx.UserID(r.Context())
	if err := h.svc.Revoke(r.Context(), id, &userID); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(204)
}
```

- [ ] **Step 19.2: Tests + commit**

Tests cover: list (200), generate (201 with raw_token in response), rotate (200), revoke (204), non-tenant-admin (403).

```bash
git commit -am "feat(scim-admin): tokens CRUD endpoints"
```

### Task 20 — Mappings handler

**Files:**
- Create: `apps/backend/internal/scim_admin/handlers/mappings.go`

Endpoints:
- `GET /mappings?group_id=...` → list mappings for a group, or all for tenant
- `POST /mappings` → create
- `PATCH /mappings/{id}` → update (changes role/unit/services/is_active)
- `DELETE /mappings/{id}` → delete

Each Create / Update / Delete kicks off bulk recompute. The handler doesn't wait for completion — returns immediately with the new mapping payload, frontend polls for stats.

- [ ] **Step 20.1: Implement (mirror tokens shape)**

Request/response shapes:
```go
type MappingPayload struct {
	ID          string   `json:"id"`
	ScimGroupID string   `json:"scim_group_id"`
	RoleCode    string   `json:"role_code"`
	UnitID      *string  `json:"unit_id,omitempty"`
	ServiceIDs  []string `json:"service_ids,omitempty"`
	IsActive    bool     `json:"is_active"`
	UpdatedAt   string   `json:"updated_at"`
}

type CreateMappingRequest struct {
	ScimGroupID string   `json:"scim_group_id"`
	RoleCode    string   `json:"role_code"`
	UnitID      *string  `json:"unit_id,omitempty"`
	ServiceIDs  []string `json:"service_ids,omitempty"`
}
```

Uses `MappingService.Create / Update / Delete` from Task 4 — the service already enqueues recompute and audits.

- [ ] **Step 20.2: Validation errors return 400**

When `MappingService` returns `ErrInvalidMapping` / `ErrUnknownGroup` / `ErrUnknownUnit`, map to 400 with descriptive `error` field.

- [ ] **Step 20.3: Tests + commit**

```bash
git commit -am "feat(scim-admin): mappings CRUD endpoints"
```

### Task 21 — Settings handler

**Files:**
- Create: `apps/backend/internal/scim_admin/handlers/settings.go`

Wraps `scim_tenant_settings` table. GET returns full settings; PATCH accepts partial updates with whitelist of mutable fields.

```go
type Settings struct {
	Enabled               bool `json:"enabled"`
	AllowJITSSO           bool `json:"allow_jit_sso"`
	AutoLinkExistingUsers bool `json:"auto_link_existing_users"`
	RetentionDays         int  `json:"retention_days"`  // -1 / 90 / 180 / 365
}
```

- [ ] **Step 21.1: Implement Get + Update**

When `Update` flips `enabled: true`, also confirm the tenant has the `scim_provisioning` plan feature — refuse otherwise (403 with reason).

- [ ] **Step 21.2: Tests + commit**

```bash
git commit -am "feat(scim-admin): settings GET/PATCH"
```

### Task 22 — Activity handler

**Files:**
- Create: `apps/backend/internal/scim_admin/handlers/activity.go`

Returns `scim_request_log` rows merged with `audit_log` `actor_type='scim'` rows, paginated, filterable by event type / time range.

- [ ] **Step 22.1: Query**

```go
// Pseudocode — actual query joins audit_log and scim_request_log via UNION ALL,
// orders by created_at DESC, paginates.
const q = `
WITH unioned AS (
  SELECT 'request' AS source, id, company_id, created_at, method, path, status_code, scim_type, error_detail
  FROM scim_request_log WHERE company_id = $1
  UNION ALL
  SELECT 'audit' AS source, id, company_id, created_at, NULL, NULL, NULL, event_type, payload::text
  FROM audit_log WHERE company_id = $1 AND actor_type = 'scim'
)
SELECT * FROM unioned ORDER BY created_at DESC LIMIT $2 OFFSET $3
`
```

- [ ] **Step 22.2: Filters: event_type, since/until, status_code, token_id**

- [ ] **Step 22.3: Tests + commit**

```bash
git commit -am "feat(scim-admin): activity feed (audit + request_log union)"
```

### Task 23 — Stats handler

**Files:**
- Create: `apps/backend/internal/scim_admin/handlers/stats.go`

Quick-stats numbers shown on the Overview page: SCIM-managed users count, SCIM groups count, unmapped groups count, stranded users count, last-hour event count.

- [ ] **Step 23.1: Single SELECT building all five numbers**

Uses CTEs for clarity and one round-trip. Returns:
```go
type Stats struct {
	SCIMManagedUsers int `json:"scim_managed_users"`
	SCIMGroups       int `json:"scim_groups"`
	UnmappedGroups   int `json:"unmapped_groups"`
	StrandedUsers    int `json:"stranded_users"`
	EventsLastHour   int `json:"events_last_hour"`
}
```

`stranded_users`: SCIM-source users with no SCIM-source role assignments AND no manual role assignments.

- [ ] **Step 23.2: Tests + commit**

```bash
git commit -am "feat(scim-admin): stats endpoint for overview page"
```

### Task 24 — Audit log filtering API for /Users page

**Files:**
- Modify: `apps/backend/internal/scim_admin/handlers/activity.go` (or split out)

Frontend Users page (Phase 2.K Task 33) wants filter `Source = SCIM | JIT-SSO | Manual | Anonymized`. The existing users API likely doesn't expose this filter — extend it (or add a new admin endpoint specifically for SCIM-aware listing).

- [ ] **Step 24.1: Decide where to add filter**

Pragmatic: add `?source=scim|jit_sso|manual|anonymized` query param to **existing** `/api/v1/admin/users` endpoint (less code; one user list page, not two). If existing endpoint is rigid, add new `/api/v1/admin/scim/users-listing` mirror.

- [ ] **Step 24.2: Implement filter on the chosen endpoint**

```go
switch source {
case "scim":
	q = q.Where("scim_metadata->>'source' = 'scim' AND pii_anonymized_at IS NULL")
case "jit_sso":
	q = q.Where("scim_metadata->>'source' = 'jit_sso'")
case "manual":
	q = q.Where("scim_metadata IS NULL OR scim_metadata->>'source' = 'manual'")
case "anonymized":
	q = q.Where("pii_anonymized_at IS NOT NULL")
}
```

- [ ] **Step 24.3: Test + commit**

```bash
git commit -am "feat(scim-admin): source filter for users listing"
```

---

## Phase 2.I — OpenAPI / Orval regen

### Task 25 — Regenerate API client

The admin endpoints from Phase 2.H need to appear in the generated TypeScript client.

**Files:**
- Modify: `apps/backend/configs/openapi/` (regenerated)
- Modify: `apps/frontend/src/lib/api/generated/` (regenerated)
- Verify: `apps/marketing/src/lib/api/generated/` doesn't break (marketing uses a subset)

- [ ] **Step 25.1: Add Swag annotations to admin handlers**

Each handler from Phase 2.H needs a Swag comment block:
```go
// @Summary List SCIM tokens
// @Tags scim-admin
// @Produce json
// @Success 200 {array} TokenSummary
// @Router /api/v1/admin/scim/tokens [get]
func (h *TokensHandler) List(...) { }
```

- [ ] **Step 25.2: Regenerate spec**

```bash
pnpm nx openapi backend
```

This runs `swag init` followed by the project's spec converter. Output: `apps/backend/configs/openapi/openapi.json` (or whatever path the project uses).

- [ ] **Step 25.3: Regenerate TS client**

```bash
pnpm nx orval frontend
```

- [ ] **Step 25.4: Run CI checks locally**

```bash
pnpm nx run frontend:openapi:check
pnpm nx run frontend:orval:check
```

Both should be green.

- [ ] **Step 25.5: Commit**

```bash
git add apps/backend/configs/openapi/ apps/frontend/src/lib/api/generated/
git commit -m "chore(scim): regenerate OpenAPI spec + TS client for admin endpoints"
```

## Phase 2.J — Frontend shared components

Each component is a TDD cycle: Vitest component test → implementation → pass → commit. They live in `apps/frontend/components/scim/` and are imported by the pages in Phase 2.K.

### Task 26 — `<SourceBadge>`

**Files:**
- Create: `apps/frontend/components/scim/SourceBadge.tsx`
- Create: `apps/frontend/components/scim/SourceBadge.test.tsx`

Visual indicator showing whether a user / grant comes from `scim`, `jit_sso`, or `manual`. Used in the Users page table and detail view.

- [ ] **Step 26.1: Test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceBadge } from './SourceBadge';

describe('SourceBadge', () => {
  it('shows "Managed by IdP" for SCIM source', () => {
    render(<SourceBadge source="scim" />);
    expect(screen.getByText(/Managed by IdP/i)).toBeInTheDocument();
  });
  it('shows "JIT-SSO" for jit_sso source', () => {
    render(<SourceBadge source="jit_sso" />);
    expect(screen.getByText(/JIT/i)).toBeInTheDocument();
  });
  it('shows nothing visible for "manual" (default chrome)', () => {
    const { container } = render(<SourceBadge source="manual" />);
    expect(container).toMatchSnapshot();
  });
  it('shows "Anonymized" with warning style when anonymized', () => {
    render(<SourceBadge source="anonymized" />);
    expect(screen.getByText(/Anonymized/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 26.2: Implement**

```tsx
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

export type Source = 'scim' | 'jit_sso' | 'manual' | 'anonymized';

export function SourceBadge({ source }: { source: Source }) {
  const t = useTranslations('settings.sso.scim.source');
  switch (source) {
    case 'scim':
      return <Badge variant="default">{t('scim')}</Badge>;
    case 'jit_sso':
      return <Badge variant="secondary">{t('jit_sso')}</Badge>;
    case 'anonymized':
      return <Badge variant="destructive">{t('anonymized')}</Badge>;
    case 'manual':
    default:
      return null;
  }
}
```

- [ ] **Step 26.3: Commit**

```bash
cd apps/frontend && pnpm vitest run components/scim/SourceBadge.test.tsx
git add apps/frontend/components/scim/SourceBadge*
git commit -m "feat(frontend-scim): add SourceBadge component"
```

### Task 27 — `<TokenRevealModal>`

**Files:**
- Create: `apps/frontend/components/scim/TokenRevealModal.tsx`
- Create: `apps/frontend/components/scim/TokenRevealModal.test.tsx`

Single-shot reveal — token shown once with copy-to-clipboard, locked behind an "I have saved this token" checkbox.

- [ ] **Step 27.1: Test (key behaviours)**

```tsx
describe('TokenRevealModal', () => {
  it('disables Done until checkbox is ticked', () => { /* ... */ });
  it('copies token to clipboard on Copy click', async () => { /* uses navigator.clipboard mock */ });
  it('emits onClose when Done is clicked', () => { /* ... */ });
  it('warns "will not be shown again" prominently', () => { /* expects element with role=alert */ });
});
```

- [ ] **Step 27.2: Implement using Radix Dialog from ui-kit**

(Existing project uses Radix; reuse the `<Dialog>` primitive from `@quokkaq/ui-kit`.)

- [ ] **Step 27.3: Commit**

```bash
git add apps/frontend/components/scim/TokenRevealModal*
git commit -m "feat(frontend-scim): TokenRevealModal with single-shot copy"
```

### Task 28 — `<MappingEditor>`

**Files:**
- Create: `apps/frontend/components/scim/MappingEditor.tsx`
- Create: `apps/frontend/components/scim/MappingEditor.test.tsx`

The form for creating/editing a single mapping row. Wires React Hook Form + Zod with the validation matrix from spec §4.1 (role / unit / services constraints).

- [ ] **Step 28.1: Zod schema**

```ts
import { z } from 'zod';

const baseSchema = z.object({
  scimGroupId: z.string().uuid(),
  roleCode: z.enum(['tenant_admin', 'unit_manager', 'operator']),
  unitId: z.string().uuid().optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
});

export const mappingSchema = baseSchema.refine((v) => {
  switch (v.roleCode) {
    case 'tenant_admin':
      return !v.unitId && (!v.serviceIds || v.serviceIds.length === 0);
    case 'unit_manager':
      return !!v.unitId && (!v.serviceIds || v.serviceIds.length === 0);
    case 'operator':
      return !!v.unitId; // services optional
  }
}, { message: 'role/unit/services constraint violated' });
```

- [ ] **Step 28.2: Test the conditional rendering**

```tsx
it('hides Unit and Services when role=tenant_admin', () => { /* ... */ });
it('shows Unit when role=unit_manager, hides Services', () => { /* ... */ });
it('shows Unit and Services when role=operator', () => { /* ... */ });
it('renders "Affected users: N" preview from props', () => { /* ... */ });
```

- [ ] **Step 28.3: Implement**

Form uses `react-hook-form` + `@hookform/resolvers/zod` per project convention. UI primitives from `@quokkaq/ui-kit` (Select, Checkbox, RadioGroup).

- [ ] **Step 28.4: Commit**

```bash
git add apps/frontend/components/scim/MappingEditor*
git commit -m "feat(frontend-scim): MappingEditor with conditional fields + Zod validation"
```

### Task 29 — `<ProvisioningEventRow>` + `<ProvisioningEventDrawer>`

**Files:**
- Create: `apps/frontend/components/scim/ProvisioningEventRow.tsx`
- Create: `apps/frontend/components/scim/ProvisioningEventDrawer.tsx`
- Tests for each

Event row: time, event type, resource label (user / group display name), status badge, token name.
Event drawer: full request body summary, error detail, trace link (placeholder for Plan 3 OTel UI integration).

- [ ] **Step 29.1: Test, implement, commit (mechanical)**

```bash
git add apps/frontend/components/scim/ProvisioningEvent*
git commit -m "feat(frontend-scim): ProvisioningEventRow + Drawer"
```

---

## Phase 2.K — Frontend pages

Each page consumes the TanStack Query hooks (`apps/frontend/hooks/scim/`) which wrap the generated API client. Pages compose the components from Phase 2.J.

### Task 30 — TanStack Query hooks

**Files:**
- Create: `apps/frontend/hooks/scim/use-tokens.ts`
- Create: `apps/frontend/hooks/scim/use-mappings.ts`
- Create: `apps/frontend/hooks/scim/use-settings.ts`
- Create: `apps/frontend/hooks/scim/use-activity.ts`
- Create: `apps/frontend/hooks/scim/use-stats.ts`
- Create: `apps/frontend/hooks/scim/use-groups.ts`

Each hook follows the standard project pattern (existing hooks live in `apps/frontend/hooks/...` — match style).

- [ ] **Step 30.1: Implement `use-tokens.ts` (template for the rest)**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listScimAdminTokens, generateScimAdminToken, rotateScimAdminToken, revokeScimAdminToken } from '@/lib/api/generated';

export function useScimTokens() {
  return useQuery({
    queryKey: ['scim', 'tokens'],
    queryFn: () => listScimAdminTokens(),
  });
}

export function useGenerateScimToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => generateScimAdminToken(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scim', 'tokens'] }),
  });
}

export function useRotateScimToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rotateScimAdminToken(id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scim', 'tokens'] }),
  });
}

export function useRevokeScimToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeScimAdminToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scim', 'tokens'] }),
  });
}
```

- [ ] **Step 30.2: Mirror for mappings / settings / activity / stats / groups**

(Five more files following the same template — engineer can write all in one sitting.)

- [ ] **Step 30.3: Commit**

```bash
git add apps/frontend/hooks/scim/
git commit -m "feat(frontend-scim): TanStack Query hooks"
```

### Task 31 — Layout (shared sidebar nav)

**Files:**
- Create: `apps/frontend/app/[locale]/settings/sso/scim/layout.tsx`

Provides the secondary tab nav (Overview / Tokens / Mappings / Groups / Users / Activity) and route guards (redirect non-tenant-admin to `/settings`).

- [ ] **Step 31.1: Implement**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ScimTabNav } from '@/components/scim/ScimTabNav';

export default async function ScimLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (me.role !== 'tenant_admin') {
    redirect('/settings');
  }
  return (
    <div className="flex flex-col gap-4">
      <ScimTabNav />
      {children}
    </div>
  );
}
```

- [ ] **Step 31.2: `<ScimTabNav>` component (Tasks 32+ depend on it)**

```tsx
const tabs = [
  { href: '/settings/sso/scim',         label: 'overview' },
  { href: '/settings/sso/scim/tokens',  label: 'tokens' },
  { href: '/settings/sso/scim/mappings', label: 'mappings' },
  { href: '/settings/sso/scim/groups',  label: 'groups' },
  { href: '/settings/sso/scim/users',   label: 'users' },
  { href: '/settings/sso/scim/activity', label: 'activity' },
];
```

- [ ] **Step 31.3: Commit**

```bash
git commit -am "feat(frontend-scim): SCIM admin layout + tab nav"
```

### Task 32 — Overview page

**Files:**
- Create: `apps/frontend/app/[locale]/settings/sso/scim/page.tsx`

Composes endpoint URL display, settings card, active tokens summary, quick stats, enable/disable button.

- [ ] **Step 32.1: Implement**

Pages compose the hooks:
```tsx
'use client';
import { useScimSettings, useScimTokens, useScimStats } from '@/hooks/scim/...';
// ...
```

- [ ] **Step 32.2: Test (component test)**

`page.test.tsx` mocks the hooks via TanStack Query test wrapper.

- [ ] **Step 32.3: Commit**

```bash
git commit -am "feat(frontend-scim): Overview / Setup page"
```

### Task 33 — Tokens page

**Files:**
- Create: `apps/frontend/app/[locale]/settings/sso/scim/tokens/page.tsx`

Shows the table from spec §7.3, wires Generate (single-shot reveal via `<TokenRevealModal>`), Rotate (also reveal), Revoke (confirmation).

- [ ] **Step 33.1: Implement + test + commit**

```bash
git commit -am "feat(frontend-scim): Tokens page"
```

### Task 34 — Mappings page

**Files:**
- Create: `apps/frontend/app/[locale]/settings/sso/scim/mappings/page.tsx`

Top section "Needs configuration" (groups without mappings). Configured mappings table grouped by SCIM group. Add/Edit modal uses `<MappingEditor>`. After save, displays a progress toast for the recompute job.

- [ ] **Step 34.1: Implement + test + commit**

```bash
git commit -am "feat(frontend-scim): Mappings page (central screen)"
```

### Task 35 — Groups, Users, Activity pages

**Files:**
- Create: `apps/frontend/app/[locale]/settings/sso/scim/groups/page.tsx`
- Create: `apps/frontend/app/[locale]/settings/sso/scim/users/page.tsx` (extends existing `/settings/users` with `?source=` filter)
- Create: `apps/frontend/app/[locale]/settings/sso/scim/activity/page.tsx`

Mechanical — each consumes the corresponding hook + composes existing UI components (table, filter bar, drawer).

- [ ] **Step 35.1-3: Implement, test, commit each page in turn**

```bash
git commit -am "feat(frontend-scim): Groups / Users / Activity pages"
```

---

## Phase 2.L — i18n

### Task 36 — `settings.sso.scim.*` keys

**Files:**
- Modify: `apps/frontend/messages/en.json`
- Modify: `apps/frontend/messages/ru.json`

- [ ] **Step 36.1: Inventory all keys used by Phase 2.J/2.K components**

```bash
grep -rn 'useTranslations.*settings\.sso\.scim' apps/frontend/components/scim apps/frontend/app/\[locale\]/settings/sso/scim
```

- [ ] **Step 36.2: Author en + ru in parallel (paired translations)**

Example structure:
```json
{
  "settings": {
    "sso": {
      "scim": {
        "title": "SCIM 2.0 Provisioning",
        "status": { "enabled": "Enabled", "disabled": "Disabled" },
        "settings": {
          "allowJitSso": "Allow JIT-SSO (lenient mode)",
          "autoLink": "Auto-link existing users by email",
          "retention": "Retention for deactivated users"
        },
        "source": {
          "scim": "Managed by IdP",
          "jit_sso": "JIT-SSO",
          "anonymized": "Anonymized"
        },
        "tokens": { /* ... */ },
        "mappings": { /* ... */ },
        "activity": { /* ... */ }
      }
    }
  }
}
```

Russian mirror: same shape, translated copy. Technical terms (token, SCIM, IdP) follow existing `/settings/sso` glossary.

- [ ] **Step 36.3: Run i18n key check**

```bash
pnpm nx run frontend:i18n:check
```

(If the project doesn't have such a check — skip; add to CI in Plan 3.)

- [ ] **Step 36.4: Commit**

```bash
git add apps/frontend/messages/en.json apps/frontend/messages/ru.json
git commit -m "feat(frontend-scim): EN + RU i18n strings for SCIM admin UI"
```

---

## Phase 2.M — End-to-end smoke

### Task 37 — Full lifecycle smoke (backend + frontend integration)

**Files:**
- Create: `apps/backend/internal/scim/scim_e2e_smoke_test.go` (build tag `e2e`)

Extends Plan 1 Task 36 smoke — adds the mapping/recompute pathway:

- [ ] **Step 37.1: Implement**

```go
//go:build e2e

func TestSCIM_E2E_FullProvisioningLifecycle(t *testing.T) {
	srv := testharness.StartBackend(t, testharness.Opts{
		EnvOverrides: map[string]string{"SCIM_ENABLED": "true"},
	})
	defer srv.Close()

	companyID := srv.SeedCompany(t, "acme-e2e")
	srv.EnablePlanFeature(t, companyID, "scim_provisioning")
	unitID := srv.SeedUnit(t, companyID, "MSK-001")
	srv.SetScimSettings(t, companyID, /*enabled*/true, /*allowJIT*/true, /*autoLink*/false, /*retention*/365)

	// Generate token via admin mgmt API
	rawToken := srv.GenerateScimToken(t, companyID, "e2e")

	headers := http.Header{
		"Authorization": []string{"Bearer " + rawToken},
		"Content-Type":  []string{"application/scim+json"},
	}

	// 1. SCIM creates user
	userResp, code := srv.Do("POST", "/scim/v2/acme-e2e/Users", bytes.NewBufferString(`{
		"schemas":["urn:ietf:params:scim:schemas:core:2.0:User"],
		"userName":"alice@x.ru",
		"externalId":"ext-1",
		"name":{"givenName":"Alice","familyName":"Smith"},
		"active":true
	}`), headers)
	require.Equal(t, 201, code)
	var user map[string]any
	require.NoError(t, json.Unmarshal(userResp, &user))
	userID := user["id"].(string)

	// 2. SCIM creates group
	groupResp, code := srv.Do("POST", "/scim/v2/acme-e2e/Groups", bytes.NewBufferString(`{
		"schemas":["urn:ietf:params:scim:schemas:core:2.0:Group"],
		"displayName":"ops",
		"members":[{"value":"`+userID+`"}]
	}`), headers)
	require.Equal(t, 201, code)
	var group map[string]any
	require.NoError(t, json.Unmarshal(groupResp, &group))
	groupID := group["id"].(string)

	// 3. Admin configures mapping via mgmt API
	srv.AdminCreateMapping(t, companyID, groupID, "operator", &unitID, nil)

	// 4. Wait briefly for async recompute (Plan 1 sync threshold: 1 user)
	require.Eventually(t, func() bool {
		grants := srv.QueryUserGrants(t, userID, "scim")
		return len(grants) == 1 && grants[0].RoleCode == "operator"
	}, 5*time.Second, 100*time.Millisecond)

	// 5. SCIM PATCH active=false
	_, code = srv.Do("PATCH", "/scim/v2/acme-e2e/Users/"+userID,
		bytes.NewBufferString(`{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"replace","path":"active","value":false}]}`),
		headers)
	require.Equal(t, 200, code)

	// 6. Verify activity feed shows events
	events := srv.AdminListActivity(t, companyID)
	require.GreaterOrEqual(t, len(events), 4) // user.created, group.created, mapping.changed, user.deactivated

	// 7. Verify retention anonymization (fast-forward clock + run job manually)
	srv.FastForward(t, 366*24*time.Hour)
	srv.RunAsynqJobNow(t, "pii.anonymize_users_due")
	require.Eventually(t, func() bool {
		u := srv.QueryUser(t, userID)
		return u.PIIAnonymizedAt != nil && u.Email != "alice@x.ru"
	}, 5*time.Second, 100*time.Millisecond)
}
```

- [ ] **Step 37.2: Run smoke**

```bash
cd apps/backend && go test -tags e2e ./internal/scim/ -run TestSCIM_E2E_FullProvisioningLifecycle -v
```

Expected: PASS. Failures are usually integration glue between mapping → recompute → grants — fix in the failing layer.

- [ ] **Step 37.3: Commit**

```bash
git add apps/backend/internal/scim/scim_e2e_smoke_test.go
git commit -m "test(scim): full E2E smoke covering mapping → recompute → anonymization"
```

---

## Self-review (done by author)

### Spec coverage (Plan 2 portion)

| Spec section | Plan 2 task(s) | Status |
|---|---|---|
| §2.4 `role_assignments.source` | Task 1 | ✅ |
| §4.1 Layered authority model | Tasks 5, 6 | ✅ |
| §4.2 Mapping table semantics | Tasks 3, 4 | ✅ |
| §4.3 Recompute algorithm | Tasks 6, 7 | ✅ |
| §4.4 Recompute triggers | Tasks 9–11 | ✅ |
| §4.5 Edge cases (mapping → deleted unit) | Task 11 | ✅ |
| §4.6 Bootstrap | Implicit — Phase 2.K Mappings page surfaces "Needs configuration" | ✅ |
| §5.1 auto-link existing users | Task 17 | ✅ |
| §5.4 PII anonymization | Tasks 12–14 | ✅ |
| §5.6 JIT-SSO matching | Task 16 | ✅ |
| §6.1 token rotation grace period | Task 15 | ✅ |
| §7.1–7.10 Frontend admin UI | Tasks 26–36 | ✅ |
| §6.3 audit-log catalogue | Touched throughout (Tasks 4, 12, 16) — but the full event list (15 events) is enforced piecemeal across services. Audit completeness check: Plan 3 | ⚠️ partial |
| §6.4 metrics | Plan 3 (ops spec dependency) | ⚪ deferred |
| §6.5 tracing | Plan 3 | ⚪ deferred |

### Findings

- **F1 — Audit-event coverage check missing.** Each service writes audit events ad-hoc; we need a Plan 3 task that asserts every event from spec §6.3 actually fires (integration test: trigger each path, assert audit_log has the corresponding row). Logged as a Plan 3 candidate.
- **F2 — `<ScimTabNav>` not explicitly in a task.** Referenced by Task 31 but never built. Engineer creates it inside Task 31 alongside the layout — small enough not to warrant a separate task.
- **F3 — Plan 1 dependency on `EnableScimCard` resolution.** Plan 1 left `enabled` as an env flag + plan-feature; Plan 2 introduces per-tenant `enabled` in `scim_tenant_settings`. The runtime flow becomes: env true AND plan feature true AND tenant settings.enabled true. Plan 1 routes (`Mount`) check the first two; Plan 2 must add the third gate. **Action:** in Task 21 (Settings handler) or Task 18 (admin routes scaffold), add a planFeatureGate-style middleware that also checks `scim_tenant_settings.enabled`.
- **F4 — Order of Tasks 1 + 17.** Task 17 (auto-link) needs the settings table from Task 2, which is in Phase 2.A — order is correct (Phase 2.A precedes 2.G).
- **F5 — Missing migration for the `scim_tenant_settings` enabled field interaction with global SCIM_ENABLED.** No code change needed — the routes layer (`Mount` from Plan 1 + a new tenant-gate added per F3) handles the AND-of-three at request time.
- **F6 — Frontend `<EnableScimCard>` not explicitly tasked.** Mentioned in file structure but not a task. **Action:** rolled into Task 32 (Overview page) — it's a single component within that page.

### Type consistency

- `service.UserDomain` (Plan 1) extended with `AnonymizePIIByID` (Task 12) — implementer adds the method to `internal/users.Service`. ✅
- `service.UserGroupReader`, `AuditWriter`, `UnitExistenceChecker` interfaces — defined in Plan 2, satisfied by adapters in `cmd/api/main.go`. ✅
- `repository.SCIMGroupMapping`, `UserRoleAssignment`, `pq.UUIDArray` types consistent across repos / services / jobs. ✅
- Asynq task names: `scim.recompute_user_grants`, `scim.recompute_group_members`, `pii.anonymize_user`, `pii.anonymize_users_due`, `scim.token_rotation_finalize` — referenced consistently. ✅
- Frontend hook names: `useScimTokens / useScimMappings / useScimSettings / useScimActivity / useScimStats / useScimGroups`. ✅
- i18n key roots: `settings.sso.scim.*` consistent across components. ✅

### Conclusion

Plan 2 makes SCIM fully functional end-to-end with admin UI. After Tasks 1–37 ship: a tenant admin can enable SCIM, mint a token, configure mappings in the UI, and watch IdP-driven users gain grants automatically; deactivated users are anonymized after retention; JIT-SSO honors SCIM provenance.

The remaining gaps (conformance tests against real IdP validators, k6 load tests, Playwright E2E across the UI, public docs, runbook, phased rollout playbook) are Plan 3.

---

## Execution

**Plan 2 saved to `docs/plan/2026-04-25-scim-plan-2-mapping-and-ui.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks via `superpowers:executing-plans`, batch with checkpoints.

Sequencing reminder: Plan 1 must ship first. If Plan 1 ships green, Plan 2 phases 2.A → 2.M execute in order without circular dependencies. Frontend Phase 2.J/2.K can start in parallel once Phase 2.I (OpenAPI/Orval regen, Task 25) lands.

---

## Self-review

_(To be performed after all phases written.)_

## Execution

_(To be added at completion.)_
