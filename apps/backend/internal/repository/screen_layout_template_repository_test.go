package repository

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

type terminalAcknowledgementInterleaveLogger struct {
	gormlogger.Interface
	afterTerminalRead func()
	once              sync.Once
}

func (l *terminalAcknowledgementInterleaveLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	sql, rows := fc()
	l.Interface.Trace(ctx, begin, func() (string, int64) { return sql, rows }, err)
	if err == nil && strings.Contains(strings.ToLower(sql), "from \"desktop_terminals\"") && strings.Contains(strings.ToLower(sql), "for update") {
		l.once.Do(l.afterTerminalRead)
	}
}

func repositoryDefinition(id, variant string) json.RawMessage {
	return json.RawMessage(`{
		"schemaVersion":1,
		"id":"` + id + `",
		"surface":"ticket-station",
		"startPageId":"start",
		"variants":[{
			"id":"` + variant + `",
			"profile":{"id":"profile","name":"Profile","width":820,"height":1180,"interactionMode":"touch","viewingDistance":"near","safeArea":{"top":0,"right":0,"bottom":0,"left":0}},
			"grid":{"columns":10,"rows":10}
		}],
		"pages":[{
			"id":"start","name":"Start",
			"widgets":[{"id":"catalog","type":"service-picker","config":{},"actions":[]}],
			"layouts":{"` + variant + `":{"placements":{"catalog":{"col":1,"row":1,"colSpan":10,"rowSpan":10}}}}
		}],
		"flowPages":{"serviceCatalogPageId":"start"}
	}`)
}

func newExperienceRepositorySQLite(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`PRAGMA foreign_keys = ON;`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE users (
	id text PRIMARY KEY
);
CREATE TABLE units (
	id text PRIMARY KEY,
	company_id text NOT NULL
);
CREATE TABLE screen_layout_templates (
	id text PRIMARY KEY,
	company_id text NOT NULL,
	name text NOT NULL,
	definition text NOT NULL,
	surface text NOT NULL DEFAULT 'queue-display',
	published_version_id text,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE experience_template_versions (
	id text PRIMARY KEY,
	template_id text NOT NULL,
	version integer NOT NULL,
	definition text NOT NULL,
	published_by text,
	published_at datetime NOT NULL,
	CONSTRAINT uq_experience_template_versions_template_version UNIQUE (template_id, version),
	CONSTRAINT uq_experience_template_versions_template_id_id UNIQUE (template_id, id),
	CONSTRAINT fk_experience_template_versions_template FOREIGN KEY (template_id) REFERENCES screen_layout_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_experience_template_versions_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE desktop_terminals (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	counter_id text,
	kind text NOT NULL,
	name text,
	default_locale text NOT NULL,
	kiosk_fullscreen integer NOT NULL DEFAULT 0,
	experience_template_id text,
	experience_variant_id text,
	applied_template_version_id text,
	applied_template_at datetime,
	experience_ack_status text,
	experience_ack_reason_code text,
	experience_ack_at datetime,
	revoked_at datetime,
	updated_at datetime,
	CONSTRAINT chk_desktop_terminal_experience_assignment_pair CHECK ((experience_template_id IS NULL AND experience_variant_id IS NULL) OR (experience_template_id IS NOT NULL AND experience_variant_id IS NOT NULL)),
	CONSTRAINT fk_desktop_terminal_experience_template FOREIGN KEY (experience_template_id) REFERENCES screen_layout_templates(id) ON DELETE RESTRICT,
	CONSTRAINT fk_desktop_terminal_applied_experience_version FOREIGN KEY (experience_template_id, applied_template_version_id) REFERENCES experience_template_versions(template_id, id)
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func seedExperienceRepository(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec(`
INSERT INTO users (id) VALUES ('publisher');
INSERT INTO units (id, company_id) VALUES ('unit-a', 'company-a'), ('unit-b', 'company-b');
INSERT INTO screen_layout_templates (id, company_id, name, definition, surface)
VALUES
	('template-a', 'company-a', 'A', ?, 'ticket-station'),
	('template-b', 'company-b', 'B', ?, 'ticket-station'),
	('template-unpublished', 'company-a', 'Unpublished', ?, 'ticket-station');
INSERT INTO desktop_terminals (
	id, unit_id, kind, default_locale, kiosk_fullscreen,
	experience_ack_status, experience_ack_reason_code, experience_ack_at
) VALUES
	('terminal-a', 'unit-a', 'kiosk', 'en', 0, 'rejected', 'old_reason', CURRENT_TIMESTAMP),
	('terminal-counter', 'unit-a', 'counter_board', 'en', 0, NULL, NULL, NULL);
`, repositoryDefinition("draft-a", "portrait"), repositoryDefinition("draft-b", "portrait"), repositoryDefinition("draft-u", "portrait")).Error; err != nil {
		t.Fatal(err)
	}
}

func TestScreenLayoutTemplateRepository_PublishRestoreAreAtomicAndImmutable(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()

	v1, err := repo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v1: %v", err)
	}
	if v1.Version != 1 || string(v1.Definition) != string(repositoryDefinition("draft-a", "portrait")) {
		t.Fatalf("v1 = %#v", v1)
	}

	row, err := repo.GetByIDAndCompany("template-a", "company-a")
	if err != nil {
		t.Fatal(err)
	}
	row.Definition = repositoryDefinition("draft-b", "portrait")
	if err := repo.Update(row); err != nil {
		t.Fatal(err)
	}
	v2, err := repo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v2: %v", err)
	}
	if v2.Version != 2 {
		t.Fatalf("v2 version = %d", v2.Version)
	}

	v3, err := repo.Restore(ctx, "company-a", "template-a", v1.ID, "publisher")
	if err != nil {
		t.Fatalf("restore v1: %v", err)
	}
	if v3.Version != 3 || string(v3.Definition) != string(v1.Definition) {
		t.Fatalf("v3 = %#v, want copied v1 definition", v3)
	}
	if v3.ID == v1.ID {
		t.Fatal("restore moved pointer to historical row instead of creating a new version")
	}

	versions, err := repo.ListVersions(ctx, "company-a", "template-a", nil, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(versions.Items) != 3 || versions.Items[0].Version != 3 || versions.Items[1].Version != 2 || versions.Items[2].Version != 1 || versions.HasMore || versions.NextBeforeVersion != nil {
		t.Fatalf("versions = %#v", versions)
	}
	var historical []models.ExperienceTemplateVersion
	if err := db.Where("template_id = ?", "template-a").Order("version ASC").Find(&historical).Error; err != nil {
		t.Fatal(err)
	}
	if string(historical[0].Definition) != string(repositoryDefinition("draft-a", "portrait")) || string(historical[1].Definition) != string(repositoryDefinition("draft-b", "portrait")) {
		t.Fatalf("historical definitions mutated: %#v", historical)
	}

	row, err = repo.GetByIDAndCompany("template-a", "company-a")
	if err != nil {
		t.Fatal(err)
	}
	row.Definition = json.RawMessage(`[]`)
	if err := repo.Update(row); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Publish(ctx, "company-a", "template-a", "publisher"); err == nil {
		t.Fatal("invalid publish unexpectedly succeeded")
	}
	var count int64
	if err := db.Model(&models.ExperienceTemplateVersion{}).Where("template_id = ?", "template-a").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("failed publish left %d versions, want 3", count)
	}
	row, err = repo.GetByIDAndCompany("template-a", "company-a")
	if err != nil {
		t.Fatal(err)
	}
	if row.PublishedVersionID == nil || *row.PublishedVersionID != v3.ID {
		t.Fatalf("failed publish changed pointer to %v, want %s", row.PublishedVersionID, v3.ID)
	}
}

func TestScreenLayoutTemplateRepository_TenantScopesVersionOperations(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()

	if _, err := repo.Publish(ctx, "company-b", "template-a", "publisher"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-tenant publish error = %v, want record not found", err)
	}
	v1, err := repo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Restore(ctx, "company-b", "template-a", v1.ID, "publisher"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-tenant restore error = %v, want record not found", err)
	}
	if versions, err := repo.ListVersions(ctx, "company-b", "template-a", nil, 20); !errors.Is(err, gorm.ErrRecordNotFound) || versions != nil {
		t.Fatalf("cross-tenant versions = %#v, %v", versions, err)
	}
}

func TestScreenLayoutTemplateRepository_PublisherDeletionPreservesVersion(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	version, err := repo.Publish(context.Background(), "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	if version.PublishedBy == nil || *version.PublishedBy != "publisher" {
		t.Fatalf("publisher = %v", version.PublishedBy)
	}
	if err := db.Exec(`DELETE FROM users WHERE id = 'publisher'`).Error; err != nil {
		t.Fatal(err)
	}
	var stored models.ExperienceTemplateVersion
	if err := db.First(&stored, "id = ?", version.ID).Error; err != nil {
		t.Fatalf("version was not preserved: %v", err)
	}
	if stored.PublishedBy != nil {
		t.Fatalf("deleted publisher remained on version: %v", stored.PublishedBy)
	}

	systemVersion, err := repo.Publish(context.Background(), "company-a", "template-a", "")
	if err != nil {
		t.Fatal(err)
	}
	if systemVersion.PublishedBy != nil {
		t.Fatalf("system publish publisher = %v, want nil", systemVersion.PublishedBy)
	}
}

func TestScreenLayoutTemplateRepository_DeleteRejectsAssignedTemplate(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"experience_template_id": "template-a",
		"experience_variant_id":  "portrait",
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := repo.Delete("template-a", "company-a"); !errors.Is(err, ErrExperienceTemplateAssigned) {
		t.Fatalf("assigned delete error = %v, want ErrExperienceTemplateAssigned", err)
	}
	if _, err := repo.GetByIDAndCompany("template-a", "company-a"); err != nil {
		t.Fatalf("assigned template was deleted: %v", err)
	}
	if err := repo.Delete("template-unpublished", "company-a"); err != nil {
		t.Fatalf("unassigned delete: %v", err)
	}
	if _, err := repo.GetByIDAndCompany("template-unpublished", "company-a"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("unassigned template still exists: %v", err)
	}
	if err := repo.Delete("template-b", "company-a"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-tenant delete error = %v", err)
	}
	if _, err := repo.GetByIDAndCompany("template-b", "company-b"); err != nil {
		t.Fatalf("cross-tenant template was deleted: %v", err)
	}
}

func TestExperienceAssignmentForeignKeyViolationMapping(t *testing.T) {
	if !isExperienceAssignmentForeignKeyViolation(&pgconn.PgError{Code: "23503", ConstraintName: "fk_desktop_terminal_experience_template"}) {
		t.Fatal("assignment FK violation was not recognized")
	}
	if isExperienceAssignmentForeignKeyViolation(&pgconn.PgError{Code: "23503", ConstraintName: "some_other_fk"}) {
		t.Fatal("unrelated FK violation was mapped to template assigned")
	}
}

func TestScreenLayoutTemplateRepository_ListVersionsIsMetadataOnlyAndCursorPaginated(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()
	for version := 1; version <= 25; version++ {
		publisher := "publisher"
		row := models.ExperienceTemplateVersion{
			ID: "version-" + string(rune(0x1000+version)), TemplateID: "template-a", Version: version,
			Definition: repositoryDefinition("historical", "portrait"), PublishedBy: &publisher, PublishedAt: time.Unix(int64(version), 0).UTC(),
		}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}

	var versionQueries []string
	if err := db.Callback().Row().After("gorm:row").Register("test:capture-version-select", func(tx *gorm.DB) {
		sql := tx.Statement.SQL.String()
		if strings.Contains(sql, "experience_template_versions") {
			versionQueries = append(versionQueries, sql)
		}
	}); err != nil {
		t.Fatal(err)
	}

	first, err := repo.ListVersions(ctx, "company-a", "template-a", nil, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 10 || first.Items[0].Version != 25 || first.Items[9].Version != 16 || !first.HasMore || first.NextBeforeVersion == nil || *first.NextBeforeVersion != 16 {
		t.Fatalf("first page = %#v", first)
	}
	before := *first.NextBeforeVersion
	second, err := repo.ListVersions(ctx, "company-a", "template-a", &before, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 10 || second.Items[0].Version != 15 || second.Items[9].Version != 6 || !second.HasMore || second.NextBeforeVersion == nil || *second.NextBeforeVersion != 6 {
		t.Fatalf("second page = %#v", second)
	}
	before = *second.NextBeforeVersion
	last, err := repo.ListVersions(ctx, "company-a", "template-a", &before, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(last.Items) != 5 || last.Items[0].Version != 5 || last.Items[4].Version != 1 || last.HasMore || last.NextBeforeVersion != nil {
		t.Fatalf("last page = %#v", last)
	}
	if len(versionQueries) == 0 {
		t.Fatal("version history query was not captured")
	}
	for _, query := range versionQueries {
		projection, _, found := strings.Cut(query, " FROM ")
		if !found || strings.Contains(strings.ToLower(projection), "definition") || strings.Contains(projection, "*") {
			t.Fatalf("version history selected a definition-bearing projection: %s", query)
		}
	}
}

func TestScreenLayoutTemplateRepository_RuntimeResolutionRequiresTemplateCompanyCompatibility(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()

	v, err := repo.Publish(ctx, "company-b", "template-b", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"experience_template_id": "template-b",
		"experience_variant_id":  "portrait",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if resolved, variant, err := repo.ResolveTerminalPublishedVersion(ctx, "company-a", "terminal-a"); !errors.Is(err, gorm.ErrRecordNotFound) || resolved != nil || variant != "" {
		t.Fatalf("cross-company corrupted assignment resolved version=%#v variant=%q err=%v (foreign version %q)", resolved, variant, err, v.ID)
	}
}

func TestScreenLayoutTemplateRepository_RuntimeResolutionFailsClosedForIncompatibleTerminalAssignment(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()
	if _, err := repo.Publish(ctx, "company-a", "template-a", "publisher"); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"kind":                   models.DesktopTerminalKindCounterBoard,
		"experience_template_id": "template-a",
		"experience_variant_id":  "portrait",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if version, variant, err := repo.ResolveTerminalPublishedVersion(ctx, "company-a", "terminal-a"); !errors.Is(err, ErrExperienceAssignmentIncompatible) || version != nil || variant != "" {
		t.Fatalf("incompatible terminal assignment resolved version=%#v variant=%q err=%v", version, variant, err)
	}
}

func TestExperienceRepository_AssignmentIsAtomicAndPublishedOnly(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()
	v1, err := repo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}

	desired := &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk,
		DefaultLocale: "ru", KioskFullscreen: true,
	}
	templateID, variantID := "template-a", "portrait"
	err = repo.UpdateTerminalWithExperience(ctx, "company-a", desired, TerminalExperienceAssignment{
		Specified: true, TemplateID: &templateID, VariantID: &variantID,
	})
	if err != nil {
		t.Fatalf("assign: %v", err)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.ExperienceTemplateID == nil || *stored.ExperienceTemplateID != templateID || stored.ExperienceVariantID == nil || *stored.ExperienceVariantID != variantID {
		t.Fatalf("stored assignment = %#v", stored)
	}
	if stored.ExperienceAckStatus != nil || stored.ExperienceAckReasonCode != nil || stored.ExperienceAckAt != nil || stored.AppliedTemplateVersionID != nil {
		t.Fatalf("explicit assignment did not clear server ack state: %#v", stored)
	}

	resolved, resolvedVariant, err := repo.ResolveTerminalPublishedVersion(ctx, "company-a", "terminal-a")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.ID != v1.ID || resolvedVariant != variantID {
		t.Fatalf("resolved = %#v variant=%q, want v1/%q", resolved, resolvedVariant, variantID)
	}

	otherTemplate := "template-b"
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", desired, TerminalExperienceAssignment{Specified: true, TemplateID: &otherTemplate, VariantID: &variantID}); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-tenant assignment error = %v, want not found", err)
	}
	unpublished := "template-unpublished"
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", desired, TerminalExperienceAssignment{Specified: true, TemplateID: &unpublished, VariantID: &variantID}); !errors.Is(err, ErrExperienceTemplateUnpublished) {
		t.Fatalf("unpublished assignment error = %v", err)
	}
	missingVariant := "landscape"
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", desired, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &missingVariant}); !errors.Is(err, ErrExperienceVariantNotFound) {
		t.Fatalf("missing variant error = %v", err)
	}
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", desired, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID}); !errors.Is(err, ErrExperienceAssignmentIncomplete) {
		t.Fatalf("half assignment error = %v", err)
	}

	counter := *desired
	counter.ID = "terminal-counter"
	counter.Kind = models.DesktopTerminalKindCounterBoard
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", &counter, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); !errors.Is(err, ErrExperienceAssignmentIncompatible) {
		t.Fatalf("counter assignment error = %v", err)
	}

	wrongUnit := *desired
	wrongUnit.UnitID = "unit-b"
	nonexistentTemplate := "does-not-exist"
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", &wrongUnit, TerminalExperienceAssignment{Specified: true, TemplateID: &nonexistentTemplate, VariantID: &variantID}); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("unit ownership must fail before template lookup, got %v", err)
	}

	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", desired, TerminalExperienceAssignment{Specified: true}); err != nil {
		t.Fatalf("unassign: %v", err)
	}
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.ExperienceTemplateID != nil || stored.ExperienceVariantID != nil {
		t.Fatalf("unassign left half/full assignment: %#v", stored)
	}
}

func TestDesktopTerminalRepository_AcknowledgesCurrentPublishedExperienceAtomically(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	ctx := context.Background()
	screenRepo := &screenLayoutTemplateRepository{db: db}
	terminalRepo := &desktopTerminalRepository{db: db}

	published, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	templateID, variantID := "template-a", "portrait"
	if err := screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); err != nil {
		t.Fatalf("assign: %v", err)
	}

	reason := "renderer.timeout"
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", published.ID, "rejected", &reason); err != nil {
		t.Fatalf("acknowledge rejected: %v", err)
	}
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", published.ID, "applied", nil); err != nil {
		t.Fatalf("acknowledge applied: %v", err)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.AppliedTemplateVersionID == nil || *stored.AppliedTemplateVersionID != published.ID || stored.AppliedTemplateAt == nil || stored.ExperienceAckStatus == nil || *stored.ExperienceAckStatus != "applied" || stored.ExperienceAckAt == nil || stored.ExperienceAckReasonCode != nil {
		t.Fatalf("stored applied acknowledgement = %#v", stored)
	}
}

func TestDesktopTerminalRepository_RejectsStaleFutureAndCrossTemplateAcknowledgementsWithoutChanges(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	ctx := context.Background()
	screenRepo := &screenLayoutTemplateRepository{db: db}
	terminalRepo := &desktopTerminalRepository{db: db}
	v1, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	templateID, variantID := "template-a", "portrait"
	if err := screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); err != nil {
		t.Fatal(err)
	}
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", v1.ID, "applied", nil); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.ScreenLayoutTemplate{}).Where("id = ?", "template-a").Update("definition", repositoryDefinition("draft-v2", "portrait")).Error; err != nil {
		t.Fatal(err)
	}
	v2, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	other, err := screenRepo.Publish(ctx, "company-b", "template-b", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	reason := "renderer.timeout"
	for _, versionID := range []string{v1.ID, "future-version", other.ID} {
		if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", versionID, "rejected", &reason); !errors.Is(err, ErrExperienceAcknowledgementVersionNotCurrent) {
			t.Fatalf("acknowledge %q error = %v, want current-version conflict", versionID, err)
		}
		var stored models.DesktopTerminal
		if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
			t.Fatal(err)
		}
		if stored.AppliedTemplateVersionID == nil || *stored.AppliedTemplateVersionID != v1.ID || stored.ExperienceAckStatus == nil || *stored.ExperienceAckStatus != "applied" || stored.ExperienceAckReasonCode != nil {
			t.Fatalf("failed acknowledgement changed terminal state: %#v", stored)
		}
	}
	if v2.ID == v1.ID {
		t.Fatal("second publish did not create a distinct current version")
	}
}

func TestDesktopTerminalRepository_RejectedCurrentVersionPreservesAppliedHistoryWhenVariantWasRemoved(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	ctx := context.Background()
	screenRepo := &screenLayoutTemplateRepository{db: db}
	terminalRepo := &desktopTerminalRepository{db: db}
	v1, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	templateID, variantID := "template-a", "portrait"
	if err := screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); err != nil {
		t.Fatal(err)
	}
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", v1.ID, "applied", nil); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.ScreenLayoutTemplate{}).Where("id = ?", "template-a").Update("definition", repositoryDefinition("draft-v2", "landscape")).Error; err != nil {
		t.Fatal(err)
	}
	v2, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", v2.ID, "applied", nil); !errors.Is(err, ErrExperienceAcknowledgementVersionNotCurrent) {
		t.Fatalf("applied removed-variant acknowledgement error = %v", err)
	}
	reason := "variant.unavailable"
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", v2.ID, "rejected", &reason); err != nil {
		t.Fatalf("rejected removed-variant acknowledgement: %v", err)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.AppliedTemplateVersionID == nil || *stored.AppliedTemplateVersionID != v1.ID || stored.AppliedTemplateAt == nil || stored.ExperienceAckStatus == nil || *stored.ExperienceAckStatus != "rejected" || stored.ExperienceAckReasonCode == nil || *stored.ExperienceAckReasonCode != reason || stored.ExperienceAckAt == nil {
		t.Fatalf("rejected removed-variant acknowledgement state = %#v", stored)
	}
}

func TestDesktopTerminalRepository_DoesNotAcknowledgeRevokedTerminal(t *testing.T) {
	db := newExperienceRepositorySQLite(t)
	seedExperienceRepository(t, db)
	ctx := context.Background()
	screenRepo := &screenLayoutTemplateRepository{db: db}
	terminalRepo := &desktopTerminalRepository{db: db}
	published, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	templateID, variantID := "template-a", "portrait"
	if err := screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); err != nil {
		t.Fatal(err)
	}
	revokedAt := time.Now().UTC()
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Update("revoked_at", revokedAt).Error; err != nil {
		t.Fatal(err)
	}
	if err := terminalRepo.AcknowledgeExperience(ctx, "terminal-a", published.ID, "applied", nil); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("revoked terminal acknowledgement error = %v", err)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.AppliedTemplateVersionID != nil || stored.ExperienceAckStatus != nil || stored.ExperienceAckReasonCode != nil || stored.ExperienceAckAt != nil {
		t.Fatalf("revoked terminal acknowledgement changed state: %#v", stored)
	}
}

func openExperienceRepositoryPostgres(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("EXPERIENCE_REPOSITORY_POSTGRES_URL")
	allowReset := os.Getenv("EXPERIENCE_REPOSITORY_POSTGRES_ALLOW_RESET") == "1"
	if dsn == "" && os.Getenv("TASK6_POSTGRES_ALLOW_RESET") == "1" {
		dsn = os.Getenv("TASK6_POSTGRES_URL")
		allowReset = dsn != ""
	}
	if dsn == "" {
		t.Skip("set EXPERIENCE_REPOSITORY_POSTGRES_URL or TASK6_POSTGRES_URL with TASK6_POSTGRES_ALLOW_RESET=1")
	}
	if !allowReset {
		t.Skip("set EXPERIENCE_REPOSITORY_POSTGRES_ALLOW_RESET=1 for the dedicated database")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`).Error; err != nil {
		t.Fatal(err)
	}
	previousDB := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = previousDB })
	if err := database.RunVersionedMigrations(database.AllMigratableModels()...); err != nil {
		t.Fatalf("apply real migrations: %v", err)
	}
	return db
}

func TestExperienceRepository_PostgresLockingRetryAndForeignKeys(t *testing.T) {
	db := openExperienceRepositoryPostgres(t)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()
	definition := repositoryDefinition("concurrent", "portrait")
	if err := db.Exec(`INSERT INTO companies (id, name) VALUES ('company-a', 'Company A')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO users (id, name) VALUES ('publisher', 'Publisher')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO units (id, company_id, code, kind, name, timezone) VALUES ('unit-a', 'company-a', 'UNIT-A', 'subdivision', 'Unit A', 'UTC')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
INSERT INTO screen_layout_templates (id, company_id, name, definition, surface) VALUES
	('template-concurrent', 'company-a', 'Concurrent', ?, 'ticket-station'),
	('template-retry', 'company-a', 'Retry', ?, 'ticket-station'),
	('template-other', 'company-a', 'Other', ?, 'ticket-station')
`, definition, definition, definition).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO desktop_terminals (id, unit_id, kind, default_locale, pairing_code_digest, secret_hash) VALUES ('terminal-a', 'unit-a', 'kiosk', 'en', 'task6-terminal-digest', 'task6-secret-hash')`).Error; err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	versions := make(chan int, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			row, err := repo.Publish(ctx, "company-a", "template-concurrent", "publisher")
			if err != nil {
				errs <- err
				return
			}
			versions <- row.Version
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent publish: %v", err)
	}
	close(versions)
	gotVersions := make([]int, 0, 2)
	for version := range versions {
		gotVersions = append(gotVersions, version)
	}
	sort.Ints(gotVersions)
	if len(gotVersions) != 2 || gotVersions[0] != 1 || gotVersions[1] != 2 {
		t.Fatalf("concurrent versions = %v, want [1 2]", gotVersions)
	}

	if err := db.Exec(`
CREATE SEQUENCE experience_publish_retry_once;
CREATE FUNCTION fail_first_experience_publish() RETURNS trigger AS $$
BEGIN
	IF NEW.template_id = 'template-retry' AND nextval('experience_publish_retry_once') = 1 THEN
		RAISE EXCEPTION 'synthetic unique conflict' USING ERRCODE = '23505';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER experience_publish_retry_trigger BEFORE INSERT ON experience_template_versions FOR EACH ROW EXECUTE FUNCTION fail_first_experience_publish();
`).Error; err != nil {
		t.Fatal(err)
	}
	retried, err := repo.Publish(ctx, "company-a", "template-retry", "publisher")
	if err != nil {
		t.Fatalf("publish did not retry one unique conflict: %v", err)
	}
	if retried.Version != 1 {
		t.Fatalf("retried version = %d, want 1", retried.Version)
	}

	if err := db.Exec(`INSERT INTO experience_template_versions (id, template_id, version, definition, published_by) VALUES ('bad-version', 'missing-template', 1, '{}'::jsonb, 'publisher')`).Error; err == nil {
		t.Fatal("version template FK did not reject missing template")
	}
	if err := db.Exec(`UPDATE screen_layout_templates SET published_version_id = ? WHERE id = 'template-other'`, retried.ID).Error; err == nil {
		t.Fatal("published pointer accepted a version from another template")
	}
	if err := db.Exec(`UPDATE desktop_terminals SET experience_template_id = 'template-retry', experience_variant_id = NULL WHERE id = 'terminal-a'`).Error; err == nil {
		t.Fatal("assignment pair check accepted a half assignment")
	}

	// A successful transaction must leave the pointer and immutable row visible together.
	var pointer string
	if err := db.Raw(`SELECT published_version_id FROM screen_layout_templates WHERE id = 'template-retry'`).Scan(&pointer).Error; err != nil {
		t.Fatal(err)
	}
	if pointer != retried.ID {
		t.Fatalf("pointer = %q, want %q", pointer, retried.ID)
	}
	var publishedAt time.Time
	if err := db.Raw(`SELECT published_at FROM experience_template_versions WHERE id = ?`, retried.ID).Scan(&publishedAt).Error; err != nil {
		t.Fatal(err)
	}
	if publishedAt.IsZero() {
		t.Fatal("published version has zero published_at")
	}

	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"experience_template_id": "template-other",
		"experience_variant_id":  "portrait",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := repo.Delete("template-other", "company-a"); !errors.Is(err, ErrExperienceTemplateAssigned) {
		t.Fatalf("assigned template delete error = %v", err)
	}
	var rawDeleteErr error
	if err := db.Transaction(func(tx *gorm.DB) error {
		rawDeleteErr = tx.Exec(`DELETE FROM screen_layout_templates WHERE id = 'template-other'`).Error
		return errors.New("rollback raw delete probe")
	}); err == nil {
		t.Fatal("raw delete probe did not roll back")
	}
	if !isExperienceAssignmentForeignKeyViolation(rawDeleteErr) {
		t.Fatalf("assignment FK error was not mapped: %v", rawDeleteErr)
	}
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"experience_template_id": nil,
		"experience_variant_id":  nil,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := repo.Delete("template-other", "company-a"); err != nil {
		t.Fatalf("unassigned template delete: %v", err)
	}

	if err := db.Exec(`DELETE FROM users WHERE id = 'publisher'`).Error; err != nil {
		t.Fatalf("delete publisher: %v", err)
	}
	var preserved models.ExperienceTemplateVersion
	if err := db.First(&preserved, "id = ?", retried.ID).Error; err != nil {
		t.Fatalf("publisher delete removed version: %v", err)
	}
	if preserved.PublishedBy != nil {
		t.Fatalf("publisher delete left published_by = %v", preserved.PublishedBy)
	}
	if err := repo.Delete("template-retry", "company-a"); err != nil {
		t.Fatalf("unassigned published template delete: %v", err)
	}
	if _, err := repo.GetByIDAndCompany("template-retry", "company-a"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("unassigned published template still exists: %v", err)
	}
}

func TestExperienceRuntimeAcknowledgement_PostgresPublishBetweenReadAndUpdateConflicts(t *testing.T) {
	db := openExperienceRepositoryPostgres(t)
	ctx := context.Background()
	definition := repositoryDefinition("published-v1", "portrait")
	if err := db.Exec(`
INSERT INTO companies (id, name) VALUES ('company-a', 'Company A');
INSERT INTO users (id, name) VALUES ('publisher', 'Publisher');
INSERT INTO units (id, company_id, code, kind, name, timezone) VALUES ('unit-a', 'company-a', 'UNIT-A', 'subdivision', 'Unit A', 'UTC');
INSERT INTO screen_layout_templates (id, company_id, name, definition, surface) VALUES ('template-a', 'company-a', 'Template A', ?, 'ticket-station');
INSERT INTO desktop_terminals (id, unit_id, kind, default_locale, pairing_code_digest, secret_hash) VALUES ('terminal-a', 'unit-a', 'kiosk', 'en', 'task7-publish-race-digest', 'task7-publish-race-hash');
`, definition).Error; err != nil {
		t.Fatal(err)
	}
	screenRepo := &screenLayoutTemplateRepository{db: db}
	v1, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	templateID, variantID := "template-a", "portrait"
	if err := screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); err != nil {
		t.Fatal(err)
	}

	var publishErr error
	interleavingLogger := &terminalAcknowledgementInterleaveLogger{Interface: gormlogger.Default, afterTerminalRead: func() {
		publishErr = db.Model(&models.ScreenLayoutTemplate{}).Where("id = ?", "template-a").Update("definition", repositoryDefinition("published-v2", "portrait")).Error
		if publishErr == nil {
			_, publishErr = screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
		}
	}}
	ackRepo := &desktopTerminalRepository{db: db.Session(&gorm.Session{Logger: interleavingLogger})}
	if err := ackRepo.AcknowledgeExperience(ctx, "terminal-a", v1.ID, "applied", nil); !errors.Is(err, ErrExperienceAcknowledgementVersionNotCurrent) {
		t.Fatalf("acknowledgement after interleaved publish error = %v", err)
	}
	if publishErr != nil {
		t.Fatalf("interleaved publish: %v", publishErr)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.AppliedTemplateVersionID != nil || stored.ExperienceAckStatus != nil || stored.ExperienceAckAt != nil {
		t.Fatalf("stale acknowledgement changed state after publish: %#v", stored)
	}
}

func TestExperienceRuntimeAcknowledgement_PostgresReassignmentDuringAcknowledgementClearsOldState(t *testing.T) {
	db := openExperienceRepositoryPostgres(t)
	ctx := context.Background()
	definition := repositoryDefinition("published-a", "portrait")
	if err := db.Exec(`
INSERT INTO companies (id, name) VALUES ('company-a', 'Company A');
INSERT INTO users (id, name) VALUES ('publisher', 'Publisher');
INSERT INTO units (id, company_id, code, kind, name, timezone) VALUES ('unit-a', 'company-a', 'UNIT-A', 'subdivision', 'Unit A', 'UTC');
INSERT INTO screen_layout_templates (id, company_id, name, definition, surface) VALUES
		('template-a', 'company-a', 'Template A', ?, 'ticket-station'),
		('template-b', 'company-a', 'Template B', ?, 'ticket-station');
INSERT INTO desktop_terminals (id, unit_id, kind, default_locale, pairing_code_digest, secret_hash) VALUES ('terminal-a', 'unit-a', 'kiosk', 'en', 'task7-reassign-race-digest', 'task7-reassign-race-hash');
`, definition, repositoryDefinition("published-b", "portrait")).Error; err != nil {
		t.Fatal(err)
	}
	screenRepo := &screenLayoutTemplateRepository{db: db}
	v1, err := screenRepo.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := screenRepo.Publish(ctx, "company-a", "template-b", "publisher"); err != nil {
		t.Fatal(err)
	}
	templateA, templateB, variantID := "template-a", "template-b", "portrait"
	if err := screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateA, VariantID: &variantID}); err != nil {
		t.Fatal(err)
	}

	reassignmentStarted := make(chan struct{})
	reassignmentResult := make(chan error, 1)
	interleavingLogger := &terminalAcknowledgementInterleaveLogger{Interface: gormlogger.Default, afterTerminalRead: func() {
		go func() {
			close(reassignmentStarted)
			reassignmentResult <- screenRepo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
				ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
			}, TerminalExperienceAssignment{Specified: true, TemplateID: &templateB, VariantID: &variantID})
		}()
		<-reassignmentStarted
	}}
	ackRepo := &desktopTerminalRepository{db: db.Session(&gorm.Session{Logger: interleavingLogger})}
	if err := ackRepo.AcknowledgeExperience(ctx, "terminal-a", v1.ID, "applied", nil); err != nil {
		t.Fatalf("acknowledge before concurrent reassignment: %v", err)
	}
	if err := <-reassignmentResult; err != nil {
		t.Fatalf("concurrent reassignment: %v", err)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.ExperienceTemplateID == nil || *stored.ExperienceTemplateID != templateB || stored.AppliedTemplateVersionID != nil || stored.AppliedTemplateAt != nil || stored.ExperienceAckStatus != nil || stored.ExperienceAckReasonCode != nil || stored.ExperienceAckAt != nil {
		t.Fatalf("reassignment did not clear acknowledgement lifecycle: %#v", stored)
	}
}
