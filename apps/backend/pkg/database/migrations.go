package database

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// Migration represents a database migration version
type Migration struct {
	ID        uint      `gorm:"primaryKey"`
	Version   string    `gorm:"unique;not null"`
	AppliedAt time.Time `gorm:"default:now()"`
}

// MigrationManager handles database migrations with version tracking
type MigrationManager struct {
	db *gorm.DB
}

// NewMigrationManager creates a new migration manager
func NewMigrationManager(db *gorm.DB) *MigrationManager {
	return &MigrationManager{db: db}
}

// Initialize creates the migrations tracking table if it doesn't exist
func (m *MigrationManager) Initialize() error {
	return m.db.AutoMigrate(&Migration{})
}

// IsMigrationApplied checks if a specific migration version has been applied
func (m *MigrationManager) IsMigrationApplied(version string) (bool, error) {
	var count int64
	err := m.db.Model(&Migration{}).Where("version = ?", version).Count(&count).Error
	return count > 0, err
}

// MarkMigrationApplied marks a migration as applied
func (m *MigrationManager) MarkMigrationApplied(version string) error {
	migration := &Migration{
		Version:   version,
		AppliedAt: time.Now(),
	}
	return m.db.Create(migration).Error
}

// GetAppliedMigrations returns all applied migrations
func (m *MigrationManager) GetAppliedMigrations() ([]Migration, error) {
	var migrations []Migration
	err := m.db.Order("applied_at DESC").Find(&migrations).Error
	return migrations, err
}

// RunMigration runs a migration function if it hasn't been applied yet.
// It uses a single DB transaction and a PostgreSQL transaction-scoped advisory lock
// (pg_advisory_xact_lock) so concurrent processes cannot pass the applied check and
// run the same migration; migrationFunc receives the transactional *gorm.DB.
func (m *MigrationManager) RunMigration(version string, migrationFunc func(*gorm.DB) error) error {
	return m.db.Transaction(func(tx *gorm.DB) error {
		// Serialize runners for this version; released automatically on commit/rollback.
		if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext(?::text), 0)", version).Error; err != nil {
			return fmt.Errorf("migration %s: acquire lock: %w", version, err)
		}

		var count int64
		if err := tx.Model(&Migration{}).Where("version = ?", version).Count(&count).Error; err != nil {
			return fmt.Errorf("failed to check migration status: %w", err)
		}
		if count > 0 {
			log.Printf("⏭️ Migration %s already applied, skipping", version)
			return nil
		}

		log.Printf("🔄 Applying migration %s...", version)
		if err := migrationFunc(tx); err != nil {
			return fmt.Errorf("failed to apply migration %s: %w", version, err)
		}

		migration := &Migration{
			Version:   version,
			AppliedAt: time.Now(),
		}
		if err := tx.Create(migration).Error; err != nil {
			return fmt.Errorf("failed to mark migration %s as applied: %w", version, err)
		}

		log.Printf("✅ Migration %s applied successfully", version)
		return nil
	})
}
