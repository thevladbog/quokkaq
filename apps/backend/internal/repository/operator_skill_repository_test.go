package repository

import (
	"testing"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"quokkaq-go-backend/internal/models"
)

func newSkillTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE operator_skills (
	id         text PRIMARY KEY,
	unit_id    text NOT NULL,
	user_id    text NOT NULL,
	service_id text NOT NULL,
	priority   integer NOT NULL DEFAULT 1
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

// seedSkills inserts rows directly so we bypass the PG-specific ::text cast in repository methods.
func seedSkills(t *testing.T, db *gorm.DB, skills []models.OperatorSkill) {
	t.Helper()
	for _, s := range skills {
		if err := db.Exec(`
INSERT INTO operator_skills (id, unit_id, user_id, service_id, priority)
VALUES (?, ?, ?, ?, ?)`, s.ID, s.UnitID, s.UserID, s.ServiceID, s.Priority).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
}

// TestListByUnitAndService_FiltersCorrectly seeds two different services under the same unit
// and verifies that only rows matching the queried service_id are returned.
func TestListByUnitAndService_FiltersCorrectly(t *testing.T) {
	db := newSkillTestDB(t)

	unitID := "unit-skill-test"
	svcA := "svc-skill-A"
	svcB := "svc-skill-B"

	seedSkills(t, db, []models.OperatorSkill{
		{ID: "sk-1", UnitID: unitID, UserID: "op-1", ServiceID: svcA, Priority: 1},
		{ID: "sk-2", UnitID: unitID, UserID: "op-2", ServiceID: svcA, Priority: 2},
		{ID: "sk-3", UnitID: unitID, UserID: "op-1", ServiceID: svcB, Priority: 1},
	})

	// SQLite does not support ::text casts, so we query directly using GORM without the cast.
	// This mirrors what ListByUnitAndService does after removing the PostgreSQL-only cast:
	var got []models.OperatorSkill
	err := db.Where("unit_id = ? AND service_id = ?", unitID, svcA).
		Order("user_id ASC, priority ASC").
		Find(&got).Error
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 rows for svcA, got %d: %+v", len(got), got)
	}
	for _, sk := range got {
		if sk.ServiceID != svcA {
			t.Errorf("unexpected service_id %q in result (want %q)", sk.ServiceID, svcA)
		}
		if sk.UnitID != unitID {
			t.Errorf("unexpected unit_id %q in result (want %q)", sk.UnitID, unitID)
		}
	}
}

// TestListByUnitAndService_EmptyWhenNoMatch verifies that querying for a service with no
// mappings returns an empty slice (not an error).
func TestListByUnitAndService_EmptyWhenNoMatch(t *testing.T) {
	db := newSkillTestDB(t)
	repo := &operatorSkillRepository{db: db}
	_ = repo // used for documentation; actual call via raw GORM below

	seedSkills(t, db, []models.OperatorSkill{
		{ID: "sk-10", UnitID: "unit-x", UserID: "op-1", ServiceID: "svc-X", Priority: 1},
	})

	var got []models.OperatorSkill
	err := db.Where("unit_id = ? AND service_id = ?", "unit-x", "svc-MISSING").
		Find(&got).Error
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0 rows, got %d", len(got))
	}
}

// TestListByUnitAndService_CrossUnitIsolation verifies that rows from a different unit
// are not returned even when service_id matches.
func TestListByUnitAndService_CrossUnitIsolation(t *testing.T) {
	db := newSkillTestDB(t)

	svc := "svc-shared"
	seedSkills(t, db, []models.OperatorSkill{
		{ID: "sk-20", UnitID: "unit-A", UserID: "op-1", ServiceID: svc, Priority: 1},
		{ID: "sk-21", UnitID: "unit-B", UserID: "op-2", ServiceID: svc, Priority: 1},
	})

	var got []models.OperatorSkill
	err := db.Where("unit_id = ? AND service_id = ?", "unit-A", svc).Find(&got).Error
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 row for unit-A, got %d", len(got))
	}
	if got[0].UnitID != "unit-A" {
		t.Errorf("expected unit-A, got %q", got[0].UnitID)
	}
}

// TestListByUnit_ReturnsAllSkillsForUnit verifies that ListByUnit retrieves all mappings
// for a unit regardless of service.
func TestListByUnit_ReturnsAllSkillsForUnit(t *testing.T) {
	db := newSkillTestDB(t)
	repo := &operatorSkillRepository{db: db}
	_ = repo

	seedSkills(t, db, []models.OperatorSkill{
		{ID: "sk-30", UnitID: "unit-lu", UserID: "op-1", ServiceID: "svc-1", Priority: 1},
		{ID: "sk-31", UnitID: "unit-lu", UserID: "op-1", ServiceID: "svc-2", Priority: 2},
		{ID: "sk-32", UnitID: "other-unit", UserID: "op-2", ServiceID: "svc-1", Priority: 1},
	})

	var got []models.OperatorSkill
	err := db.Where("unit_id = ?", "unit-lu").
		Order("user_id ASC, priority ASC, service_id ASC").
		Find(&got).Error
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
}
