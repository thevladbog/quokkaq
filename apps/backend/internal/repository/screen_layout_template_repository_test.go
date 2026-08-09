package repository

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sort"
	"sync"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

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
		}]
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
	published_by text NOT NULL,
	published_at datetime NOT NULL,
	CONSTRAINT uq_experience_template_versions_template_version UNIQUE (template_id, version),
	CONSTRAINT uq_experience_template_versions_template_id_id UNIQUE (template_id, id),
	CONSTRAINT fk_experience_template_versions_template FOREIGN KEY (template_id) REFERENCES screen_layout_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_experience_template_versions_publisher FOREIGN KEY (published_by) REFERENCES users(id)
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
	updated_at datetime,
	CONSTRAINT chk_desktop_terminal_experience_assignment_pair CHECK ((experience_template_id IS NULL AND experience_variant_id IS NULL) OR (experience_template_id IS NOT NULL AND experience_variant_id IS NOT NULL)),
	CONSTRAINT fk_desktop_terminal_experience_template FOREIGN KEY (experience_template_id) REFERENCES screen_layout_templates(id) ON DELETE SET NULL,
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

	versions, err := repo.ListVersions(ctx, "company-a", "template-a")
	if err != nil {
		t.Fatal(err)
	}
	if len(versions) != 3 || versions[0].Version != 3 || versions[1].Version != 2 || versions[2].Version != 1 {
		t.Fatalf("versions = %#v", versions)
	}
	if string(versions[2].Definition) != string(repositoryDefinition("draft-a", "portrait")) || string(versions[1].Definition) != string(repositoryDefinition("draft-b", "portrait")) {
		t.Fatalf("historical definitions mutated: %#v", versions)
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
	if versions, err := repo.ListVersions(ctx, "company-b", "template-a"); !errors.Is(err, gorm.ErrRecordNotFound) || versions != nil {
		t.Fatalf("cross-tenant versions = %#v, %v", versions, err)
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

func openExperienceRepositoryPostgres(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("EXPERIENCE_REPOSITORY_POSTGRES_URL")
	if dsn == "" {
		t.Skip("set EXPERIENCE_REPOSITORY_POSTGRES_URL to a dedicated PostgreSQL 16+ database")
	}
	if os.Getenv("EXPERIENCE_REPOSITORY_POSTGRES_ALLOW_RESET") != "1" {
		t.Skip("set EXPERIENCE_REPOSITORY_POSTGRES_ALLOW_RESET=1 for the dedicated database")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE users (id text PRIMARY KEY);
CREATE TABLE units (id text PRIMARY KEY, company_id text NOT NULL);
CREATE TABLE screen_layout_templates (
	id text PRIMARY KEY,
	company_id text NOT NULL,
	name text NOT NULL,
	definition jsonb NOT NULL,
	surface text NOT NULL DEFAULT 'queue-display',
	published_version_id text,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);
CREATE TABLE experience_template_versions (
	id text PRIMARY KEY,
	template_id text NOT NULL,
	version integer NOT NULL,
	definition jsonb NOT NULL,
	published_by text NOT NULL,
	published_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT uq_experience_template_versions_template_version UNIQUE (template_id, version),
	CONSTRAINT uq_experience_template_versions_template_id_id UNIQUE (template_id, id),
	CONSTRAINT fk_experience_template_versions_template FOREIGN KEY (template_id) REFERENCES screen_layout_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_experience_template_versions_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT
);
ALTER TABLE screen_layout_templates ADD CONSTRAINT fk_screen_layout_templates_published_version FOREIGN KEY (id, published_version_id) REFERENCES experience_template_versions(template_id, id);
CREATE TABLE desktop_terminals (
	id text PRIMARY KEY,
	unit_id text NOT NULL REFERENCES units(id),
	counter_id text,
	kind text NOT NULL,
	name text,
	default_locale text NOT NULL,
	kiosk_fullscreen boolean NOT NULL DEFAULT false,
	experience_template_id text,
	experience_variant_id text,
	applied_template_version_id text,
	applied_template_at timestamptz,
	experience_ack_status text,
	experience_ack_reason_code text,
	experience_ack_at timestamptz,
	updated_at timestamptz DEFAULT now(),
	CONSTRAINT chk_desktop_terminal_experience_assignment_pair CHECK ((experience_template_id IS NULL AND experience_variant_id IS NULL) OR (experience_template_id IS NOT NULL AND experience_variant_id IS NOT NULL)),
	CONSTRAINT fk_desktop_terminal_experience_template FOREIGN KEY (experience_template_id) REFERENCES screen_layout_templates(id) ON DELETE SET NULL,
	CONSTRAINT fk_desktop_terminal_applied_experience_version FOREIGN KEY (experience_template_id, applied_template_version_id) REFERENCES experience_template_versions(template_id, id)
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestExperienceRepository_PostgresLockingRetryAndForeignKeys(t *testing.T) {
	db := openExperienceRepositoryPostgres(t)
	repo := &screenLayoutTemplateRepository{db: db}
	ctx := context.Background()
	definition := repositoryDefinition("concurrent", "portrait")
	if err := db.Exec(`INSERT INTO users (id) VALUES ('publisher')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO units (id, company_id) VALUES ('unit-a', 'company-a')`).Error; err != nil {
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
	if err := db.Exec(`INSERT INTO desktop_terminals (id, unit_id, kind, default_locale) VALUES ('terminal-a', 'unit-a', 'kiosk', 'en')`).Error; err != nil {
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
}
