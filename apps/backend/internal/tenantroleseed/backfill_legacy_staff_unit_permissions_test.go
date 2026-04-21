package tenantroleseed

import (
	"slices"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func openBackfillTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Exec(`
CREATE TABLE roles (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL
);
CREATE TABLE user_roles (
	user_id TEXT NOT NULL,
	role_id TEXT NOT NULL
);
CREATE TABLE users (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL DEFAULT ''
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

func TestBackfillLegacyStaffSupervisorOperatorUnitPermissions_operator(t *testing.T) {
	t.Parallel()
	db := openBackfillTestDB(t)

	const (
		rStaff  = "role-staff"
		rOper   = "role-op"
		uStaff  = "u-staff"
		uOper   = "u-op"
		uuStaff = "uu-staff"
		uuOper  = "uu-op"
		unit    = "unit-1"
	)
	if err := db.Exec(`INSERT INTO roles (id, name) VALUES (?, 'staff'), (?, 'operator')`, rStaff, rOper).Error; err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		id, name string
	}{
		{uStaff, "Staff"},
		{uOper, "Op"},
	} {
		if err := db.Exec(`INSERT INTO users (id, name) VALUES (?, ?)`, row.id, row.name).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Exec(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?), (?, ?)`,
		uStaff, rStaff, uOper, rOper).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_units (id, user_id, unit_id, permissions) VALUES (?, ?, ?, NULL), (?, ?, ?, NULL)`,
		uuStaff, uStaff, unit, uuOper, uOper, unit).Error; err != nil {
		t.Fatal(err)
	}

	if err := BackfillLegacyStaffSupervisorOperatorUnitPermissions(db); err != nil {
		t.Fatal(err)
	}

	var staffUU models.UserUnit
	if err := db.Where("id = ?", uuStaff).First(&staffUU).Error; err != nil {
		t.Fatal(err)
	}
	wantStaff := append(append([]string{}, rbac.DefaultInvitationUnitPermissions()...), rbac.PermSupportReports)
	slices.Sort(wantStaff)
	gotStaff := []string(staffUU.Permissions)
	slices.Sort(gotStaff)
	if !slices.Equal(gotStaff, wantStaff) {
		t.Fatalf("staff perms %v want %v", gotStaff, wantStaff)
	}

	var opUU models.UserUnit
	if err := db.Where("id = ?", uuOper).First(&opUU).Error; err != nil {
		t.Fatal(err)
	}
	gotOp := []string(opUU.Permissions)
	slices.Sort(gotOp)
	if !slices.Equal(gotOp, wantStaff) {
		t.Fatalf("operator perms %v want %v", gotOp, wantStaff)
	}
}

func TestBackfillLegacyStaffSupervisorOperatorUnitPermissions_supervisor(t *testing.T) {
	t.Parallel()
	db := openBackfillTestDB(t)

	const (
		rSup  = "role-sup"
		uSup  = "u-sup"
		uuSup = "uu-sup"
		unit  = "unit-x"
	)
	if err := db.Exec(`INSERT INTO roles (id, name) VALUES (?, 'supervisor')`, rSup).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO users (id, name) VALUES (?, 'S')`, uSup).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, uSup, rSup).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO user_units (id, user_id, unit_id, permissions) VALUES (?, ?, ?, NULL)`, uuSup, uSup, unit).Error; err != nil {
		t.Fatal(err)
	}
	if err := BackfillLegacyStaffSupervisorOperatorUnitPermissions(db); err != nil {
		t.Fatal(err)
	}
	var uu models.UserUnit
	if err := db.Where("id = ?", uuSup).First(&uu).Error; err != nil {
		t.Fatal(err)
	}
	want := append(append([]string{}, rbac.DefaultInvitationUnitPermissions()...), rbac.PermAccessSupervisorPanel, rbac.PermSupportReports)
	slices.Sort(want)
	got := []string(uu.Permissions)
	slices.Sort(got)
	if !slices.Equal(got, want) {
		t.Fatalf("supervisor perms %v want %v", got, want)
	}
}
