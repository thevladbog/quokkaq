package database

import (
	"context"
	"fmt"
	"log"
	"os"
	dbmodels "quokkaq-go-backend/internal/models"
	"strconv"
	"strings"

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

// requirePostgresAtLeastVersionNum fails if server_version_num < minNum (e.g. 160000 = PostgreSQL 16.0).
func requirePostgresAtLeastVersionNum(db *gorm.DB, minNum int, what string) error {
	var verStr string
	if err := db.Raw(`SELECT current_setting('server_version_num')`).Scan(&verStr).Error; err != nil {
		return fmt.Errorf("read PostgreSQL server_version_num: %w", err)
	}
	v, err := strconv.Atoi(strings.TrimSpace(verStr))
	if err != nil {
		return fmt.Errorf("parse server_version_num %q: %w", verStr, err)
	}
	if v < minNum {
		maj, min := minNum/10000, (minNum/100)%100
		return fmt.Errorf("%s requires PostgreSQL %d.%d+ (current server_version_num=%d)", what, maj, min, v)
	}
	return nil
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
		if err := requirePostgresAtLeastVersionNum(db, 160000, "unique index units_company_parent_code_uq (NULLS NOT DISTINCT)"); err != nil {
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

	err = manager.RunMigration("v1.1.1_tickets_operator_comment", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE tickets ADD COLUMN IF NOT EXISTS operator_comment TEXT;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.Ticket{})
	})
	if err != nil {
		return fmt.Errorf("failed to run tickets operator_comment migration: %w", err)
	}

	err = manager.RunMigration("v1.1.2_counters_on_break_operator_intervals", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE counters ADD COLUMN IF NOT EXISTS on_break BOOLEAN NOT NULL DEFAULT false;
		`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(&dbmodels.Counter{}, &dbmodels.CounterOperatorInterval{}); err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_counter_operator_intervals_unit_started
			ON counter_operator_intervals (unit_id, started_at);
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run counters on_break operator_intervals migration: %w", err)
	}

	err = manager.RunMigration("v1.1.3_unit_clients_ticket_visitor_pre_reg_names", func(db *gorm.DB) error {
		if err := db.AutoMigrate(&dbmodels.UnitClient{}); err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_clients_unit_phone_e164
			ON unit_clients (unit_id, phone_e164)
			WHERE phone_e164 IS NOT NULL AND btrim(phone_e164) <> '';
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_clients_unit_anonymous_one
			ON unit_clients (unit_id)
			WHERE is_anonymous = true;
		`).Error; err != nil {
			return err
		}
		// Split pre-registration name into first/last (legacy customer_name → first name).
		if err := db.Exec(`
			ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS customer_first_name TEXT NOT NULL DEFAULT '';
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS customer_last_name TEXT NOT NULL DEFAULT '';
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_schema = 'public' AND table_name = 'pre_registrations' AND column_name = 'customer_name'
				) THEN
					UPDATE pre_registrations
					SET customer_first_name = COALESCE(customer_name, ''),
						customer_last_name = '';
					ALTER TABLE pre_registrations DROP COLUMN customer_name;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE tickets ADD COLUMN IF NOT EXISTS client_id UUID;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			INSERT INTO unit_clients (id, unit_id, first_name, last_name, phone_e164, is_anonymous, created_at, updated_at)
			SELECT gen_random_uuid(), u.id, 'Аноним', '', NULL, true, NOW(), NOW()
			FROM units u
			WHERE NOT EXISTS (
				SELECT 1 FROM unit_clients uc WHERE uc.unit_id = u.id AND uc.is_anonymous = true
			);
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE tickets t
			SET client_id = uc.id
			FROM unit_clients uc
			WHERE t.client_id IS NULL
				AND uc.unit_id = t.unit_id
				AND uc.is_anonymous = true;
		`).Error; err != nil {
			return err
		}
		// Composite fk_tickets_unit_client is added in v1.1.6_tickets_unit_client_composite_fk
		// so new installs do not briefly create a single-column FK on client_id only.
		return db.AutoMigrate(&dbmodels.Ticket{}, &dbmodels.PreRegistration{}, &dbmodels.UnitClient{})
	})
	if err != nil {
		return fmt.Errorf("failed to run unit_clients ticket visitor migration: %w", err)
	}

	err = manager.RunMigration("v1.1.4_unit_visitor_tags", func(db *gorm.DB) error {
		if err := db.AutoMigrate(
			&dbmodels.UnitVisitorTagDefinition{},
			&dbmodels.UnitClientTagAssignment{},
			&dbmodels.UnitClient{},
		); err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_unit_visitor_tag_definitions_unit_id
			ON unit_visitor_tag_definitions (unit_id);
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run unit visitor tags migration: %w", err)
	}

	// Initial single-column FKs; v1.1.7_unit_client_tag_assignments_unit_scope replaces them with composite unit-scoped FKs.
	err = manager.RunMigration("v1.1.5_unit_client_tag_assignment_fks", func(db *gorm.DB) error {
		return db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_uc_tag_assign_unit_client') THEN
					ALTER TABLE unit_client_tag_assignments
						ADD CONSTRAINT fk_uc_tag_assign_unit_client
						FOREIGN KEY (unit_client_id) REFERENCES unit_clients(id) ON DELETE CASCADE;
				END IF;
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_uc_tag_assign_tag_def') THEN
					ALTER TABLE unit_client_tag_assignments
						ADD CONSTRAINT fk_uc_tag_assign_tag_def
						FOREIGN KEY (tag_definition_id) REFERENCES unit_visitor_tag_definitions(id) ON DELETE CASCADE;
				END IF;
			END $$;
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run unit client tag assignment FK migration: %w", err)
	}

	err = manager.RunMigration("v1.1.6_tickets_unit_client_composite_fk", func(db *gorm.DB) error {
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_clients_id_unit_id
			ON unit_clients (id, unit_id);
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE tickets DROP CONSTRAINT IF EXISTS fk_tickets_unit_client;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE tickets t
			SET client_id = NULL
			WHERE t.client_id IS NOT NULL
				AND NOT EXISTS (
					SELECT 1 FROM unit_clients uc
					WHERE uc.id = t.client_id AND uc.unit_id = t.unit_id
				);
		`).Error; err != nil {
			return err
		}
		// PostgreSQL does not allow ON DELETE SET NULL when the FK includes tickets.unit_id,
		// because unit_id is NOT NULL; use NO ACTION so (client_id, unit_id) always matches a unit_clients row when client_id is set.
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_unit_client'
				) THEN
					ALTER TABLE tickets
					ADD CONSTRAINT fk_tickets_unit_client
					FOREIGN KEY (client_id, unit_id) REFERENCES unit_clients(id, unit_id)
					ON DELETE NO ACTION ON UPDATE CASCADE;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run tickets unit_client composite FK migration: %w", err)
	}

	err = manager.RunMigration("v1.1.7_unit_client_tag_assignments_unit_scope", func(db *gorm.DB) error {
		// Match unit_clients.unit_id type (uuid vs text) so UPDATE and composite FKs align with existing DBs.
		if err := db.Exec(`
			DO $$
			DECLARE
				coltype text;
			BEGIN
				SELECT format_type(a.atttypid, a.atttypmod) INTO coltype
				FROM pg_attribute a
				JOIN pg_class c ON a.attrelid = c.oid
				JOIN pg_namespace n ON c.relnamespace = n.oid
				WHERE n.nspname = 'public'
				  AND c.relname = 'unit_clients'
				  AND a.attname = 'unit_id'
				  AND NOT a.attisdropped
				  AND a.attnum > 0;
				IF coltype IS NULL THEN
					RAISE EXCEPTION 'unit_clients.unit_id column not found';
				END IF;
				EXECUTE format(
					'ALTER TABLE unit_client_tag_assignments ADD COLUMN IF NOT EXISTS unit_id %s',
					coltype
				);
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE unit_client_tag_assignments a
			SET unit_id = uc.unit_id
			FROM unit_clients uc
			WHERE a.unit_client_id = uc.id
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DELETE FROM unit_client_tag_assignments a
			WHERE a.unit_id IS NULL
			   OR NOT EXISTS (
					SELECT 1 FROM unit_visitor_tag_definitions t
					WHERE t.id = a.tag_definition_id AND t.unit_id = a.unit_id
				);
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE unit_client_tag_assignments ALTER COLUMN unit_id SET NOT NULL`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE unit_client_tag_assignments DROP CONSTRAINT IF EXISTS fk_uc_tag_assign_unit_client`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE unit_client_tag_assignments DROP CONSTRAINT IF EXISTS fk_uc_tag_assign_tag_def`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			DECLARE pkname text;
			BEGIN
				SELECT c.conname INTO pkname
				FROM pg_constraint c
				JOIN pg_class t ON c.conrelid = t.oid
				WHERE t.relname = 'unit_client_tag_assignments' AND c.contype = 'p';
				IF pkname IS NOT NULL THEN
					EXECUTE format('ALTER TABLE unit_client_tag_assignments DROP CONSTRAINT %I', pkname);
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_visitor_tag_definitions_id_unit_id
			ON unit_visitor_tag_definitions (id, unit_id);
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE unit_client_tag_assignments
				ADD CONSTRAINT pk_unit_client_tag_assignments PRIMARY KEY (unit_id, unit_client_id, tag_definition_id);
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_uc_tag_assign_unit_client_composite') THEN
					ALTER TABLE unit_client_tag_assignments
						ADD CONSTRAINT fk_uc_tag_assign_unit_client_composite
						FOREIGN KEY (unit_client_id, unit_id) REFERENCES unit_clients(id, unit_id)
						ON DELETE CASCADE ON UPDATE CASCADE;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_uc_tag_assign_tag_def_composite') THEN
					ALTER TABLE unit_client_tag_assignments
						ADD CONSTRAINT fk_uc_tag_assign_tag_def_composite
						FOREIGN KEY (tag_definition_id, unit_id) REFERENCES unit_visitor_tag_definitions(id, unit_id)
						ON DELETE CASCADE ON UPDATE CASCADE;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.UnitClientTagAssignment{}, &dbmodels.UnitClient{})
	})
	if err != nil {
		return fmt.Errorf("failed to run unit client tag assignment unit scope migration: %w", err)
	}

	err = manager.RunMigration("v1.1.8_ticket_history_journal_indexes", func(db *gorm.DB) error {
		// ListTicketHistoryByUnitID: ORDER BY h.created_at DESC, h.id DESC + keyset (created_at, id).
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_ticket_histories_created_at_id_desc
			ON ticket_histories (created_at DESC, id DESC);
		`).Error; err != nil {
			return err
		}
		// Same query filters joined rows with t.unit_id = ? — btree on unit_id helps the tickets side of the join.
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_tickets_unit_id
			ON tickets (unit_id);
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run ticket history journal indexes migration: %w", err)
	}

	fmt.Println("All migrations completed successfully")
	return nil
}
