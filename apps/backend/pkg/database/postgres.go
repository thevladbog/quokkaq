package database

import (
	"context"
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

// Ping checks connectivity to PostgreSQL using the GORM pool (*sql.DB).
func Ping(ctx context.Context) error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
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

	// Payment accounts (RU): bank name, BIC, correspondent and settlement account numbers.
	err = manager.RunMigration("v1.0.6_companies_payment_accounts", func(db *gorm.DB) error {
		return db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_accounts JSONB`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run companies payment accounts migration: %w", err)
	}

	// Platform catalog, multi-line invoices, document numbers, YooKassa link fields.
	err = manager.RunMigration("v1.0.7_platform_invoices_v2", func(db *gorm.DB) error {
		if err := db.AutoMigrate(
			&dbmodels.CatalogItem{},
			&dbmodels.InvoiceLine{},
			&dbmodels.InvoiceNumberSequence{},
			&dbmodels.Invoice{},
		); err != nil {
			return err
		}
		// Legacy single-amount rows: treat amount as net with no VAT until edited.
		if err := db.Exec(`
			UPDATE invoices i
			SET subtotal_excl_vat_minor = i.amount,
			    vat_total_minor = 0
			WHERE NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)
			  AND (subtotal_excl_vat_minor = 0 AND vat_total_minor = 0 AND i.amount > 0)
		`).Error; err != nil {
			return err
		}
		return db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS invoices_document_number_uq
			ON invoices (document_number)
			WHERE document_number IS NOT NULL AND btrim(document_number::text) <> ''
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run platform invoices v2 migration: %w", err)
	}

	// invoice_lines.unit: v1.0.7 may have created the table before the column existed in the model;
	// versioned migrations do not re-run AutoMigrate, so add the column explicitly.
	err = manager.RunMigration("v1.0.8_invoice_lines_unit_column", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE invoice_lines
			ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT ''
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.InvoiceLine{})
	})
	if err != nil {
		return fmt.Errorf("failed to run invoice_lines unit column migration: %w", err)
	}

	// Service zones + workplaces: hierarchy on units, composite unique (company_id, parent_id, code).
	err = manager.RunMigration("v1.0.9_units_service_zones", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE units ADD COLUMN IF NOT EXISTS parent_id TEXT;
			ALTER TABLE units ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'workplace';
			ALTER TABLE units ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE units SET kind = 'workplace' WHERE kind IS NULL OR btrim(kind) = '';
		`).Error; err != nil {
			return err
		}
		// Drop legacy single-column unique on code (name varies by GORM version).
		if err := db.Exec(`
			DO $$
			DECLARE r RECORD;
			BEGIN
				FOR r IN
					SELECT c.conname
					FROM pg_constraint c
					WHERE c.conrelid = 'units'::regclass
					  AND c.contype = 'u'
					  AND array_length(c.conkey, 1) = 1
					  AND EXISTS (
						SELECT 1 FROM pg_attribute a
						WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1] AND a.attname = 'code'
					  )
				LOOP
					EXECUTE format('ALTER TABLE units DROP CONSTRAINT IF EXISTS %I', r.conname);
				END LOOP;
			END $$;
		`).Error; err != nil {
			return err
		}
		// Drop legacy unique indexes on units(code) only (name varies by GORM/tooling);
		// constraints were removed above — this catches standalone unique indexes.
		if err := db.Exec(`
			DO $$
			DECLARE r RECORD;
			BEGIN
				FOR r IN
					SELECT n.nspname AS idx_schema, ic.relname AS idx_name
					FROM pg_index x
					JOIN pg_class ic ON ic.oid = x.indexrelid
					JOIN pg_namespace n ON n.oid = ic.relnamespace
					WHERE x.indrelid = 'units'::regclass
					  AND x.indisunique = true
					  AND NOT x.indisprimary
					  AND (
						  SELECT count(*)::int
						  FROM unnest(x.indkey::smallint[]) AS k(attnum)
						  WHERE k.attnum > 0
					  ) = 1
					  AND EXISTS (
						  SELECT 1
						  FROM unnest(x.indkey::smallint[]) AS k(attnum)
						  JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
						  WHERE k.attnum > 0 AND a.attname = 'code'
					  )
				LOOP
					EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.idx_schema, r.idx_name);
				END LOOP;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS units_company_parent_code_uq
			ON units (company_id, parent_id, code) NULLS NOT DISTINCT
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_units_company_parent ON units (company_id, parent_id)
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'units_parent_id_fkey' AND conrelid = 'units'::regclass
				) THEN
					ALTER TABLE units
					ADD CONSTRAINT units_parent_id_fkey
					FOREIGN KEY (parent_id) REFERENCES units(id) ON UPDATE CASCADE ON DELETE RESTRICT;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.Unit{})
	})
	if err != nil {
		return fmt.Errorf("failed to run units service zones migration: %w", err)
	}

	// Remove legacy workplace kind: map to subdivision and fix default.
	err = manager.RunMigration("v1.1.0_units_remove_workplace_kind", func(db *gorm.DB) error {
		if err := db.Exec(`
			UPDATE units SET kind = 'subdivision' WHERE kind = 'workplace' OR kind IS NULL OR btrim(kind) = '';
		`).Error; err != nil {
			return err
		}
		return db.Exec(`
			ALTER TABLE units ALTER COLUMN kind SET DEFAULT 'subdivision';
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run units remove workplace migration: %w", err)
	}

	fmt.Println("All migrations completed successfully")
	return nil
}
