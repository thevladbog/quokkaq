package repository

import (
	"testing"

	"quokkaq-go-backend/internal/models"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newTemplateRepoTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Exec(`
CREATE TABLE message_templates (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL,
	name TEXT NOT NULL,
	subject TEXT NOT NULL,
	content TEXT NOT NULL,
	is_default INTEGER DEFAULT 0,
	created_at DATETIME,
	updated_at DATETIME
);
`).Error
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestTemplateRepository_scopedByCompany(t *testing.T) {
	t.Parallel()
	db := newTemplateRepoTestDB(t)
	repo := &templateRepository{db: db}

	const (
		companyA = "ca"
		companyB = "cb"
	)
	tA := models.MessageTemplate{
		ID:        "t-a",
		CompanyID: companyA,
		Name:      "A",
		Subject:   "S",
		Content:   "C",
		IsDefault: true,
	}
	tB := models.MessageTemplate{
		ID:        "t-b",
		CompanyID: companyB,
		Name:      "B",
		Subject:   "S",
		Content:   "C",
		IsDefault: true,
	}
	if err := repo.Create(&tA); err != nil {
		t.Fatal(err)
	}
	if err := repo.Create(&tB); err != nil {
		t.Fatal(err)
	}

	listA, err := repo.FindAllByCompany(companyA)
	if err != nil {
		t.Fatal(err)
	}
	if len(listA) != 1 || listA[0].ID != tA.ID {
		t.Fatalf("FindAllByCompany: %#v", listA)
	}
	defA, err := repo.FindDefaultByCompany(companyA)
	if err != nil {
		t.Fatal(err)
	}
	if defA.ID != tA.ID {
		t.Fatalf("FindDefaultByCompany A: %#v", defA)
	}
	defB, err := repo.FindDefaultByCompany(companyB)
	if err != nil {
		t.Fatal(err)
	}
	if defB.ID != tB.ID {
		t.Fatalf("FindDefaultByCompany B: %#v", defB)
	}
}
