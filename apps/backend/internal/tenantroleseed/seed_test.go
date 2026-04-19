package tenantroleseed

import (
	"slices"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func openSeedTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	// SQLite has no gen_random_uuid()/now() defaults like Postgres; use explicit DDL for in-memory tests.
	err = db.Exec(`
CREATE TABLE companies (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT,
	created_at DATETIME,
	updated_at DATETIME
);
CREATE TABLE units (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	parent_id TEXT,
	code TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'subdivision',
	sort_order INTEGER DEFAULT 0,
	name TEXT NOT NULL,
	name_en TEXT,
	timezone TEXT NOT NULL,
	created_at DATETIME,
	updated_at DATETIME
);
CREATE TABLE users (
	id TEXT PRIMARY KEY,
	type TEXT DEFAULT 'human',
	email TEXT,
	phone TEXT,
	name TEXT NOT NULL,
	photo_url TEXT,
	password TEXT,
	is_active INTEGER DEFAULT 1,
	exempt_from_sso_sync INTEGER DEFAULT 0,
	sso_profile_sync_opt_out INTEGER DEFAULT 0,
	created_at DATETIME
);
CREATE TABLE tenant_roles (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	name TEXT NOT NULL,
	slug TEXT NOT NULL,
	description TEXT,
	created_at DATETIME,
	updated_at DATETIME
);
CREATE TABLE tenant_role_units (
	id TEXT PRIMARY KEY,
	tenant_role_id TEXT NOT NULL,
	unit_id TEXT NOT NULL,
	permissions TEXT,
	UNIQUE (tenant_role_id, unit_id)
);
CREATE TABLE user_tenant_roles (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	company_id TEXT NOT NULL,
	tenant_role_id TEXT NOT NULL,
	created_at DATETIME
);
CREATE TABLE user_units (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	unit_id TEXT NOT NULL,
	permissions TEXT
);
`).Error
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestEnsureSystemTenantRole_createsRoleAndTRUsForAllUnits(t *testing.T) {
	t.Parallel()
	db := openSeedTestDB(t)
	const cid = "company-seed-1"
	if err := db.Select("ID", "Name", "Slug").Create(&models.Company{ID: cid, Name: "Co", Slug: "co-seed"}).Error; err != nil {
		t.Fatal(err)
	}
	const u1, u2 = "unit-a", "unit-b"
	for _, uid := range []string{u1, u2} {
		if err := db.Select("ID", "CompanyID", "Code", "Kind", "Name", "Timezone").Create(&models.Unit{
			ID:        uid,
			CompanyID: cid,
			Code:      uid,
			Kind:      models.UnitKindSubdivision,
			Name:      uid,
			Timezone:  "UTC",
		}).Error; err != nil {
			t.Fatal(err)
		}
	}

	var roleID string
	if err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		roleID, err = EnsureSystemTenantRole(tx, cid)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if roleID == "" {
		t.Fatal("empty role id")
	}

	var tr models.TenantRole
	if err := db.Where("id = ?", roleID).First(&tr).Error; err != nil {
		t.Fatal(err)
	}
	if tr.Slug != rbac.TenantRoleSlugSystemAdmin || tr.CompanyID != cid {
		t.Fatalf("tenant role %+v", tr)
	}

	var trus []models.TenantRoleUnit
	if err := db.Where("tenant_role_id = ?", roleID).Find(&trus).Error; err != nil {
		t.Fatal(err)
	}
	if len(trus) != 2 {
		t.Fatalf("TRU count %d", len(trus))
	}
	wantPerms := rbac.All()
	for _, tru := range trus {
		if tru.UnitID != u1 && tru.UnitID != u2 {
			t.Fatalf("unexpected unit %s", tru.UnitID)
		}
		got := []string(tru.Permissions)
		slices.Sort(got)
		w := append([]string(nil), wantPerms...)
		slices.Sort(w)
		if !slices.Equal(got, w) {
			t.Fatalf("unit %s perms %v want %v", tru.UnitID, got, w)
		}
	}
}

func TestEnsureSystemTenantRole_idempotentSecondCall(t *testing.T) {
	t.Parallel()
	db := openSeedTestDB(t)
	const cid = "company-seed-2"
	if err := db.Select("ID", "Name", "Slug").Create(&models.Company{ID: cid, Name: "Co2", Slug: "co2"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("ID", "CompanyID", "Code", "Kind", "Name", "Timezone").Create(&models.Unit{
		ID: "u-only", CompanyID: cid, Code: "x", Kind: models.UnitKindSubdivision, Name: "X", Timezone: "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	var first, second string
	if err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		first, err = EnsureSystemTenantRole(tx, cid)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		second, err = EnsureSystemTenantRole(tx, cid)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("role id changed %q -> %q", first, second)
	}
	var n int64
	if err := db.Model(&models.TenantRole{}).Where("company_id = ? AND slug = ?", cid, rbac.TenantRoleSlugSystemAdmin).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("system roles count %d", n)
	}
}

func TestRebuildUserUnitsFromTenantRoles_rebuildsFromTRU(t *testing.T) {
	t.Parallel()
	db := openSeedTestDB(t)
	const (
		cid  = "co-rebuild"
		u1   = "unit-r1"
		u2   = "unit-r2"
		uid  = "user-rebuild"
		role = "role-custom"
	)
	if err := db.Select("ID", "Name", "Slug").Create(&models.Company{ID: cid, Name: "C", Slug: "c"}).Error; err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{u1, u2} {
		if err := db.Select("ID", "CompanyID", "Code", "Kind", "Name", "Timezone").Create(&models.Unit{
			ID: id, CompanyID: cid, Code: id, Kind: models.UnitKindSubdivision, Name: id, Timezone: "UTC",
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Select("ID", "Name").Create(&models.User{ID: uid, Name: "U"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("ID", "CompanyID", "Name", "Slug").Create(&models.TenantRole{
		ID: role, CompanyID: cid, Name: "Op", Slug: "operator",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("TenantRoleID", "UnitID", "Permissions").Create(&models.TenantRoleUnit{
		TenantRoleID: role,
		UnitID:       u1,
		Permissions:  models.StringArray{"access.operator", "tickets.view"},
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("UserID", "CompanyID", "TenantRoleID").Create(&models.UserTenantRole{
		UserID: uid, CompanyID: cid, TenantRoleID: role,
	}).Error; err != nil {
		t.Fatal(err)
	}
	// Stale row on u2 — should be removed after rebuild
	if err := db.Select("ID", "UserID", "UnitID", "Permissions").Create(&models.UserUnit{
		ID: "uu-stale", UserID: uid, UnitID: u2, Permissions: models.StringArray{"stale"},
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.Transaction(func(tx *gorm.DB) error {
		return RebuildUserUnitsFromTenantRoles(tx, uid, cid)
	}); err != nil {
		t.Fatal(err)
	}

	var uus []models.UserUnit
	if err := db.Where("user_id = ?", uid).Find(&uus).Error; err != nil {
		t.Fatal(err)
	}
	if len(uus) != 1 {
		t.Fatalf("user_units count %d", len(uus))
	}
	if uus[0].UnitID != u1 {
		t.Fatalf("unit id %s", uus[0].UnitID)
	}
	got := []string(uus[0].Permissions)
	slices.Sort(got)
	want := []string{"access.operator", "tickets.view"}
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("permissions %v want %v", got, want)
	}
}

func TestRebuildUserUnitsFromTenantRoles_noRolesClearsUnits(t *testing.T) {
	t.Parallel()
	db := openSeedTestDB(t)
	const cid, uid, u1 = "co-clear", "user-clear", "unit-clear"
	if err := db.Select("ID", "Name", "Slug").Create(&models.Company{ID: cid, Name: "C", Slug: "cc"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("ID", "CompanyID", "Code", "Kind", "Name", "Timezone").Create(&models.Unit{
		ID: u1, CompanyID: cid, Code: "c", Kind: models.UnitKindSubdivision, Name: "U", Timezone: "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("ID", "Name").Create(&models.User{ID: uid, Name: "U"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Select("ID", "UserID", "UnitID", "Permissions").Create(&models.UserUnit{
		ID: "uu-orphan", UserID: uid, UnitID: u1, Permissions: models.StringArray{"orphan"},
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.Transaction(func(tx *gorm.DB) error {
		return RebuildUserUnitsFromTenantRoles(tx, uid, cid)
	}); err != nil {
		t.Fatal(err)
	}

	var n int64
	if err := db.Model(&models.UserUnit{}).Where("user_id = ?", uid).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("expected no user_units, got %d", n)
	}
}
