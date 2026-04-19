package repository

import (
	"testing"
	"time"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newListUsersForCompanyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Exec(`
CREATE TABLE users (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT,
	type TEXT DEFAULT 'human',
	phone TEXT,
	photo_url TEXT,
	password TEXT,
	is_active INTEGER DEFAULT 1,
	exempt_from_sso_sync INTEGER DEFAULT 0,
	sso_profile_sync_opt_out INTEGER DEFAULT 0,
	created_at DATETIME
);
CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE user_roles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role_id TEXT NOT NULL);
CREATE TABLE companies (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT,
	owner_user_id TEXT
);
CREATE TABLE units (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	code TEXT NOT NULL DEFAULT 'u',
	kind TEXT NOT NULL DEFAULT 'subdivision',
	name TEXT NOT NULL DEFAULT 'Unit',
	timezone TEXT NOT NULL DEFAULT 'UTC'
);
CREATE TABLE user_units (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	unit_id TEXT NOT NULL,
	permissions TEXT
);
CREATE TABLE user_tenant_roles (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	company_id TEXT NOT NULL,
	tenant_role_id TEXT NOT NULL,
	created_at DATETIME
);
`).Error
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestListUsersForCompany_includesGlobalAdminWithoutUnitsOrTenantRoles(t *testing.T) {
	t.Parallel()
	db := newListUsersForCompanyTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()

	const (
		companyID = "c-1"
		adminID   = "user-global-admin"
		roleID    = "role-admin"
	)
	if err := db.Exec(`INSERT INTO users (id, name, email, created_at) VALUES (?, 'Admin', 'a@x', ?)`, adminID, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO roles (id, name) VALUES (?, 'admin')`, roleID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_roles (id, user_id, role_id) VALUES ('ur1', ?, ?)`, adminID, roleID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO companies (id, name, owner_user_id) VALUES (?, 'Co', NULL)`, companyID).Error; err != nil {
		t.Fatal(err)
	}

	got, err := repo.ListUsersForCompany(companyID, "", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != adminID {
		t.Fatalf("users = %#v, want one user %q", got, adminID)
	}
	gotNoGlobal, err := repo.ListUsersForCompany(companyID, "", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(gotNoGlobal) != 0 {
		t.Fatalf("with includeGlobalRoleUsers=false, want no users, got %#v", gotNoGlobal)
	}
}

func TestListUsersForCompany_includesCompanyOwnerWithoutUnits(t *testing.T) {
	t.Parallel()
	db := newListUsersForCompanyTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()

	const (
		companyID = "c-own"
		ownerID   = "user-owner"
	)
	if err := db.Exec(`INSERT INTO users (id, name, email, created_at) VALUES (?, 'Owner', 'o@x', ?)`, ownerID, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO companies (id, name, owner_user_id) VALUES (?, 'Owned', ?)`, companyID, ownerID).Error; err != nil {
		t.Fatal(err)
	}

	got, err := repo.ListUsersForCompany(companyID, "", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != ownerID {
		t.Fatalf("users = %#v, want one user %q", got, ownerID)
	}
}

func TestHasCompanyAccess_userTenantRolesWithoutUnits(t *testing.T) {
	t.Parallel()
	db := newListUsersForCompanyTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()

	const (
		companyID = "c-utr"
		userID    = "user-tenant-only"
		roleID    = "tr-1"
	)
	if err := db.Exec(`INSERT INTO users (id, name, email, created_at) VALUES (?, 'U', 'u@x', ?)`, userID, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO companies (id, name, owner_user_id) VALUES (?, 'Co', NULL)`, companyID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_tenant_roles (id, user_id, company_id, tenant_role_id, created_at) VALUES ('utr1', ?, ?, ?, ?)`,
		userID, companyID, roleID, now).Error; err != nil {
		t.Fatal(err)
	}

	ok, err := repo.HasCompanyAccess(userID, companyID)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("HasCompanyAccess: want true when user has user_tenant_roles row but no user_units")
	}
}
