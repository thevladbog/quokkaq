package repository

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newSupportReportListTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	stmts := []string{
		`CREATE TABLE support_reports (
			id TEXT PRIMARY KEY,
			created_by_user_id TEXT NOT NULL,
			ticket_backend TEXT DEFAULT 'plane',
			plane_work_item_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL,
			description TEXT DEFAULT '',
			trace_id TEXT DEFAULT '',
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE companies (
			id TEXT PRIMARY KEY,
			name TEXT DEFAULT '',
			owner_user_id TEXT DEFAULT ''
		)`,
		`CREATE TABLE units (
			id TEXT PRIMARY KEY,
			company_id TEXT NOT NULL
		)`,
		`CREATE TABLE user_units (
			user_id TEXT NOT NULL,
			unit_id TEXT NOT NULL,
			permissions TEXT DEFAULT '[]'
		)`,
		`CREATE TABLE tenant_roles (
			id TEXT PRIMARY KEY,
			company_id TEXT NOT NULL,
			slug TEXT NOT NULL
		)`,
		`CREATE TABLE user_tenant_roles (
			user_id TEXT NOT NULL,
			company_id TEXT NOT NULL,
			tenant_role_id TEXT NOT NULL
		)`,
		`CREATE TABLE support_report_shares (
			id TEXT PRIMARY KEY,
			support_report_id TEXT NOT NULL,
			shared_with_user_id TEXT NOT NULL,
			granted_by_user_id TEXT NOT NULL,
			created_at DATETIME
		)`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			t.Fatal(err)
		}
	}
	return db
}

// TestSupportReportRepository_ListForUser_tenantIsolation verifies cross-tenant rows are excluded
// unless the viewer has tenant-wide scope or a share row.
func TestSupportReportRepository_ListForUser_tenantIsolation(t *testing.T) {
	t.Parallel()
	db := newSupportReportListTestDB(t)
	r := &supportReportRepository{db: db}

	const (
		companyA = "co-a"
		companyB = "co-b"
		unitA    = "unit-a"
		unitB    = "unit-b"
		userA    = "user-a"
		userB    = "user-b"
		userB2   = "user-b2"
	)
	now := time.Now().UTC().Format(time.RFC3339)

	if err := db.Exec(`INSERT INTO companies (id, name, owner_user_id) VALUES (?, 'A', ''), (?, 'B', '')`, companyA, companyB).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO units (id, company_id) VALUES (?, ?), (?, ?)`, unitA, companyA, unitB, companyB).Error; err != nil {
		t.Fatal(err)
	}
	// userA only in company A; userB and userB2 in company B
	if err := db.Exec(`INSERT INTO user_units (user_id, unit_id) VALUES (?, ?), (?, ?), (?, ?)`,
		userA, unitA, userB, unitB, userB2, unitB).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.Exec(`
INSERT INTO support_reports (id, created_by_user_id, title, created_at, updated_at)
VALUES ('rep-a', ?, 'a', ?, ?),
       ('rep-b', ?, 'b', ?, ?),
       ('rep-b2', ?, 'b2', ?, ?);
`, userA, now, now, userB, now, now, userB2, now, now).Error; err != nil {
		t.Fatal(err)
	}

	// Viewer userB: no tenant-wide companies, no shares — only own report rep-b.
	got, err := r.ListForUser(userB, SupportReportListScope{PlatformWide: false, TenantCompanyIDs: nil})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "rep-b" {
		t.Fatalf("own only: want [rep-b], got %#v", reportIDs(got))
	}

	// Tenant-wide scope for company B: both authors in B → rep-b and rep-b2.
	got2, err := r.ListForUser(userB, SupportReportListScope{PlatformWide: false, TenantCompanyIDs: []string{companyB}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got2) != 2 {
		t.Fatalf("tenant B: want 2 rows, got %#v", reportIDs(got2))
	}
	seen := map[string]bool{}
	for _, x := range got2 {
		seen[x.ID] = true
	}
	if !seen["rep-b"] || !seen["rep-b2"] {
		t.Fatalf("tenant B: expected rep-b and rep-b2, got %#v", reportIDs(got2))
	}

	// Share rep-a to userB.
	if err := db.Exec(`INSERT INTO support_report_shares (id, support_report_id, shared_with_user_id, granted_by_user_id, created_at)
		VALUES ('sh1', 'rep-a', ?, ?, ?)`, userB, userA, now).Error; err != nil {
		t.Fatal(err)
	}
	got3, err := r.ListForUser(userB, SupportReportListScope{PlatformWide: false, TenantCompanyIDs: nil})
	if err != nil {
		t.Fatal(err)
	}
	if len(got3) != 2 {
		t.Fatalf("with share: want 2 rows (own + shared), got %#v", reportIDs(got3))
	}
	seen3 := map[string]bool{}
	for _, x := range got3 {
		seen3[x.ID] = true
	}
	if !seen3["rep-a"] || !seen3["rep-b"] {
		t.Fatalf("with share: want rep-a and rep-b, got %#v", reportIDs(got3))
	}
}

func reportIDs(rows []models.SupportReport) []string {
	out := make([]string, len(rows))
	for i := range rows {
		out[i] = rows[i].ID
	}
	return out
}
