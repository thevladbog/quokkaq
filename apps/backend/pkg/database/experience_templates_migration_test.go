package database

import (
	"database/sql"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func assertExperiencePublishedAtIndex(t *testing.T, db *gorm.DB) {
	t.Helper()
	var indexDefinition string
	if err := db.Raw(`SELECT pg_get_indexdef('idx_experience_template_versions_published_at'::regclass)`).Scan(&indexDefinition).Error; err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(indexDefinition, "(template_id, published_at DESC)") {
		t.Fatalf("published_at index = %q, want (template_id, published_at DESC)", indexDefinition)
	}
}

func openExperienceMigrationPostgres(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("EXPERIENCE_MIGRATION_POSTGRES_URL")
	allowReset := os.Getenv("EXPERIENCE_MIGRATION_POSTGRES_ALLOW_RESET") == "1"
	if dsn == "" && os.Getenv("TASK6_POSTGRES_ALLOW_RESET") == "1" {
		dsn = os.Getenv("TASK6_POSTGRES_URL")
		allowReset = dsn != ""
	}
	if dsn == "" {
		t.Skip("set EXPERIENCE_MIGRATION_POSTGRES_URL or TASK6_POSTGRES_URL with TASK6_POSTGRES_ALLOW_RESET=1")
	}
	if !allowReset {
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
	assertExperiencePublishedAtIndex(t, db)

	var publisherNullable string
	if err := db.Raw(`
SELECT is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'experience_template_versions' AND column_name = 'published_by'
`).Scan(&publisherNullable).Error; err != nil {
		t.Fatal(err)
	}
	if publisherNullable != "YES" {
		t.Fatalf("published_by is_nullable = %q, want YES", publisherNullable)
	}
	var publisherDeleteAction, assignmentDeleteAction string
	if err := db.Raw(`SELECT confdeltype::text FROM pg_constraint WHERE conname = 'fk_experience_template_versions_publisher'`).Scan(&publisherDeleteAction).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Raw(`SELECT confdeltype::text FROM pg_constraint WHERE conname = 'fk_desktop_terminal_experience_template'`).Scan(&assignmentDeleteAction).Error; err != nil {
		t.Fatal(err)
	}
	if publisherDeleteAction != "n" || assignmentDeleteAction != "r" {
		t.Fatalf("FK delete actions publisher=%q assignment=%q, want n/r", publisherDeleteAction, assignmentDeleteAction)
	}

	if err := db.Exec(`
INSERT INTO users (id, name) VALUES ('task6-publisher', 'Task 6 publisher');
INSERT INTO experience_template_versions (id, template_id, version, definition, published_by)
VALUES ('task6-version', 'legacy-template', 1, '{}'::jsonb, 'task6-publisher');
DELETE FROM users WHERE id = 'task6-publisher';
`).Error; err != nil {
		t.Fatalf("delete publisher under migrated FK: %v", err)
	}
	var preservedCount int64
	var preservedPublisher sql.NullString
	if err := db.Raw(`SELECT COUNT(*), MAX(published_by) FROM experience_template_versions WHERE id = 'task6-version'`).Row().Scan(&preservedCount, &preservedPublisher); err != nil {
		t.Fatal(err)
	}
	if preservedCount != 1 || preservedPublisher.Valid {
		t.Fatalf("publisher delete preserved count=%d publisher=%v, want 1/NULL", preservedCount, preservedPublisher)
	}

	var migrationRows int64
	if err := db.Table("migrations").Where("version = ?", "v1.8.18_experience_templates").Count(&migrationRows).Error; err != nil {
		t.Fatal(err)
	}
	if migrationRows != 1 {
		t.Fatalf("migration registry rows = %d, want 1", migrationRows)
	}

	// Replay v1.8.18 over an upgraded schema with the legacy wrong index shape.
	if err := db.Exec(`
DROP INDEX idx_experience_template_versions_published_at;
CREATE INDEX idx_experience_template_versions_published_at ON experience_template_versions (published_at);
DELETE FROM migrations WHERE version = 'v1.8.18_experience_templates';
`).Error; err != nil {
		t.Fatal(err)
	}
	if err := RunVersionedMigrations(AllMigratableModels()...); err != nil {
		t.Fatalf("upgraded migration rerun: %v", err)
	}
	assertExperiencePublishedAtIndex(t, db)
	if err := RunVersionedMigrations(AllMigratableModels()...); err != nil {
		t.Fatalf("idempotent migration rerun: %v", err)
	}
}
