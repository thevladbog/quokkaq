package repository

import (
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newUnitPermCompanyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Exec(`
CREATE TABLE units (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	parent_id TEXT,
	code TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'subdivision',
	sort_order INTEGER DEFAULT 0,
	name TEXT NOT NULL,
	name_en TEXT,
	timezone TEXT NOT NULL DEFAULT 'UTC',
	config TEXT,
	created_at DATETIME,
	updated_at DATETIME
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

func TestUserRepository_UserHasUnitPermissionInCompany(t *testing.T) {
	t.Parallel()
	db := newUnitPermCompanyTestDB(t)
	repo := &userRepository{db: db}

	const (
		co  = "co-1"
		u1  = "unit-1"
		uid = "user-1"
	)

	un := models.Unit{
		ID:        u1,
		CompanyID: co,
		Code:      "m",
		Kind:      models.UnitKindSubdivision,
		Name:      "Main",
		Timezone:  "UTC",
	}
	if err := db.Create(&un).Error; err != nil {
		t.Fatal(err)
	}
	uu := models.UserUnit{
		ID:          "uu1",
		UserID:      uid,
		UnitID:      u1,
		Permissions: models.StringArray{rbac.PermStatisticsRead, "legacy_noise"},
	}
	if err := db.Create(&uu).Error; err != nil {
		t.Fatal(err)
	}

	ok, err := repo.UserHasUnitPermissionInCompany(uid, co, rbac.PermStatisticsRead)
	if err != nil || !ok {
		t.Fatalf("UserHasUnitPermissionInCompany: ok=%v err=%v", ok, err)
	}
	okNo, err := repo.UserHasUnitPermissionInCompany(uid, co, rbac.PermTicketsWrite)
	if err != nil || okNo {
		t.Fatalf("missing perm: ok=%v err=%v", okNo, err)
	}
}
