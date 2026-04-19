package repository

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/rbac"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newUserSupportReportAccessTestDB(t *testing.T) *gorm.DB {
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
	name TEXT DEFAULT '',
	owner_user_id TEXT DEFAULT ''
);
CREATE TABLE tenant_roles (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	slug TEXT NOT NULL,
	name TEXT DEFAULT ''
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

func TestUserRepository_HasTenantSystemAdminRoleInCompany(t *testing.T) {
	t.Parallel()
	db := newUserSupportReportAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()

	const (
		co     = "company-1"
		roleID = "tr-sys"
		userOK = "u-admin"
		userNo = "u-plain"
	)

	if err := db.Exec(`INSERT INTO companies (id, name) VALUES (?, 'Co')`, co).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO tenant_roles (id, company_id, slug, name) VALUES (?, ?, ?, 'Sys'), ('tr-other', ?, 'staff', 'Staff')`,
		roleID, co, rbac.TenantRoleSlugSystemAdmin, co).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_tenant_roles (id, user_id, company_id, tenant_role_id, created_at) VALUES ('utr1', ?, ?, ?, ?)`,
		userOK, co, roleID, now).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_tenant_roles (id, user_id, company_id, tenant_role_id, created_at) VALUES ('utr2', ?, ?, 'tr-other', ?)`,
		userNo, co, now).Error; err != nil {
		t.Fatal(err)
	}

	ok, err := repo.HasTenantSystemAdminRoleInCompany(userOK, co)
	if err != nil || !ok {
		t.Fatalf("HasTenantSystemAdminRoleInCompany(userOK): ok=%v err=%v", ok, err)
	}
	okNo, err := repo.HasTenantSystemAdminRoleInCompany(userNo, co)
	if err != nil || okNo {
		t.Fatalf("HasTenantSystemAdminRoleInCompany(userNo): ok=%v err=%v", okNo, err)
	}
	okEmpty, err := repo.HasTenantSystemAdminRoleInCompany(userOK, "")
	if err != nil || okEmpty {
		t.Fatalf("empty company id: ok=%v err=%v", okEmpty, err)
	}
}

func TestUserRepository_ListCompanyIDsForSupportReportTenantWideAccess(t *testing.T) {
	t.Parallel()
	db := newUserSupportReportAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()

	const (
		coA    = "co-a"
		coB    = "co-b"
		owner  = "owner-user"
		sysAdm = "sys-admin"
		roleSA = "role-sa"
	)

	if err := db.Exec(`INSERT INTO companies (id, name, owner_user_id) VALUES (?, 'A', ?), (?, 'B', NULL)`,
		coA, owner, coB).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO tenant_roles (id, company_id, slug, name) VALUES (?, ?, ?, 'Sys')`,
		roleSA, coB, rbac.TenantRoleSlugSystemAdmin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_tenant_roles (id, user_id, company_id, tenant_role_id, created_at) VALUES ('utr', ?, ?, ?, ?)`,
		sysAdm, coB, roleSA, now).Error; err != nil {
		t.Fatal(err)
	}

	gotOwner, err := repo.ListCompanyIDsForSupportReportTenantWideAccess(owner)
	if err != nil {
		t.Fatal(err)
	}
	if len(gotOwner) != 1 || gotOwner[0] != coA {
		t.Fatalf("owner: want [%s], got %#v", coA, gotOwner)
	}

	gotSys, err := repo.ListCompanyIDsForSupportReportTenantWideAccess(sysAdm)
	if err != nil {
		t.Fatal(err)
	}
	if len(gotSys) != 1 || gotSys[0] != coB {
		t.Fatalf("system_admin: want [%s], got %#v", coB, gotSys)
	}
}

func TestUserRepository_ListUserIDsWithTenantSystemAdminInCompany(t *testing.T) {
	t.Parallel()
	db := newUserSupportReportAccessTestDB(t)
	repo := &userRepository{db: db}
	now := time.Now().UTC()

	const (
		co     = "c1"
		roleID = "tr-sa"
		u1     = "admin-1"
		u2     = "admin-2"
	)

	if err := db.Exec(`INSERT INTO companies (id, name) VALUES (?, 'X')`, co).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO tenant_roles (id, company_id, slug, name) VALUES (?, ?, ?, 'Sys')`,
		roleID, co, rbac.TenantRoleSlugSystemAdmin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_tenant_roles (id, user_id, company_id, tenant_role_id, created_at) VALUES ('a', ?, ?, ?, ?), ('b', ?, ?, ?, ?)`,
		u1, co, roleID, now, u2, co, roleID, now).Error; err != nil {
		t.Fatal(err)
	}

	ids, err := repo.ListUserIDsWithTenantSystemAdminInCompany(co)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 {
		t.Fatalf("want 2 ids, got %#v", ids)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	if !seen[u1] || !seen[u2] {
		t.Fatalf("missing users: %#v", ids)
	}

	empty, err := repo.ListUserIDsWithTenantSystemAdminInCompany("")
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty company: %#v err=%v", empty, err)
	}
}
