package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type countingScreenLayoutTemplateRepository struct {
	repository.ScreenLayoutTemplateRepository
	calls int
}

func (r *countingScreenLayoutTemplateRepository) GetByIDAndCompany(id, companyID string) (*models.ScreenLayoutTemplate, error) {
	r.calls++
	return r.ScreenLayoutTemplateRepository.GetByIDAndCompany(id, companyID)
}

func (r *countingScreenLayoutTemplateRepository) Create(row *models.ScreenLayoutTemplate) error {
	r.calls++
	return r.ScreenLayoutTemplateRepository.Create(row)
}

func (r *countingScreenLayoutTemplateRepository) Update(row *models.ScreenLayoutTemplate) error {
	r.calls++
	return r.ScreenLayoutTemplateRepository.Update(row)
}

func serviceExperienceDefinition(id, variant string) json.RawMessage {
	return json.RawMessage(`{
		"schemaVersion":1,
		"id":"` + id + `",
		"surface":"ticket-station",
		"startPageId":"start",
		"variants":[{"id":"` + variant + `","profile":{"id":"profile","name":"Profile","width":820,"height":1180,"interactionMode":"touch","viewingDistance":"near","safeArea":{"top":0,"right":0,"bottom":0,"left":0}},"grid":{"columns":10,"rows":10}}],
		"pages":[{"id":"start","name":"Start","widgets":[{"id":"catalog","type":"service-picker","config":{},"actions":[]}],"layouts":{"` + variant + `":{"placements":{"catalog":{"col":1,"row":1,"colSpan":10,"rowSpan":10}}}}}],
		"flowPages":{"serviceCatalogPageId":"start"}
	}`)
}

func newScreenLayoutTemplateServiceTest(t *testing.T) (*ScreenLayoutTemplateService, repository.ScreenLayoutTemplateRepository, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE companies (
	id text PRIMARY KEY,
	name text NOT NULL,
	subscription_id text,
	is_saas_operator integer NOT NULL DEFAULT 0
);
CREATE TABLE users (id text PRIMARY KEY);
CREATE TABLE units (id text PRIMARY KEY, company_id text NOT NULL);
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
	UNIQUE (template_id, version)
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
	updated_at datetime
);
INSERT INTO companies (id, name, is_saas_operator) VALUES ('company-a', 'A', 1);
INSERT INTO users (id) VALUES ('publisher');
INSERT INTO units (id, company_id) VALUES ('unit-a', 'company-a');
INSERT INTO screen_layout_templates (id, company_id, name, definition, surface)
VALUES ('template-a', 'company-a', 'Template', ?, 'ticket-station');
INSERT INTO desktop_terminals (id, unit_id, kind, default_locale)
VALUES ('terminal-a', 'unit-a', 'kiosk', 'en');
`, serviceExperienceDefinition("draft-a", "portrait")).Error; err != nil {
		t.Fatal(err)
	}
	previousDB := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = previousDB })
	repo := repository.NewScreenLayoutTemplateRepositoryWithDB(db)
	return NewScreenLayoutTemplateService(repo), repo, db
}

func TestScreenLayoutTemplateService_DraftIsolationPublishAndRestore(t *testing.T) {
	svc, repo, db := newScreenLayoutTemplateServiceTest(t)
	ctx := context.Background()

	v1, err := svc.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v1: %v", err)
	}
	templateID, variantID := "template-a", "portrait"
	desired := &models.DesktopTerminal{ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en"}
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", desired, repository.TerminalExperienceAssignment{
		Specified: true, TemplateID: &templateID, VariantID: &variantID,
	}); err != nil {
		t.Fatalf("assign v1: %v", err)
	}

	if _, err := svc.Update("company-a", "template-a", "Template", serviceExperienceDefinition("draft-b", "portrait"), nil); err != nil {
		t.Fatalf("save draft B: %v", err)
	}
	resolved, resolvedVariant, err := svc.ResolveTerminalPublishedVersion(ctx, "company-a", "terminal-a")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.ID != v1.ID || string(resolved.Definition) != string(serviceExperienceDefinition("draft-a", "portrait")) || resolvedVariant != "portrait" {
		t.Fatalf("draft save changed device resolution: %#v variant=%q", resolved, resolvedVariant)
	}

	v2, err := svc.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v2: %v", err)
	}
	resolved, _, err = svc.ResolveTerminalPublishedVersion(ctx, "company-a", "terminal-a")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.ID != v2.ID || string(resolved.Definition) != string(serviceExperienceDefinition("draft-b", "portrait")) {
		t.Fatalf("device did not resolve v2: %#v", resolved)
	}

	v3, err := svc.Restore(ctx, "company-a", "template-a", v1.ID, "publisher")
	if err != nil {
		t.Fatalf("restore v1: %v", err)
	}
	if v3.Version != 3 || v3.ID == v1.ID || string(v3.Definition) != string(v1.Definition) {
		t.Fatalf("restore = %#v, want new v3 copied from v1", v3)
	}
	resolved, _, err = svc.ResolveTerminalPublishedVersion(ctx, "company-a", "terminal-a")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.ID != v3.ID {
		t.Fatalf("device resolved %q after restore, want %q", resolved.ID, v3.ID)
	}

	var historical []models.ExperienceTemplateVersion
	if err := db.Where("template_id = ?", "template-a").Order("version ASC").Find(&historical).Error; err != nil {
		t.Fatal(err)
	}
	if len(historical) != 3 || string(historical[0].Definition) != string(serviceExperienceDefinition("draft-a", "portrait")) || string(historical[1].Definition) != string(serviceExperienceDefinition("draft-b", "portrait")) {
		t.Fatalf("historical versions were mutated: %#v", historical)
	}
}

func TestScreenLayoutTemplateService_RuntimeManifestUsesPublishedSnapshotWhileDraftChanges(t *testing.T) {
	_, repo, _ := newScreenLayoutTemplateServiceTest(t)
	runtimeService := NewScreenLayoutTemplateService(repo, repository.NewDesktopTerminalRepository())
	ctx := context.Background()

	v1, err := runtimeService.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v1: %v", err)
	}
	templateID, variantID := "template-a", "portrait"
	terminal := &models.DesktopTerminal{ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en"}
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", terminal, repository.TerminalExperienceAssignment{
		Specified: true, TemplateID: &templateID, VariantID: &variantID,
	}); err != nil {
		t.Fatalf("assign v1: %v", err)
	}
	if _, err := runtimeService.Update("company-a", "template-a", "Template", serviceExperienceDefinition("draft-removes-portrait", "landscape"), nil); err != nil {
		t.Fatalf("save later draft: %v", err)
	}

	manifest, err := runtimeService.ResolveTerminalExperience(ctx, "terminal-a")
	if err != nil {
		t.Fatalf("resolve runtime manifest: %v", err)
	}
	if manifest.Mode != TerminalExperienceModeExperience || manifest.TemplateID != "template-a" || manifest.VersionID != v1.ID || manifest.Version != v1.Version || manifest.VariantID != "portrait" || string(manifest.Definition) != string(v1.Definition) || manifest.PublishedAt == nil || !manifest.PublishedAt.Equal(v1.PublishedAt) {
		t.Fatalf("manifest = %#v, want immutable v1 snapshot", manifest)
	}
}

func TestScreenLayoutTemplateService_RejectedCurrentVersionPreservesLastAppliedVersion(t *testing.T) {
	_, repo, db := newScreenLayoutTemplateServiceTest(t)
	runtimeService := NewScreenLayoutTemplateService(repo, repository.NewDesktopTerminalRepository())
	ctx := context.Background()
	v1, err := runtimeService.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v1: %v", err)
	}
	templateID, variantID := "template-a", "portrait"
	terminal := &models.DesktopTerminal{ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en"}
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", terminal, repository.TerminalExperienceAssignment{
		Specified: true, TemplateID: &templateID, VariantID: &variantID,
	}); err != nil {
		t.Fatalf("assign: %v", err)
	}
	if err := runtimeService.AcknowledgeTerminalExperience(ctx, "terminal-a", v1.ID, "applied", nil); err != nil {
		t.Fatalf("acknowledge applied v1: %v", err)
	}
	if _, err := runtimeService.Update("company-a", "template-a", "Template", serviceExperienceDefinition("draft-v2", "portrait"), nil); err != nil {
		t.Fatalf("save draft v2: %v", err)
	}
	v2, err := runtimeService.Publish(ctx, "company-a", "template-a", "publisher")
	if err != nil {
		t.Fatalf("publish v2: %v", err)
	}
	reason := "renderer.timeout"
	if err := runtimeService.AcknowledgeTerminalExperience(ctx, "terminal-a", v2.ID, "rejected", &reason); err != nil {
		t.Fatalf("acknowledge rejected v2: %v", err)
	}
	var stored models.DesktopTerminal
	if err := db.First(&stored, "id = ?", "terminal-a").Error; err != nil {
		t.Fatal(err)
	}
	if stored.AppliedTemplateVersionID == nil || *stored.AppliedTemplateVersionID != v1.ID || stored.AppliedTemplateAt == nil || stored.ExperienceAckStatus == nil || *stored.ExperienceAckStatus != "rejected" || stored.ExperienceAckReasonCode == nil || *stored.ExperienceAckReasonCode != reason || stored.ExperienceAckAt == nil {
		t.Fatalf("rejected v2 changed acknowledged terminal state to %#v", stored)
	}
}

func TestScreenLayoutTemplateService_RuntimeManifestUsesLegacyOnlyForUnassignedTerminal(t *testing.T) {
	_, repo, _ := newScreenLayoutTemplateServiceTest(t)
	runtimeService := NewScreenLayoutTemplateService(repo, repository.NewDesktopTerminalRepository())

	manifest, err := runtimeService.ResolveTerminalExperience(context.Background(), "terminal-a")
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Mode != TerminalExperienceModeLegacy || manifest.TemplateID != "" || manifest.VersionID != "" || manifest.Version != 0 || manifest.VariantID != "" || manifest.Definition != nil || manifest.PublishedAt != nil {
		t.Fatalf("unassigned manifest = %#v, want legacy mode only", manifest)
	}
}

func TestScreenLayoutTemplateService_RuntimeManifestFailsClosedWithoutPublishedVersion(t *testing.T) {
	_, repo, db := newScreenLayoutTemplateServiceTest(t)
	runtimeService := NewScreenLayoutTemplateService(repo, repository.NewDesktopTerminalRepository())
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"experience_template_id": "template-a",
		"experience_variant_id":  "portrait",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if manifest, err := runtimeService.ResolveTerminalExperience(context.Background(), "terminal-a"); !errors.Is(err, ErrExperienceTemplateUnpublished) || manifest != nil {
		t.Fatalf("unpublished manifest=%#v err=%v", manifest, err)
	}
}

func TestScreenLayoutTemplateService_RuntimeManifestFailsClosedWhenPublishedVersionRemovesVariant(t *testing.T) {
	_, repo, _ := newScreenLayoutTemplateServiceTest(t)
	runtimeService := NewScreenLayoutTemplateService(repo, repository.NewDesktopTerminalRepository())
	ctx := context.Background()
	if _, err := runtimeService.Publish(ctx, "company-a", "template-a", "publisher"); err != nil {
		t.Fatalf("publish v1: %v", err)
	}
	templateID, variantID := "template-a", "portrait"
	if err := repo.UpdateTerminalWithExperience(ctx, "company-a", &models.DesktopTerminal{
		ID: "terminal-a", UnitID: "unit-a", Kind: models.DesktopTerminalKindKiosk, DefaultLocale: "en",
	}, repository.TerminalExperienceAssignment{Specified: true, TemplateID: &templateID, VariantID: &variantID}); err != nil {
		t.Fatalf("assign: %v", err)
	}
	if _, err := runtimeService.Update("company-a", "template-a", "Template", serviceExperienceDefinition("draft-removes-portrait", "landscape"), nil); err != nil {
		t.Fatalf("save draft: %v", err)
	}
	if _, err := runtimeService.Publish(ctx, "company-a", "template-a", "publisher"); err != nil {
		t.Fatalf("publish variant removal: %v", err)
	}
	if manifest, err := runtimeService.ResolveTerminalExperience(ctx, "terminal-a"); !errors.Is(err, ErrExperienceVariantNotFound) || manifest != nil {
		t.Fatalf("published removed variant manifest=%#v err=%v", manifest, err)
	}
}

func TestScreenLayoutTemplateService_SurfaceDefaultsAndIsImmutable(t *testing.T) {
	svc, _, _ := newScreenLayoutTemplateServiceTest(t)
	created, err := svc.Create("company-a", "Legacy display", "", json.RawMessage(`{"legacy":true}`))
	if err != nil {
		t.Fatal(err)
	}
	if created.Surface != "queue-display" || created.PublishedVersionID != nil {
		t.Fatalf("created = %#v, want queue-display unpublished", created)
	}

	conflictingSurface := "ticket-station"
	if _, err := svc.Update("company-a", created.ID, "Renamed", json.RawMessage(`{"legacy":true}`), &conflictingSurface); !errors.Is(err, ErrScreenLayoutTemplateSurfaceImmutable) {
		t.Fatalf("surface mutation error = %v", err)
	}
	if _, err := svc.Update("company-a", created.ID, "Renamed", json.RawMessage(`{"surface":"ticket-station"}`), nil); !errors.Is(err, ErrScreenLayoutTemplateSurfaceMismatch) {
		t.Fatalf("payload/model surface mismatch error = %v", err)
	}
	if _, err := svc.Update("company-a", created.ID, "Renamed", json.RawMessage(`{"surface":" queue-display "}`), nil); !errors.Is(err, ErrScreenLayoutTemplateSurfaceMismatch) {
		t.Fatalf("non-canonical payload surface error = %v", err)
	}

	emptySurface := ""
	if _, err := svc.Update("company-a", created.ID, "Renamed", json.RawMessage(`{"legacy":true}`), &emptySurface); !errors.Is(err, ErrScreenLayoutTemplateInvalidSurface) {
		t.Fatalf("empty update surface error = %v", err)
	}

	sameSurface := "queue-display"
	updated, err := svc.Update("company-a", created.ID, "Renamed", json.RawMessage(`{"surface":"queue-display"}`), &sameSurface)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Surface != "queue-display" {
		t.Fatalf("updated surface = %q", updated.Surface)
	}
}

func TestScreenLayoutTemplateService_PublishMapsValidationAndConflictErrors(t *testing.T) {
	svc, _, db := newScreenLayoutTemplateServiceTest(t)
	if err := db.Model(&models.ScreenLayoutTemplate{}).Where("id = ?", "template-a").Update("definition", json.RawMessage(`[]`)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Publish(context.Background(), "company-a", "template-a", "publisher"); !errors.Is(err, ErrScreenLayoutTemplateInvalidDefinition) {
		t.Fatalf("invalid publish error = %v", err)
	}
}

func TestScreenLayoutTemplateService_RejectsOversizedDraftBeforeRepositoryCall(t *testing.T) {
	_, repositoryUnderTest, db := newScreenLayoutTemplateServiceTest(t)
	spy := &countingScreenLayoutTemplateRepository{ScreenLayoutTemplateRepository: repositoryUnderTest}
	svc := NewScreenLayoutTemplateService(spy)
	oversized := json.RawMessage(append(append([]byte(`{"padding":"`), bytes.Repeat([]byte("x"), experience.MaxDefinitionBytes)...), []byte(`"}`)...))

	if _, err := svc.Create("company-a", "Oversized", "queue-display", oversized); !errors.Is(err, ErrScreenLayoutTemplateDefinitionTooLarge) {
		t.Fatalf("Create error = %v, want ErrScreenLayoutTemplateDefinitionTooLarge", err)
	}
	if spy.calls != 0 {
		t.Fatalf("Create repository calls = %d, want 0", spy.calls)
	}

	if _, err := svc.Update("company-a", "template-a", "Oversized", oversized, nil); !errors.Is(err, ErrScreenLayoutTemplateDefinitionTooLarge) {
		t.Fatalf("Update error = %v, want ErrScreenLayoutTemplateDefinitionTooLarge", err)
	}
	if spy.calls != 0 {
		t.Fatalf("Update repository calls = %d, want 0", spy.calls)
	}

	var stored string
	if err := db.Model(&models.ScreenLayoutTemplate{}).Select("definition").Where("id = ?", "template-a").Scan(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if stored == string(oversized) {
		t.Fatal("oversized definition was stored")
	}
}

func TestScreenLayoutTemplateService_DeleteMapsAssignedTemplate(t *testing.T) {
	svc, _, db := newScreenLayoutTemplateServiceTest(t)
	if err := db.Model(&models.DesktopTerminal{}).Where("id = ?", "terminal-a").Updates(map[string]any{
		"experience_template_id": "template-a",
		"experience_variant_id":  "portrait",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.Delete("company-a", "template-a"); !errors.Is(err, ErrExperienceTemplateAssigned) {
		t.Fatalf("Delete error = %v, want ErrExperienceTemplateAssigned", err)
	}
	var count int64
	if err := db.Model(&models.ScreenLayoutTemplate{}).Where("id = ?", "template-a").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("assigned template count = %d, want 1", count)
	}
}
