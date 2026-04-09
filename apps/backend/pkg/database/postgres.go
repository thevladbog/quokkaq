package database

import (
	"fmt"
	"log"
	"os"
	dbmodels "quokkaq-go-backend/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		host := os.Getenv("DB_HOST")
		user := os.Getenv("DB_USER")
		password := os.Getenv("DB_PASSWORD")
		dbname := os.Getenv("DB_NAME")
		port := os.Getenv("DB_PORT")
		sslmode := os.Getenv("DB_SSLMODE")

		if host != "" && user != "" && dbname != "" {
			if port == "" {
				port = "5432"
			}
			if sslmode == "" {
				sslmode = "disable"
			}
			// Use Key/Value format which is safer for special characters in passwords
			dsn = fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
				host, user, password, dbname, port, sslmode)
		}
	}

	if dsn == "" {
		log.Fatal("DATABASE_URL or DB_* environment variables are not set")
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Silent), // Suppress migration logs
		DisableForeignKeyConstraintWhenMigrating: true,                                  // Disable FK constraints during migration
	})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	fmt.Println("Database connected successfully")
}

// AutoMigrate runs auto-migrations for the given models
// This is kept for backward compatibility but should be replaced with versioned migrations
func AutoMigrate(models ...interface{}) {
	err := DB.AutoMigrate(models...)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}
	fmt.Println("Database migration completed")
}

// RunVersionedMigrations initializes migration tracking and runs all migrations
func RunVersionedMigrations(models ...interface{}) error {
	fmt.Println("Initializing migration system...")
	
	// Create migration manager
	manager := NewMigrationManager(DB)
	
	// Initialize migration tracking table
	if err := manager.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize migration tracking: %w", err)
	}

	// Run all tables migration
	err := manager.RunMigration("v1.0.0_core_tables", func(db *gorm.DB) error {
		return db.AutoMigrate(models...)
	})
	
	if err != nil {
		return fmt.Errorf("failed to run core tables migration: %w", err)
	}

	// One-time: legacy rows stored RUB plan price as whole rubles (e.g. 2900) instead of kopeks (290000).
	err = manager.RunMigration("v1.0.1_subscription_plan_prices_kopeks", func(db *gorm.DB) error {
		return db.Exec(`
			UPDATE subscription_plans
			SET price = price * 100, updated_at = NOW()
			WHERE price > 0
			  AND price < 10000
			  AND (UPPER(TRIM(COALESCE(currency, ''))) = 'RUB' OR TRIM(COALESCE(currency, '')) = '')
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run subscription plan prices migration: %w", err)
	}

	// Add pending plan scheduling columns on subscriptions (platform deferred tier changes).
	err = manager.RunMigration("v1.0.2_subscription_pending_plan", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.Subscription{})
	})
	if err != nil {
		return fmt.Errorf("failed to run subscription pending plan migration: %w", err)
	}

	// Invoices may exist without a subscription until linked; FK uses ON DELETE SET NULL.
	err = manager.RunMigration("v1.0.3_invoices_subscription_nullable", func(db *gorm.DB) error {
		if err := db.Exec(`
			DO $$
			DECLARE r RECORD;
			BEGIN
				FOR r IN (
					SELECT c.conname
					FROM pg_constraint c
					JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
					WHERE c.conrelid = 'invoices'::regclass
					  AND c.contype = 'f'
					  AND a.attname = 'subscription_id'
				) LOOP
					EXECUTE format('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS %I', r.conname);
				END LOOP;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE invoices ALTER COLUMN subscription_id DROP NOT NULL`).Error; err != nil {
			return err
		}
		return db.Exec(`
			ALTER TABLE invoices
			ADD CONSTRAINT invoices_subscription_id_fkey
			FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON UPDATE CASCADE ON DELETE SET NULL
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run invoices subscription nullable migration: %w", err)
	}

	// Counterparty (legal entity profile) JSON for tenant and platform billing forms.
	err = manager.RunMigration("v1.0.4_companies_counterparty", func(db *gorm.DB) error {
		return db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS counterparty JSONB`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run companies counterparty migration: %w", err)
	}

	// Single SaaS operator tenant per deployment (on-prem); unlimited quotas bypass in QuotaService.
	err = manager.RunMigration("v1.0.5_companies_saas_operator", func(db *gorm.DB) error {
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_saas_operator BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		return db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS companies_one_saas_operator_true
			ON companies (is_saas_operator)
			WHERE is_saas_operator = true
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run companies saas operator migration: %w", err)
	}

	fmt.Println("All migrations completed successfully")
	return nil
}
