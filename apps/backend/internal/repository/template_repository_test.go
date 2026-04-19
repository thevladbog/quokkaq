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
CREATE UNIQUE INDEX uq_message_templates_company_default ON message_templates (company_id) WHERE is_default = 1;
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

func TestTemplateRepository_CreateWithDefaultPromotion_replacesPriorDefault(t *testing.T) {
	t.Parallel()
	db := newTemplateRepoTestDB(t)
	repo := &templateRepository{db: db}

	const companyID = "c1"
	first := models.MessageTemplate{
		ID:        "t1",
		CompanyID: companyID,
		Name:      "First",
		Subject:   "S",
		Content:   "C",
		IsDefault: true,
	}
	if err := repo.CreateWithDefaultPromotion(companyID, &first); err != nil {
		t.Fatal(err)
	}
	second := models.MessageTemplate{
		ID:        "t2",
		CompanyID: companyID,
		Name:      "Second",
		Subject:   "S",
		Content:   "C",
		IsDefault: true,
	}
	if err := repo.CreateWithDefaultPromotion(companyID, &second); err != nil {
		t.Fatal(err)
	}
	var t1, t2 models.MessageTemplate
	if err := db.First(&t1, "id = ?", "t1").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&t2, "id = ?", "t2").Error; err != nil {
		t.Fatal(err)
	}
	if t1.IsDefault {
		t.Fatalf("first template should no longer be default: %#v", t1)
	}
	if !t2.IsDefault {
		t.Fatalf("second template should be default: %#v", t2)
	}
	def, err := repo.FindDefaultByCompany(companyID)
	if err != nil {
		t.Fatal(err)
	}
	if def.ID != "t2" {
		t.Fatalf("FindDefaultByCompany: got %q", def.ID)
	}
}

func TestTemplateRepository_partialUniqueIndex_blocksTwoDefaults(t *testing.T) {
	t.Parallel()
	db := newTemplateRepoTestDB(t)
	repo := &templateRepository{db: db}

	const companyID = "c1"
	a := models.MessageTemplate{ID: "a", CompanyID: companyID, Name: "A", Subject: "S", Content: "C", IsDefault: true}
	b := models.MessageTemplate{ID: "b", CompanyID: companyID, Name: "B", Subject: "S", Content: "C", IsDefault: true}
	if err := repo.Create(&a); err != nil {
		t.Fatal(err)
	}
	if err := repo.Create(&b); err == nil {
		t.Fatal("expected unique index violation on second default row")
	}
}
