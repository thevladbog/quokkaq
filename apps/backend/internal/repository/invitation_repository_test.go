package repository

import (
	"errors"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newInvitationRepoTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Exec(`
CREATE TABLE invitations (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	token TEXT NOT NULL UNIQUE,
	status TEXT DEFAULT 'active',
	expires_at DATETIME NOT NULL,
	user_id TEXT UNIQUE,
	email TEXT NOT NULL,
	created_at DATETIME,
	updated_at DATETIME,
	target_units TEXT,
	target_roles TEXT
);
`).Error
	if err != nil {
		t.Fatal(err)
	}
	return db
}

// TestInvitationRepository_sameEmailTwoTenants verifies two concurrent active invites for the same
// email in different companies: scoped lookups are per-tenant; token resolves the correct row.
func TestInvitationRepository_sameEmailTwoTenants(t *testing.T) {
	t.Parallel()
	db := newInvitationRepoTestDB(t)
	repo := &invitationRepository{db: db}

	const (
		companyA = "company-a"
		companyB = "company-b"
		email    = "same@example.com"
	)
	future := time.Now().UTC().Add(24 * time.Hour)

	invA := models.Invitation{
		ID:        "inv-a",
		CompanyID: companyA,
		Token:     "tok-secret-a",
		Status:    "active",
		ExpiresAt: future,
		Email:     email,
	}
	invB := models.Invitation{
		ID:        "inv-b",
		CompanyID: companyB,
		Token:     "tok-secret-b",
		Status:    "active",
		ExpiresAt: future,
		Email:     email,
	}
	if err := repo.Create(&invA); err != nil {
		t.Fatal(err)
	}
	if err := repo.Create(&invB); err != nil {
		t.Fatal(err)
	}

	gotA, err := repo.FindActiveByCompanyAndEmail(companyA, email)
	if err != nil {
		t.Fatal(err)
	}
	if gotA.ID != invA.ID || gotA.CompanyID != companyA {
		t.Fatalf("company A invite: got %#v", gotA)
	}
	gotB, err := repo.FindActiveByCompanyAndEmail(companyB, email)
	if err != nil {
		t.Fatal(err)
	}
	if gotB.ID != invB.ID || gotB.CompanyID != companyB {
		t.Fatalf("company B invite: got %#v", gotB)
	}

	byTokA, err := repo.FindByToken("tok-secret-a")
	if err != nil {
		t.Fatal(err)
	}
	if byTokA.CompanyID != companyA || byTokA.Email != email {
		t.Fatalf("FindByToken A: %#v", byTokA)
	}
	byTokB, err := repo.FindByToken("tok-secret-b")
	if err != nil {
		t.Fatal(err)
	}
	if byTokB.CompanyID != companyB {
		t.Fatalf("FindByToken B: %#v", byTokB)
	}

	listA, err := repo.FindAllByCompany(companyA)
	if err != nil {
		t.Fatal(err)
	}
	if len(listA) != 1 || listA[0].ID != invA.ID {
		t.Fatalf("FindAllByCompany A: %#v", listA)
	}
}

func TestInvitationRepository_FindActiveByCompanyAndEmail_ignoresExpired(t *testing.T) {
	t.Parallel()
	db := newInvitationRepoTestDB(t)
	repo := &invitationRepository{db: db}

	const companyID = "c1"
	email := "u@x.com"
	past := time.Now().UTC().Add(-2 * time.Hour)

	expired := models.Invitation{
		ID:        "inv-exp",
		CompanyID: companyID,
		Token:     "tok-exp",
		Status:    "active",
		ExpiresAt: past,
		Email:     email,
	}
	if err := repo.Create(&expired); err != nil {
		t.Fatal(err)
	}
	_, err := repo.FindActiveByCompanyAndEmail(companyID, email)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected ErrRecordNotFound, got %v", err)
	}
}
