package repository

import (
	"encoding/json"
	"testing"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestParseCounterpartyLegalAndInn(t *testing.T) {
	t.Parallel()
	inn := "7707083893"
	full := "ООО Рога и копыта"
	raw, err := json.Marshal(map[string]any{
		"inn":      inn,
		"fullName": full,
	})
	if err != nil {
		t.Fatal(err)
	}
	legal, gotInn := parseCounterpartyLegalAndInn(raw)
	if gotInn == nil || *gotInn != inn {
		t.Fatalf("inn = %v, want %q", gotInn, inn)
	}
	if legal == nil || *legal != full {
		t.Fatalf("legal = %v, want %q", legal, full)
	}
}

func newAccessibleCompaniesTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Exec(`
CREATE TABLE companies (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	counterparty TEXT,
	owner_user_id TEXT
);
CREATE TABLE units (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL
);
CREATE TABLE user_units (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	unit_id TEXT NOT NULL
);
`).Error
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestListAccessibleCompanies_mergesUnitsAndOwnership(t *testing.T) {
	t.Parallel()
	db := newAccessibleCompaniesTestDB(t)
	repo := &userRepository{db: db}

	const uid = "user-1"
	if err := db.Exec(`INSERT INTO companies (id, name, counterparty, owner_user_id) VALUES ('c-own', 'Zeta', NULL, ?)`, uid).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO companies (id, name, counterparty, owner_user_id) VALUES ('c-unit', 'Alpha', NULL, NULL)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO units (id, company_id) VALUES ('u1', 'c-unit')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_units (id, user_id, unit_id) VALUES ('uu1', ?, 'u1')`, uid).Error; err != nil {
		t.Fatal(err)
	}

	got, err := repo.ListAccessibleCompanies(uid, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	// Sorted by name: Alpha before Zeta
	if got[0].Name != "Alpha" || got[1].Name != "Zeta" {
		t.Fatalf("order = %#v", got)
	}
}

func TestResolveCompanyIDForRequest_emptyHeaderUsesFirstUnit(t *testing.T) {
	t.Parallel()
	db := newAccessibleCompaniesTestDB(t)
	repo := &userRepository{db: db}

	const uid = "user-1"
	if err := db.Exec(`INSERT INTO companies (id, name, counterparty, owner_user_id) VALUES ('c1', 'A', NULL, NULL)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO units (id, company_id) VALUES ('u1', 'c1')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_units (id, user_id, unit_id) VALUES ('uu1', ?, 'u1')`, uid).Error; err != nil {
		t.Fatal(err)
	}

	id, err := repo.ResolveCompanyIDForRequest(uid, "")
	if err != nil {
		t.Fatal(err)
	}
	if id != "c1" {
		t.Fatalf("company id = %q, want c1", id)
	}
}
