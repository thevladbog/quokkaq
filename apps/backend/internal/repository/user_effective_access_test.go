package repository

import (
	"testing"
	"time"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newEffectiveAccessTestDB(t *testing.T) *gorm.DB {
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

func TestUserHasEffectiveAccess_globalAdmin(t *testing.T) {
	t.Parallel()
	db := newEffectiveAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()
	const uid = "u1"
	if err := db.Exec(`INSERT INTO users (id, name, created_at, is_active) VALUES (?, 'A', ?, 1)`, uid, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO roles (id, name) VALUES ('r-admin', 'admin')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_roles (id, user_id, role_id) VALUES ('ur1', ?, 'r-admin')`, uid).Error; err != nil {
		t.Fatal(err)
	}
	ok, err := repo.UserHasEffectiveAccess(uid)
	if err != nil || !ok {
		t.Fatalf("UserHasEffectiveAccess = %v, %v, want true, nil", ok, err)
	}
}

func TestUserHasEffectiveAccess_noAccess(t *testing.T) {
	t.Parallel()
	db := newEffectiveAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()
	const uid = "u-empty"
	if err := db.Exec(`INSERT INTO users (id, name, created_at, is_active) VALUES (?, 'B', ?, 1)`, uid, now).Error; err != nil {
		t.Fatal(err)
	}
	ok, err := repo.UserHasEffectiveAccess(uid)
	if err != nil || ok {
		t.Fatalf("UserHasEffectiveAccess = %v, %v, want false, nil", ok, err)
	}
}

func TestUserHasEffectiveAccess_tenantRoleRow(t *testing.T) {
	t.Parallel()
	db := newEffectiveAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()
	const uid = "u-tr"
	if err := db.Exec(`INSERT INTO users (id, name, created_at, is_active) VALUES (?, 'C', ?, 1)`, uid, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_tenant_roles (id, user_id, company_id, tenant_role_id, created_at) VALUES ('utr1', ?, 'c1', 'tr1', ?)`, uid, now).Error; err != nil {
		t.Fatal(err)
	}
	ok, err := repo.UserHasEffectiveAccess(uid)
	if err != nil || !ok {
		t.Fatalf("UserHasEffectiveAccess = %v, %v, want true, nil", ok, err)
	}
}

func TestUserHasEffectiveAccess_unitWithPermissions(t *testing.T) {
	t.Parallel()
	db := newEffectiveAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()
	const uid = "u-uu"
	if err := db.Exec(`INSERT INTO users (id, name, created_at, is_active) VALUES (?, 'D', ?, 1)`, uid, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO companies (id, name) VALUES ('c1', 'Co')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO units (id, company_id) VALUES ('un1', 'c1')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_units (id, user_id, unit_id, permissions) VALUES ('uu1', ?, 'un1', '{access.operator}')`, uid).Error; err != nil {
		t.Fatal(err)
	}
	ok, err := repo.UserHasEffectiveAccess(uid)
	if err != nil || !ok {
		t.Fatalf("UserHasEffectiveAccess = %v, %v, want true, nil", ok, err)
	}
}

func TestRecomputeUserIsActive_setsInactive(t *testing.T) {
	t.Parallel()
	db := newEffectiveAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()
	const uid = "u-block"
	if err := db.Exec(`INSERT INTO users (id, name, created_at, is_active) VALUES (?, 'E', ?, 1)`, uid, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := repo.RecomputeUserIsActive(uid); err != nil {
		t.Fatal(err)
	}
	var active int
	if err := db.Raw(`SELECT is_active FROM users WHERE id = ?`, uid).Scan(&active).Error; err != nil {
		t.Fatal(err)
	}
	if active != 0 {
		t.Fatalf("is_active = %d, want 0", active)
	}
}
