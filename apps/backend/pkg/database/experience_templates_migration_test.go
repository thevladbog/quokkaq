package database

import (
	"database/sql"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func openExperienceMigrationPostgres(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("EXPERIENCE_MIGRATION_POSTGRES_URL")
	if dsn == "" {
		t.Skip("set EXPERIENCE_MIGRATION_POSTGRES_URL to a dedicated PostgreSQL 16+ database")
	}
	if os.Getenv("EXPERIENCE_MIGRATION_POSTGRES_ALLOW_RESET") != "1" {
		t.Skip("set EXPERIENCE_MIGRATION_POSTGRES_ALLOW_RESET=1 for the dedicated database")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`).Error; err != nil {
		t.Fatal(err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	return db
}

func TestExperienceTemplatesMigration_BackfillsLegacyRowsWithoutPublishing(t *testing.T) {
	db := openExperienceMigrationPostgres(t)
	if err := RunVersionedMigrations(AllMigratableModels()...); err != nil {
		t.Fatalf("initial migrations: %v", err)
	}

	// Recreate the production shape immediately before v1.8.18. On a fresh
	// test database v1.0.0 has already seen today's models, so remove only the
	// fields owned by v1.8.18 before replaying that migration.
	if err := db.Exec(`
ALTER TABLE screen_layout_templates
	DROP CONSTRAINT IF EXISTS fk_screen_layout_templates_published_version,
	DROP CONSTRAINT IF EXISTS chk_screen_layout_templates_surface;
ALTER TABLE desktop_terminals
	DROP CONSTRAINT IF EXISTS fk_desktop_terminal_applied_experience_version,
	DROP CONSTRAINT IF EXISTS fk_desktop_terminal_experience_template,
	DROP CONSTRAINT IF EXISTS chk_desktop_terminal_experience_assignment_pair,
	DROP CONSTRAINT IF EXISTS chk_desktop_terminal_experience_ack_status;
DROP TABLE IF EXISTS experience_template_versions CASCADE;
ALTER TABLE screen_layout_templates
	DROP COLUMN IF EXISTS published_version_id,
	DROP COLUMN IF EXISTS surface;
ALTER TABLE desktop_terminals
	DROP COLUMN IF EXISTS experience_template_id,
	DROP COLUMN IF EXISTS experience_variant_id,
	DROP COLUMN IF EXISTS applied_template_version_id,
	DROP COLUMN IF EXISTS applied_template_at,
	DROP COLUMN IF EXISTS experience_ack_status,
	DROP COLUMN IF EXISTS experience_ack_reason_code,
	DROP COLUMN IF EXISTS experience_ack_at;
DELETE FROM migrations WHERE version = 'v1.8.18_experience_templates';
INSERT INTO screen_layout_templates (id, company_id, name, definition, created_at, updated_at)
VALUES ('legacy-template', 'legacy-company', 'Legacy', '{}'::jsonb, now(), now());
`).Error; err != nil {
		t.Fatalf("prepare legacy schema: %v", err)
	}

	if err := RunVersionedMigrations(AllMigratableModels()...); err != nil {
		t.Fatalf("experience migration: %v", err)
	}

	var surface string
	var publishedVersionID sql.NullString
	if err := db.Raw(`SELECT surface, published_version_id FROM screen_layout_templates WHERE id = 'legacy-template'`).Row().Scan(&surface, &publishedVersionID); err != nil {
		t.Fatal(err)
	}
	if surface != "queue-display" || publishedVersionID.Valid {
		t.Fatalf("legacy row migrated to surface=%q published=%v, want queue-display/unpublished", surface, publishedVersionID)
	}

	var versionCount int64
	if err := db.Table("experience_template_versions").Where("template_id = ?", "legacy-template").Count(&versionCount).Error; err != nil {
		t.Fatal(err)
	}
	if versionCount != 0 {
		t.Fatalf("migration auto-published %d version rows", versionCount)
	}

	var matchingUniqueIndexes int64
	if err := db.Raw(`
SELECT COUNT(*)
FROM pg_index candidate
JOIN pg_class index_class ON index_class.oid = candidate.indexrelid
WHERE candidate.indrelid = 'experience_template_versions'::regclass
  AND candidate.indisunique
  AND (
	SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
	FROM unnest(candidate.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ordinality)
	JOIN pg_attribute attribute
	  ON attribute.attrelid = candidate.indrelid
	 AND attribute.attnum = key.attnum
  ) = ARRAY['template_id', 'id']::text[]
`).Scan(&matchingUniqueIndexes).Error; err != nil {
		t.Fatal(err)
	}
	if matchingUniqueIndexes != 1 {
		t.Fatalf("matching (template_id,id) unique indexes = %d, want 1", matchingUniqueIndexes)
	}

	var migrationRows int64
	if err := db.Table("migrations").Where("version = ?", "v1.8.18_experience_templates").Count(&migrationRows).Error; err != nil {
		t.Fatal(err)
	}
	if migrationRows != 1 {
		t.Fatalf("migration registry rows = %d, want 1", migrationRows)
	}
	if err := RunVersionedMigrations(AllMigratableModels()...); err != nil {
		t.Fatalf("idempotent migration rerun: %v", err)
	}
}
