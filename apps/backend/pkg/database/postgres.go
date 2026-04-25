package database

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	applogger "quokkaq-go-backend/internal/logger"
	dbmodels "quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/tenantroleseed"
	"strconv"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect() error {
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
		applogger.Error("DATABASE_URL or DB_* environment variables are not set")
		return fmt.Errorf("DATABASE_URL or DB_* environment variables are not set")
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                                   gormlogger.Default.LogMode(gormlogger.Silent), // Suppress migration logs
		DisableForeignKeyConstraintWhenMigrating: true,                                          // Disable FK constraints during migration
	})
	if err != nil {
		applogger.Error("failed to connect to database", "err", err)
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	slog.Info("database connected")
	return nil
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

// backfillInvitationsTemplatesCompanyID resolves nullable company_id using tenant-scoped data:
// invitations from target_units → units.company_id, then user_id → user_units → units;
// message_templates from an optional owner column (user_id / creator_id) → user_units → units when present.
// The "oldest company" fallback runs only when exactly one company exists. With multiple companies,
// unresolved rows abort the migration so operators can fix data instead of mis-attributing tenants.
func backfillInvitationsTemplatesCompanyID(db *gorm.DB) error {
	var companyCount int64
	if err := db.Raw(`SELECT COUNT(*) FROM companies`).Scan(&companyCount).Error; err != nil {
		return fmt.Errorf("count companies: %w", err)
	}

	var ambTU int64
	qAmbTU := `
SELECT COUNT(*) FROM (
	SELECT i.id
	FROM invitations i
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE WHEN jsonb_typeof(COALESCE(i.target_units::jsonb, '[]'::jsonb)) = 'array'
			THEN COALESCE(i.target_units::jsonb, '[]'::jsonb)
			ELSE '[]'::jsonb
		END
	) AS elem
	INNER JOIN units u ON u.id = (elem->>'unitId')
	WHERE i.company_id IS NULL
	GROUP BY i.id
	HAVING COUNT(DISTINCT u.company_id) > 1
) sub`
	if err := db.Raw(qAmbTU).Scan(&ambTU).Error; err != nil {
		return fmt.Errorf("check invitations ambiguous target_units: %w", err)
	}
	if ambTU > 0 {
		return fmt.Errorf("migration: %d invitation(s) have target_units referencing units in multiple companies; fix rows before continuing", ambTU)
	}

	var ambUser int64
	qAmbUser := `
SELECT COUNT(*) FROM (
	SELECT i.id
	FROM invitations i
	INNER JOIN user_units uu ON uu.user_id = i.user_id
	INNER JOIN units u ON u.id = uu.unit_id
	WHERE i.company_id IS NULL AND i.user_id IS NOT NULL
	GROUP BY i.id
	HAVING COUNT(DISTINCT u.company_id) > 1
) sub`
	if err := db.Raw(qAmbUser).Scan(&ambUser).Error; err != nil {
		return fmt.Errorf("check invitations ambiguous user_id: %w", err)
	}
	if ambUser > 0 {
		return fmt.Errorf("migration: %d invitation(s) have user_id spanning multiple companies via user_units; fix rows before continuing", ambUser)
	}

	var tplOwnerCol string
	if err := db.Raw(`
SELECT c.column_name FROM information_schema.columns c
WHERE c.table_schema = current_schema()
  AND c.table_name = 'message_templates'
  AND c.column_name IN ('user_id', 'creator_id')
ORDER BY CASE c.column_name WHEN 'user_id' THEN 1 ELSE 2 END
LIMIT 1`).Scan(&tplOwnerCol).Error; err != nil {
		return fmt.Errorf("resolve message_templates owner column: %w", err)
	}
	if tplOwnerCol != "" {
		var ambTpl int64
		qAmbTpl := fmt.Sprintf(`
SELECT COUNT(*) FROM (
	SELECT t.id
	FROM message_templates t
	INNER JOIN user_units uu ON uu.user_id = t.%s
	INNER JOIN units u ON u.id = uu.unit_id
	WHERE t.company_id IS NULL
	GROUP BY t.id
	HAVING COUNT(DISTINCT u.company_id) > 1
) sub`, tplOwnerCol)
		if err := db.Raw(qAmbTpl).Scan(&ambTpl).Error; err != nil {
			return fmt.Errorf("check message_templates ambiguous owner company: %w", err)
		}
		if ambTpl > 0 {
			return fmt.Errorf("migration: %d message_template(s) have %s spanning multiple companies via user_units; fix rows before continuing", ambTpl, tplOwnerCol)
		}
	}

	qInvTU := `
WITH inv_src AS (
	SELECT i.id AS invitation_id,
	       MIN(u.company_id) AS cid
	FROM invitations i
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE WHEN jsonb_typeof(COALESCE(i.target_units::jsonb, '[]'::jsonb)) = 'array'
			THEN COALESCE(i.target_units::jsonb, '[]'::jsonb)
			ELSE '[]'::jsonb
		END
	) AS elem
	INNER JOIN units u ON u.id = (elem->>'unitId')
	WHERE i.company_id IS NULL
	GROUP BY i.id
	HAVING COUNT(DISTINCT u.company_id) = 1
)
UPDATE invitations i
SET company_id = inv_src.cid
FROM inv_src
WHERE i.id = inv_src.invitation_id`
	res := db.Exec(qInvTU)
	if res.Error != nil {
		return fmt.Errorf("backfill invitations from target_units: %w", res.Error)
	}
	slog.Info("migration backfill: invitations company_id from target_units→units", "rows", res.RowsAffected)

	qInvUU := `
WITH inv_src AS (
	SELECT i.id AS invitation_id,
	       MIN(u.company_id) AS cid
	FROM invitations i
	INNER JOIN user_units uu ON uu.user_id = i.user_id
	INNER JOIN units u ON u.id = uu.unit_id
	WHERE i.company_id IS NULL AND i.user_id IS NOT NULL
	GROUP BY i.id
	HAVING COUNT(DISTINCT u.company_id) = 1
)
UPDATE invitations i
SET company_id = inv_src.cid
FROM inv_src
WHERE i.id = inv_src.invitation_id`
	res = db.Exec(qInvUU)
	if res.Error != nil {
		return fmt.Errorf("backfill invitations from user_id→user_units→units: %w", res.Error)
	}
	slog.Info("migration backfill: invitations company_id from user_id→user_units→units", "rows", res.RowsAffected)

	if tplOwnerCol != "" {
		qTpl := fmt.Sprintf(`
WITH tpl_src AS (
	SELECT t.id AS template_id,
	       MIN(u.company_id) AS cid
	FROM message_templates t
	INNER JOIN user_units uu ON uu.user_id = t.%s
	INNER JOIN units u ON u.id = uu.unit_id
	WHERE t.company_id IS NULL
	GROUP BY t.id
	HAVING COUNT(DISTINCT u.company_id) = 1
)
UPDATE message_templates t
SET company_id = tpl_src.cid
FROM tpl_src
WHERE t.id = tpl_src.template_id`, tplOwnerCol)
		res = db.Exec(qTpl)
		if res.Error != nil {
			return fmt.Errorf("backfill message_templates from %s→user_units→units: %w", tplOwnerCol, res.Error)
		}
		slog.Info("migration backfill: message_templates company_id from owner column", "column", tplOwnerCol, "rows", res.RowsAffected)
	} else {
		slog.Info("migration backfill: message_templates skipped (no user_id/creator_id column)")
	}

	var invNulls, tplNulls int64
	if err := db.Raw(`SELECT COUNT(*) FROM invitations WHERE company_id IS NULL`).Scan(&invNulls).Error; err != nil {
		return fmt.Errorf("count invitations with null company_id: %w", err)
	}
	if err := db.Raw(`SELECT COUNT(*) FROM message_templates WHERE company_id IS NULL`).Scan(&tplNulls).Error; err != nil {
		return fmt.Errorf("count message_templates with null company_id: %w", err)
	}
	slog.Info("migration backfill: null company_id counts after targeted updates", "invitations", invNulls, "message_templates", tplNulls, "companies", companyCount)

	if companyCount > 1 && (invNulls > 0 || tplNulls > 0) {
		slog.Warn("migration backfill: aborting — unresolved company_id with multiple tenants", "invitations_null", invNulls, "message_templates_null", tplNulls, "companies", companyCount)
		return fmt.Errorf("migration: cannot resolve company_id for %d invitation(s) and %d message_template(s) with %d companies present; assign tenant scope manually or reduce to a single company", invNulls, tplNulls, companyCount)
	}

	if companyCount == 1 && (invNulls > 0 || tplNulls > 0) {
		res = db.Exec(`
			UPDATE invitations i
			SET company_id = c.id
			FROM (SELECT id FROM companies ORDER BY created_at ASC NULLS LAST LIMIT 1) AS c
			WHERE i.company_id IS NULL
		`)
		if res.Error != nil {
			return fmt.Errorf("fallback invitations to sole company: %w", res.Error)
		}
		slog.Info("migration backfill: invitations fallback to sole company", "rows", res.RowsAffected)

		res = db.Exec(`
			UPDATE message_templates t
			SET company_id = c.id
			FROM (SELECT id FROM companies ORDER BY created_at ASC NULLS LAST LIMIT 1) AS c
			WHERE t.company_id IS NULL
		`)
		if res.Error != nil {
			return fmt.Errorf("fallback message_templates to sole company: %w", res.Error)
		}
		slog.Info("migration backfill: message_templates fallback to sole company", "rows", res.RowsAffected)
	} else if companyCount == 0 && (invNulls > 0 || tplNulls > 0) {
		slog.Info("migration backfill: null company_id rows remain with zero companies (will be deleted next)", "invitations", invNulls, "message_templates", tplNulls)
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
func AutoMigrate(models ...interface{}) error {
	err := DB.AutoMigrate(models...)
	if err != nil {
		applogger.Error("failed to migrate database", "err", err)
		return fmt.Errorf("failed to migrate database: %w", err)
	}
	slog.Info("database migration completed")
	return nil
}

// RunVersionedMigrations initializes migration tracking and runs all migrations
func RunVersionedMigrations(models ...interface{}) error {
	fmt.Println("🗄️ Initializing migration system...")

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

	err = manager.RunMigration("v1.1.9_unit_client_histories", func(db *gorm.DB) error {
		// IDs match units.id / users.id / unit_clients (text), not uuid — FK 42804 otherwise.
		// Never DROP here: environments that already ran an older revision of this migration
		// with DROP+CASCADE have lost historical rows; changing this block only helps new DBs
		// and idempotent re-runs on partially migrated schemas.
		if err := db.Exec(`
			CREATE TABLE IF NOT EXISTS unit_client_histories (
				id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
				unit_id text NOT NULL,
				unit_client_id text NOT NULL,
				actor_user_id text NULL,
				action text NOT NULL,
				payload jsonb NOT NULL DEFAULT '{}'::jsonb,
				created_at timestamptz NOT NULL DEFAULT now()
			);
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_unit_client_histories_unit') THEN
					ALTER TABLE unit_client_histories
						ADD CONSTRAINT fk_unit_client_histories_unit
						FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_unit_client_histories_actor') THEN
					ALTER TABLE unit_client_histories
						ADD CONSTRAINT fk_unit_client_histories_actor
						FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_unit_client_histories_client') THEN
					ALTER TABLE unit_client_histories
						ADD CONSTRAINT fk_unit_client_histories_client
						FOREIGN KEY (unit_client_id, unit_id) REFERENCES unit_clients(id, unit_id) ON DELETE CASCADE;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_unit_client_histories_client_created
			ON unit_client_histories (unit_id, unit_client_id, created_at DESC, id DESC);
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.UnitClientHistory{})
	})
	if err != nil {
		return fmt.Errorf("failed to run unit client histories migration: %w", err)
	}

	err = manager.RunMigration("v1.1.10_service_zones_tickets_counters", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE services
			ADD COLUMN IF NOT EXISTS restricted_service_zone_id text REFERENCES units(id) ON DELETE SET NULL;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE tickets
			ADD COLUMN IF NOT EXISTS service_zone_id text REFERENCES units(id) ON DELETE SET NULL;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE counters
			ADD COLUMN IF NOT EXISTS service_zone_id text REFERENCES units(id) ON DELETE SET NULL;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_tickets_unit_waiting_zone
			ON tickets (unit_id, status, service_zone_id)
			WHERE status = 'waiting' AND is_eod = false;
		`).Error; err != nil {
			return err
		}
		// Explicit FKs: columns may exist from AutoMigrate with FK disabled; inline REFERENCES on ADD COLUMN is then a no-op.
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_services_restricted_service_zone') THEN
					ALTER TABLE services
						ADD CONSTRAINT fk_services_restricted_service_zone
						FOREIGN KEY (restricted_service_zone_id) REFERENCES units(id) ON DELETE SET NULL;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_service_zone') THEN
					ALTER TABLE tickets
						ADD CONSTRAINT fk_tickets_service_zone
						FOREIGN KEY (service_zone_id) REFERENCES units(id) ON DELETE SET NULL;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_counters_service_zone') THEN
					ALTER TABLE counters
						ADD CONSTRAINT fk_counters_service_zone
						FOREIGN KEY (service_zone_id) REFERENCES units(id) ON DELETE SET NULL;
				END IF;
			END $$;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.Service{}, &dbmodels.Ticket{}, &dbmodels.Counter{})
	})
	if err != nil {
		return fmt.Errorf("failed to run service zones migration: %w", err)
	}

	err = manager.RunMigration("v1.1.11_services_offer_identification", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE services
			ADD COLUMN IF NOT EXISTS offer_identification boolean NOT NULL DEFAULT false;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.Service{})
	})
	if err != nil {
		return fmt.Errorf("failed to run services offer_identification migration: %w", err)
	}

	err = manager.RunMigration("v1.1.12_counter_guest_survey", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE desktop_terminals
			ADD COLUMN IF NOT EXISTS counter_id text REFERENCES counters(id) ON DELETE SET NULL;
		`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(&dbmodels.SurveyDefinition{}, &dbmodels.SurveyResponse{}); err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_definitions_one_active_per_scope
			ON survey_definitions (scope_unit_id) WHERE is_active = true;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_ticket_survey
			ON survey_responses (ticket_id, survey_definition_id);
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run counter guest survey migration: %w", err)
	}

	err = manager.RunMigration("v1.1.13_survey_completion_message", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE survey_definitions
			ADD COLUMN IF NOT EXISTS completion_message jsonb;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.SurveyDefinition{})
	})
	if err != nil {
		return fmt.Errorf("failed to run survey completion message migration: %w", err)
	}

	err = manager.RunMigration("v1.1.14_survey_display_theme", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE survey_definitions
			ADD COLUMN IF NOT EXISTS display_theme jsonb;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.SurveyDefinition{})
	})
	if err != nil {
		return fmt.Errorf("failed to run survey display theme migration: %w", err)
	}

	err = manager.RunMigration("v1.1.15_survey_idle_screen", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE survey_definitions
			ADD COLUMN IF NOT EXISTS idle_screen jsonb;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.SurveyDefinition{})
	})
	if err != nil {
		return fmt.Errorf("failed to run survey idle screen migration: %w", err)
	}

	err = manager.RunMigration("v1.1.16_statistics_daily_buckets_service_zone", func(db *gorm.DB) error {
		// v1.0.0_core_tables already ran before StatisticsDailyBucket existed, so some DBs never got this table.
		var tableExists bool
		if err := db.Raw(`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_schema = 'public' AND table_name = 'statistics_daily_buckets'
			)
		`).Scan(&tableExists).Error; err != nil {
			return err
		}
		if !tableExists {
			return db.AutoMigrate(&dbmodels.StatisticsDailyBucket{})
		}
		if err := db.Exec(`
			ALTER TABLE statistics_daily_buckets
			ADD COLUMN IF NOT EXISTS service_zone_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
		`).Error; err != nil {
			return err
		}
		// Replace legacy 3-column unique index with 4-column uniqueness (incl. service zone slice).
		_ = db.Exec(`DROP INDEX IF EXISTS uniq_stat_daily`).Error
		_ = db.Exec(`DROP INDEX IF EXISTS idx_statistics_daily_buckets_uniq_stat_daily`).Error
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS uniq_stat_daily_service_zone
			ON statistics_daily_buckets (unit_id, bucket_date, actor_user_id, service_zone_id);
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.StatisticsDailyBucket{})
	})
	if err != nil {
		return fmt.Errorf("failed to run statistics service_zone migration: %w", err)
	}

	err = manager.RunMigration("v1.1.17_statistics_survey_daily", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.StatisticsSurveyDaily{})
	})
	if err != nil {
		return fmt.Errorf("failed to run statistics_survey_daily migration: %w", err)
	}

	err = manager.RunMigration("v1.1.18_unit_operational_states_ensure", func(db *gorm.DB) error {
		// DBs where v1.0.0 ran before UnitOperationalState existed never got this table from core AutoMigrate.
		return db.AutoMigrate(&dbmodels.UnitOperationalState{})
	})
	if err != nil {
		return fmt.Errorf("failed to run unit_operational_states migration: %w", err)
	}

	err = manager.RunMigration("v1.2.0_sso_tenant_slug", func(db *gorm.DB) error {
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS strict_public_tenant_resolve BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS opaque_login_links_only BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS sso_jit_provisioning BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(
			&dbmodels.CompanySSOConnection{},
			&dbmodels.UserExternalIdentity{},
			&dbmodels.TenantLoginLink{},
		); err != nil {
			return err
		}
		var companies []dbmodels.Company
		if err := db.Where("slug IS NULL OR btrim(COALESCE(slug,'')) = ''").Find(&companies).Error; err != nil {
			return err
		}
		for i := range companies {
			c := &companies[i]
			base := tenantslug.Normalize(c.Name)
			if len(base) < tenantslug.MinLen {
				base = "tenant"
			}
			var slug string
			found := false
			for attempt := 0; attempt < 50; attempt++ {
				if attempt == 0 {
					slug = base
				} else {
					slug = fmt.Sprintf("%s-%d", base, attempt)
				}
				var n int64
				if err := db.Model(&dbmodels.Company{}).Where("slug = ?", slug).Count(&n).Error; err != nil {
					return err
				}
				if n == 0 {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("unable to generate unique company slug after 50 attempts for company id %s", c.ID)
			}
			if err := db.Model(c).Update("slug", slug).Error; err != nil {
				return err
			}
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_uq ON companies (slug) WHERE btrim(COALESCE(slug, '')) <> ''
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.0_sso_tenant_slug migration: %w", err)
	}

	err = manager.RunMigration("v1.2.1_sso_audit_events", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.SSOAuditEvent{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.1_sso_audit_events migration: %w", err)
	}

	err = manager.RunMigration("v1.2.2_sso_saml_protocol", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.CompanySSOConnection{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.2_sso_saml_protocol migration: %w", err)
	}

	err = manager.RunMigration("v1.2.3_calendar_integration", func(db *gorm.DB) error {
		if err := db.AutoMigrate(
			&dbmodels.UnitCalendarIntegration{},
			&dbmodels.CalendarExternalSlot{},
			&dbmodels.CalendarSyncIncident{},
		); err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.PreRegistration{}, &dbmodels.Service{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.3_calendar_integration migration: %w", err)
	}

	err = manager.RunMigration("v1.2.4_calendar_multi_per_unit", func(db *gorm.DB) error {
		// Drop unique index on unit_id (GORM name may vary; drop known patterns).
		if err := db.Exec(`
			DROP INDEX IF EXISTS uni_unit_calendar_integrations_unit_id;
			DROP INDEX IF EXISTS idx_unit_calendar_integrations_unit_id;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE unit_calendar_integrations
			ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'yandex_caldav';
			ALTER TABLE unit_calendar_integrations
			ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_unit_calendar_integrations_unit_id
			ON unit_calendar_integrations (unit_id);
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.UnitCalendarIntegration{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.4_calendar_multi_per_unit migration: %w", err)
	}

	err = manager.RunMigration("v1.2.5_services_calendar_slot_key_unique", func(db *gorm.DB) error {
		return db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_services_unit_calendar_slot_key_uq
			ON services (unit_id, calendar_slot_key)
			WHERE calendar_slot_key IS NOT NULL AND btrim(calendar_slot_key) <> ''
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.5_services_calendar_slot_key_unique migration: %w", err)
	}

	// SupportReport was added to v1.0.0_core_tables model list after many DBs already applied it — create table explicitly.
	err = manager.RunMigration("v1.2.6_support_reports", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.SupportReport{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.6_support_reports migration: %w", err)
	}

	err = manager.RunMigration("v1.2.7_support_report_ticket_backend", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.SupportReport{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.7_support_report_ticket_backend migration: %w", err)
	}

	err = manager.RunMigration("v1.2.8_support_report_shares_and_description", func(db *gorm.DB) error {
		if err := db.AutoMigrate(&dbmodels.SupportReport{}); err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.SupportReportShare{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.8_support_report_shares_and_description migration: %w", err)
	}

	err = manager.RunMigration("v1.2.9_subscription_plan_is_public", func(db *gorm.DB) error {
		return db.Exec(`
			ALTER TABLE subscription_plans
			ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.9_subscription_plan_is_public migration: %w", err)
	}

	err = manager.RunMigration("v1.2.10_subscription_plan_display_and_purchase", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE subscription_plans
			ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 1000;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE subscription_plans
			ADD COLUMN IF NOT EXISTS limits_negotiable jsonb NOT NULL DEFAULT '{}'::jsonb;
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE subscription_plans
			ADD COLUMN IF NOT EXISTS allow_instant_purchase boolean NOT NULL DEFAULT true;
		`).Error; err != nil {
			return err
		}
		// Preserve legacy ordering for known plan codes until admins set display_order explicitly.
		if err := db.Exec(`
			UPDATE subscription_plans SET display_order = 1 WHERE code = 'starter';
			UPDATE subscription_plans SET display_order = 2 WHERE code = 'professional';
			UPDATE subscription_plans SET display_order = 3 WHERE code = 'enterprise';
			UPDATE subscription_plans SET display_order = 99 WHERE code = 'grandfathered';
		`).Error; err != nil {
			return err
		}
		// Column defaults above are generic (true); align special tiers with pkg/plans + cmd/seed-plans
		// so migration-only DBs match seed behavior (grandfathered hidden; enterprise sales-led checkout).
		if err := db.Exec(`
			UPDATE subscription_plans SET is_public = false WHERE code = 'grandfathered';
			UPDATE subscription_plans SET allow_instant_purchase = false WHERE code IN ('enterprise', 'grandfathered');
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.10_subscription_plan_display_and_purchase migration: %w", err)
	}

	err = manager.RunMigration("v1.2.11_subscription_plan_is_promoted", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE subscription_plans
			ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false;
		`).Error; err != nil {
			return err
		}
		// One promoted plan for public lists; default matches previous marketing hard-code.
		if err := db.Exec(`
			UPDATE subscription_plans SET is_promoted = false;
			UPDATE subscription_plans SET is_promoted = true
			WHERE code = 'professional' AND is_active = true AND is_public = true;
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.11_subscription_plan_is_promoted migration: %w", err)
	}

	err = manager.RunMigration("v1.2.12_subscription_plan_name_en", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE subscription_plans
			ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '';
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE subscription_plans SET name_en = 'Starter' WHERE code = 'starter' AND name_en = '';
			UPDATE subscription_plans SET name_en = 'Professional' WHERE code = 'professional' AND name_en = '';
			UPDATE subscription_plans SET name_en = 'Enterprise' WHERE code = 'enterprise' AND name_en = '';
			UPDATE subscription_plans SET name_en = 'Grandfathered' WHERE code = 'grandfathered' AND name_en = '';
			UPDATE subscription_plans SET name_en = name WHERE name_en = '' AND trim(name) <> '';
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.12_subscription_plan_name_en migration: %w", err)
	}

	err = manager.RunMigration("v1.2.13_subscription_plan_grandfathered_visibility", func(db *gorm.DB) error {
		return db.Exec(`
			UPDATE subscription_plans
			SET is_public = false, allow_instant_purchase = false
			WHERE code = 'grandfathered';
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.13_subscription_plan_grandfathered_visibility migration: %w", err)
	}

	err = manager.RunMigration("v1.2.14_subscription_plan_single_promoted", func(db *gorm.DB) error {
		// At most one promoted row before the partial unique index (idempotent cleanup).
		if err := db.Exec(`
			UPDATE subscription_plans p
			SET is_promoted = false
			WHERE p.is_promoted = true
			  AND p.id <> (
				SELECT s.id FROM subscription_plans s
				WHERE s.is_promoted = true
				ORDER BY s.display_order, s.code
				LIMIT 1
			  );
		`).Error; err != nil {
			return err
		}
		return db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS ux_subscription_plans_single_promoted
			ON subscription_plans ((1))
			WHERE is_promoted = true;
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.14_subscription_plan_single_promoted migration: %w", err)
	}

	// Idempotent backfill for DBs that already ran v1.2.12 before name_en fallback was added there.
	err = manager.RunMigration("v1.2.15_subscription_plan_name_en_fallback", func(db *gorm.DB) error {
		return db.Exec(`
			UPDATE subscription_plans SET name_en = name WHERE name_en = '' AND trim(name) <> '';
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.15_subscription_plan_name_en_fallback migration: %w", err)
	}

	// DBs that ran v1.2.10 before enterprise/grandfathered overrides were added there: sales-led enterprise tier.
	err = manager.RunMigration("v1.2.16_subscription_plan_enterprise_allow_instant_purchase", func(db *gorm.DB) error {
		return db.Exec(`
			UPDATE subscription_plans SET allow_instant_purchase = false WHERE code = 'enterprise';
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.16_subscription_plan_enterprise_allow_instant_purchase migration: %w", err)
	}

	err = manager.RunMigration("v1.2.17_users_photo_url", func(db *gorm.DB) error {
		return db.Exec(`
			ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.17_users_photo_url migration: %w", err)
	}

	err = manager.RunMigration("v1.2.18_units_name_en", func(db *gorm.DB) error {
		return db.Exec(`
			ALTER TABLE units ADD COLUMN IF NOT EXISTS name_en TEXT;
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.18_units_name_en migration: %w", err)
	}

	// v1.2.19_user_units_unique_user_unit: reserved version key (may already be applied with an older body).
	// Canonical DDL + permission-safe dedupe lives in v1.2.20_user_units_merge_permissions_dedupe_unique.
	err = manager.RunMigration("v1.2.19_user_units_unique_user_unit", func(db *gorm.DB) error {
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.19_user_units_unique_user_unit migration: %w", err)
	}

	// Required for UserRepository.AssignUnit ON CONFLICT (user_id, unit_id); merges permissions before removing duplicate rows, then ensures the unique index.
	err = manager.RunMigration("v1.2.20_user_units_merge_permissions_dedupe_unique", func(db *gorm.DB) error {
		return db.Transaction(func(tx *gorm.DB) error {
			// Merge permissions across duplicate (user_id, unit_id) rows before deleting extras so we never drop rights.
			if err := tx.Exec(`
				WITH merged AS (
					SELECT u.user_id, u.unit_id,
						ARRAY(
							SELECT DISTINCT p
							FROM user_units u2,
							LATERAL unnest(COALESCE(u2.permissions, '{}'::text[])) AS p
							WHERE u2.user_id = u.user_id AND u2.unit_id = u.unit_id
						) AS merged_perms
					FROM user_units u
					GROUP BY u.user_id, u.unit_id
					HAVING COUNT(*) > 1
				),
				keepers AS (
					SELECT user_id, unit_id, MAX(ctid) AS keeper_ctid
					FROM user_units
					GROUP BY user_id, unit_id
					HAVING COUNT(*) > 1
				)
				UPDATE user_units u
				SET permissions = m.merged_perms
				FROM merged m
				JOIN keepers k ON k.user_id = m.user_id AND k.unit_id = m.unit_id
				WHERE u.ctid = k.keeper_ctid;
			`).Error; err != nil {
				return err
			}
			if err := tx.Exec(`
				DELETE FROM user_units u1
				USING user_units u2
				WHERE u1.user_id = u2.user_id AND u1.unit_id = u2.unit_id AND u1.ctid < u2.ctid;
			`).Error; err != nil {
				return err
			}
			return tx.Exec(`
				CREATE UNIQUE INDEX IF NOT EXISTS ux_user_units_user_unit ON user_units (user_id, unit_id);
			`).Error
		})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.2.20_user_units_merge_permissions_dedupe_unique migration: %w", err)
	}

	err = manager.RunMigration("v1.3.0_sso_tenant_rbac_and_profile", func(db *gorm.DB) error {
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS sso_access_source VARCHAR(32) NOT NULL DEFAULT 'manual'`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS exempt_from_sso_sync BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_profile_sync_opt_out BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		// Ensure table exists before ALTER/INDEX on user_external_identities (fresh DBs may not have run earlier AutoMigrate yet).
		if err := db.AutoMigrate(&dbmodels.UserExternalIdentity{}); err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE user_external_identities ADD COLUMN IF NOT EXISTS external_object_id TEXT`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE UNIQUE INDEX IF NOT EXISTS uq_user_ext_company_oid
			ON user_external_identities (company_id, external_object_id)
			WHERE external_object_id IS NOT NULL AND btrim(external_object_id) <> ''
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(
			&dbmodels.TenantRole{},
			&dbmodels.TenantRoleUnit{},
			&dbmodels.UserTenantRole{},
			&dbmodels.CompanySSOGroupMapping{},
		)
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.0_sso_tenant_rbac_and_profile migration: %w", err)
	}

	err = manager.RunMigration("v1.3.1_system_tenant_admin_role", func(db *gorm.DB) error {
		return tenantroleseed.BackfillAllCompanies(db)
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.1_system_tenant_admin_role migration: %w", err)
	}

	err = manager.RunMigration("v1.3.2_company_sso_group_mappings_xor_timestamps", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE company_sso_group_mappings
			ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE company_sso_group_mappings
			ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		`).Error; err != nil {
			return err
		}
		// Normalize empty strings so XOR matches intent.
		if err := db.Exec(`
			UPDATE company_sso_group_mappings
			SET tenant_role_id = NULL
			WHERE tenant_role_id IS NOT NULL AND length(btrim(tenant_role_id::text)) = 0
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE company_sso_group_mappings
			SET legacy_role_name = NULL
			WHERE legacy_role_name IS NOT NULL AND length(btrim(legacy_role_name)) = 0
		`).Error; err != nil {
			return err
		}
		// Invalid: no target.
		if err := db.Exec(`
			DELETE FROM company_sso_group_mappings
			WHERE tenant_role_id IS NULL AND legacy_role_name IS NULL
		`).Error; err != nil {
			return err
		}
		// Both set: prefer tenant role (IdP RBAC); drop legacy so CHECK passes.
		if err := db.Exec(`
			UPDATE company_sso_group_mappings
			SET legacy_role_name = NULL
			WHERE tenant_role_id IS NOT NULL AND legacy_role_name IS NOT NULL
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE company_sso_group_mappings
			DROP CONSTRAINT IF EXISTS chk_company_sso_group_mappings_tenant_xor_legacy
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE company_sso_group_mappings
			ADD CONSTRAINT chk_company_sso_group_mappings_tenant_xor_legacy
			CHECK ((tenant_role_id IS NOT NULL) <> (legacy_role_name IS NOT NULL))
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.CompanySSOGroupMapping{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.2_company_sso_group_mappings_xor_timestamps migration: %w", err)
	}

	err = manager.RunMigration("v1.3.3_desktop_terminal_kind", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE desktop_terminals
			ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'kiosk';
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			UPDATE desktop_terminals
			SET kind = 'counter_guest_survey'
			WHERE counter_id IS NOT NULL AND length(trim(counter_id)) > 0;
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.DesktopTerminal{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.3_desktop_terminal_kind migration: %w", err)
	}

	err = manager.RunMigration("v1.3.4_subscription_features_counter_board", func(db *gorm.DB) error {
		// Enable counter board (above-counter ticket display) on all standard plans; guest survey stays gated separately.
		return db.Exec(`
			UPDATE subscription_plans
			SET features = COALESCE(features::jsonb, '{}'::jsonb) || '{"counter_board": true}'::jsonb
			WHERE code IN ('starter', 'professional', 'enterprise', 'grandfathered');
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.4_subscription_features_counter_board migration: %w", err)
	}

	err = manager.RunMigration("v1.3.5_desktop_terminal_kind_kiosk_counter_repair", func(db *gorm.DB) error {
		// Safety backfill: rows must not stay kind=kiosk when bound to a counter (do not edit v1.3.3 — add new migrations only).
		return db.Exec(`
			UPDATE desktop_terminals
			SET kind = 'counter_guest_survey'
			WHERE counter_id IS NOT NULL
			  AND length(trim(counter_id)) > 0
			  AND kind = 'kiosk';
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.5_desktop_terminal_kind_kiosk_counter_repair migration: %w", err)
	}

	err = manager.RunMigration("v1.3.6_subscription_features_counter_board_all_plans", func(db *gorm.DB) error {
		// v1.3.4 only updated a fixed set of plan codes; merge counter_board for every plan row (idempotent).
		return db.Exec(`
			UPDATE subscription_plans
			SET features = COALESCE(features::jsonb, '{}'::jsonb) || '{"counter_board": true}'::jsonb
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.6_subscription_features_counter_board_all_plans migration: %w", err)
	}

	err = manager.RunMigration("v1.3.7_system_admin_user_units_all_units", func(tx *gorm.DB) error {
		return tenantroleseed.BackfillSystemAdminUserUnits(tx)
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.7_system_admin_user_units_all_units migration: %w", err)
	}

	err = manager.RunMigration("v1.3.8_desktop_terminal_kind_counter_normalize", func(db *gorm.DB) error {
		// Match models.EffectiveTerminalKind for rows bound to a counter: normalize casing for
		// counter_board / counter_guest_survey; map legacy kiosk, empty kind, and unknown values to counter_guest_survey.
		return db.Exec(`
			UPDATE desktop_terminals
			SET kind = CASE
				WHEN lower(trim(coalesce(kind, ''))) = 'counter_board' THEN 'counter_board'
				WHEN lower(trim(coalesce(kind, ''))) = 'counter_guest_survey' THEN 'counter_guest_survey'
				ELSE 'counter_guest_survey'
			END
			WHERE counter_id IS NOT NULL
			  AND length(trim(counter_id::text)) > 0
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.8_desktop_terminal_kind_counter_normalize migration: %w", err)
	}

	err = manager.RunMigration("v1.3.9_deployment_saas_settings", func(db *gorm.DB) error {
		if err := db.AutoMigrate(&dbmodels.DeploymentSaaSSettings{}); err != nil {
			return err
		}
		return db.Exec(`
			INSERT INTO deployment_saas_settings (id) VALUES ('default')
			ON CONFLICT (id) DO NOTHING
		`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.9_deployment_saas_settings migration: %w", err)
	}

	err = manager.RunMigration("v1.3.10_deployment_saas_support_tracker", func(db *gorm.DB) error {
		return db.AutoMigrate(&dbmodels.DeploymentSaaSSettings{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.10_deployment_saas_support_tracker migration: %w", err)
	}

	// Tenant-scoped invitations and email templates (company_id + FK). Backfill uses target_units→units and user→user_units→units; single-company fallback only when one tenant exists.
	// company_id must be TEXT to match companies.id (GORM string PK) and other tenant FK columns — not UUID.
	err = manager.RunMigration("v1.3.11_invitations_templates_company_id", func(db *gorm.DB) error {
		if err := db.Exec(`
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'invitations' AND column_name = 'company_id'
	) THEN
		ALTER TABLE invitations ADD COLUMN company_id TEXT;
	ELSIF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'invitations' AND column_name = 'company_id'
		  AND udt_name = 'uuid'
	) THEN
		ALTER TABLE invitations ALTER COLUMN company_id TYPE TEXT USING company_id::text;
	END IF;
END $$;
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'message_templates' AND column_name = 'company_id'
	) THEN
		ALTER TABLE message_templates ADD COLUMN company_id TEXT;
	ELSIF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'message_templates' AND column_name = 'company_id'
		  AND udt_name = 'uuid'
	) THEN
		ALTER TABLE message_templates ALTER COLUMN company_id TYPE TEXT USING company_id::text;
	END IF;
END $$;
`).Error; err != nil {
			return err
		}
		if err := backfillInvitationsTemplatesCompanyID(db); err != nil {
			return err
		}
		// Rows we could not attach to any company: remove (orphan data).
		if err := db.Exec(`DELETE FROM invitations WHERE company_id IS NULL`).Error; err != nil {
			return err
		}
		if err := db.Exec(`DELETE FROM message_templates WHERE company_id IS NULL`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE invitations ALTER COLUMN company_id SET NOT NULL
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			ALTER TABLE message_templates ALTER COLUMN company_id SET NOT NULL
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_company'
				) THEN
					ALTER TABLE invitations
					ADD CONSTRAINT fk_invitations_company
					FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE;
				END IF;
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_templates_company'
				) THEN
					ALTER TABLE message_templates
					ADD CONSTRAINT fk_message_templates_company
					FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE;
				END IF;
			END $$
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_invitations_company_email ON invitations (company_id, email)`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.Invitation{}, &dbmodels.MessageTemplate{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.11_invitations_templates_company_id migration: %w", err)
	}

	// Repair path: v1.3.11 is skipped once marked applied, so fixes shipped after first apply must live here.
	// Converts mistaken UUID company_id to TEXT (matches companies.id), idempotent on healthy DBs.
	err = manager.RunMigration("v1.3.12_invitations_templates_company_id_text_repair", func(db *gorm.DB) error {
		if err := db.Exec(`
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'invitations' AND column_name = 'company_id'
		  AND udt_name = 'uuid'
	) THEN
		ALTER TABLE invitations ALTER COLUMN company_id TYPE TEXT USING company_id::text;
	END IF;
END $$;
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'message_templates' AND column_name = 'company_id'
		  AND udt_name = 'uuid'
	) THEN
		ALTER TABLE message_templates ALTER COLUMN company_id TYPE TEXT USING company_id::text;
	END IF;
END $$;
`).Error; err != nil {
			return err
		}
		if err := backfillInvitationsTemplatesCompanyID(db); err != nil {
			return err
		}
		if err := db.Exec(`DELETE FROM invitations WHERE company_id IS NULL`).Error; err != nil {
			return err
		}
		if err := db.Exec(`DELETE FROM message_templates WHERE company_id IS NULL`).Error; err != nil {
			return err
		}
		// NOT NULL only when column exists and still allows nulls (skip error if already NOT NULL).
		if err := db.Exec(`
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'invitations' AND column_name = 'company_id'
		  AND is_nullable = 'YES'
	) THEN
		ALTER TABLE invitations ALTER COLUMN company_id SET NOT NULL;
	END IF;
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = 'message_templates' AND column_name = 'company_id'
		  AND is_nullable = 'YES'
	) THEN
		ALTER TABLE message_templates ALTER COLUMN company_id SET NOT NULL;
	END IF;
END $$;
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_company'
				) THEN
					ALTER TABLE invitations
					ADD CONSTRAINT fk_invitations_company
					FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE;
				END IF;
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_templates_company'
				) THEN
					ALTER TABLE message_templates
					ADD CONSTRAINT fk_message_templates_company
					FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE;
				END IF;
			END $$
		`).Error; err != nil {
			return err
		}
		if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_invitations_company_email ON invitations (company_id, email)`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.Invitation{}, &dbmodels.MessageTemplate{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.12_invitations_templates_company_id_text_repair migration: %w", err)
	}

	// At most one default template per company (DB-enforced; prevents concurrent double-default races).
	err = manager.RunMigration("v1.3.13_message_templates_one_default_per_company", func(db *gorm.DB) error {
		if err := db.Exec(`
WITH ranked AS (
	SELECT id,
	       ROW_NUMBER() OVER (
	         PARTITION BY company_id
	         ORDER BY created_at ASC NULLS LAST, id ASC
	       ) AS rn
	FROM message_templates
	WHERE is_default IS TRUE
)
UPDATE message_templates t
SET is_default = FALSE
FROM ranked r
WHERE t.id = r.id AND r.rn > 1
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_company_default
ON message_templates (company_id)
WHERE is_default IS TRUE
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.13_message_templates_one_default_per_company migration: %w", err)
	}

	// Tenant-scoped uniqueness for accepted invitations: (company_id, user_id) instead of globally unique user_id.
	err = manager.RunMigration("v1.3.14_invitations_company_user_unique", func(db *gorm.DB) error {
		// Drop legacy single-column unique on user_id (GORM/postgres default names).
		if err := db.Exec(`
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS uni_invitations_user_id
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_user_id_key
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`DROP INDEX IF EXISTS uni_invitations_user_id`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_company_user
ON invitations (company_id, user_id)
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.14_invitations_company_user_unique migration: %w", err)
	}

	err = manager.RunMigration("v1.3.15_onec_commerceml_integration", func(db *gorm.DB) error {
		if err := db.Exec(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS onec_counterparty_guid VARCHAR(128)`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS onec_nomenclature_guid VARCHAR(128)`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS onec_order_site_id VARCHAR(128)`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS onec_last_exchange_at TIMESTAMPTZ`).Error; err != nil {
			return err
		}
		// company_id must be TEXT to match companies.id (same as other tenant FKs — not UUID).
		if err := db.Exec(`
CREATE TABLE IF NOT EXISTS company_onec_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  exchange_enabled BOOLEAN NOT NULL DEFAULT false,
  http_login VARCHAR(128) NOT NULL DEFAULT '',
  http_password_bcrypt TEXT NOT NULL DEFAULT '',
  commerce_ml_version VARCHAR(16) NOT NULL DEFAULT '2.10',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_onec_settings_http_login
ON company_onec_settings (http_login)
WHERE http_login <> ''`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.15_onec_commerceml_integration migration: %w", err)
	}

	err = manager.RunMigration("v1.3.16_onec_status_mapping_json", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE company_onec_settings
ADD COLUMN IF NOT EXISTS status_mapping_json JSONB`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.16_onec_status_mapping_json migration: %w", err)
	}

	err = manager.RunMigration("v1.3.17_onec_site_payment_system_name", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE company_onec_settings
ADD COLUMN IF NOT EXISTS site_payment_system_name VARCHAR(256) NOT NULL DEFAULT ''`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.17_onec_site_payment_system_name migration: %w", err)
	}

	err = manager.RunMigration("v1.3.18_invoice_payment_terms", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS invoice_default_payment_terms TEXT`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_terms_markdown TEXT`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.18_invoice_payment_terms migration: %w", err)
	}

	// Optional per-line print comment; versioned migrations do not re-run v1.0.7 AutoMigrate.
	err = manager.RunMigration("v1.3.19_invoice_lines_line_comment", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE invoice_lines
			ADD COLUMN IF NOT EXISTS line_comment TEXT NOT NULL DEFAULT ''
		`).Error; err != nil {
			return err
		}
		return db.AutoMigrate(&dbmodels.InvoiceLine{})
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.3.19_invoice_lines_line_comment migration: %w", err)
	}

	err = manager.RunMigration("v1.4.0_rbac_permissions_catalog_expand", func(db *gorm.DB) error {
		// RBAC: permission catalog expanded in code (rbac.All); no DDL. Refresh merged user_units for
		// system_admin users so TRU-backed permissions include the full catalog without UI edits.
		return tenantroleseed.BackfillSystemAdminUserUnits(db)
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.4.0_rbac_permissions_catalog_expand migration: %w", err)
	}

	err = manager.RunMigration("v1.4.1_legacy_global_admin_to_system_tenant_role", func(db *gorm.DB) error {
		return tenantroleseed.BackfillLegacyGlobalAdminsToSystemTenantRole(db)
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.4.1_legacy_global_admin_to_system_tenant_role migration: %w", err)
	}

	err = manager.RunMigration("v1.4.2_legacy_staff_supervisor_operator_unit_permissions", func(db *gorm.DB) error {
		return tenantroleseed.BackfillLegacyStaffSupervisorOperatorUnitPermissions(db)
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.4.2_legacy_staff_supervisor_operator_unit_permissions migration: %w", err)
	}

	err = manager.RunMigration("v1.5.0_subscription_plans_pricing_model_and_free_flag", func(db *gorm.DB) error {
		// Add is_free flag to distinguish truly free plans from custom/enterprise zero-price plans.
		if err := db.Exec(`
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		// Add pricing_model: "flat" (legacy fixed price) or "per_unit" (price × active subdivisions).
		// Existing plans default to "per_unit" (new standard model going forward).
		if err := db.Exec(`
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(32) NOT NULL DEFAULT 'per_unit'`).Error; err != nil {
			return err
		}
		// Add zones_per_unit limit key to existing subscription plan limits JSON.
		// -1 = unlimited for grandfathered/enterprise; starter=2, professional=5.
		if err := db.Exec(`
UPDATE subscription_plans
SET limits = limits || jsonb_build_object('zones_per_unit',
  CASE code
    WHEN 'starter'       THEN 2
    WHEN 'professional'  THEN 5
    WHEN 'enterprise'    THEN -1
    WHEN 'grandfathered' THEN -1
    ELSE -1
  END
)
WHERE limits IS NOT NULL AND NOT (limits ? 'zones_per_unit')`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.5.0_subscription_plans_pricing_model_and_free_flag migration: %w", err)
	}

	err = manager.RunMigration("v1.5.1_tickets_is_credit", func(db *gorm.DB) error {
		// is_credit marks tickets issued on quota credit (quota exhausted but working day still open).
		// Credit ticket count is deducted from the next billing period.
		if err := db.Exec(`
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS is_credit BOOLEAN NOT NULL DEFAULT false`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.5.1_tickets_is_credit migration: %w", err)
	}

	err = manager.RunMigration("v1.6.0_service_time_sla", func(db *gorm.DB) error {
		// Service.MaxServiceTime: service-time SLA limit in seconds (optional, like MaxWaitingTime for wait SLA).
		// Ticket.MaxServiceTime: snapshot of Service.MaxServiceTime taken at the moment the ticket moves to in_service.
		// statistics_daily_buckets: sla_service_met / sla_service_total mirrors sla_wait_* for service-time SLA.
		return db.Exec(`
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS max_service_time integer;
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS max_service_time integer;
ALTER TABLE statistics_daily_buckets
    ADD COLUMN IF NOT EXISTS sla_service_met integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sla_service_total integer NOT NULL DEFAULT 0;
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.6.0_service_time_sla migration: %w", err)
	}

	err = manager.RunMigration("v1.6.1_plan_features_virtual_queue_visitor_notifications", func(db *gorm.DB) error {
		// Add virtual_queue and visitor_notifications feature keys to all existing subscription plan rows.
		// Each key is checked and backfilled independently so that rows already containing one key
		// but missing the other are still updated correctly.
		return db.Exec(`
UPDATE subscription_plans
SET features = features
    || CASE
           WHEN NOT (features ? 'virtual_queue') THEN
               CASE code
                   WHEN 'starter'       THEN '{"virtual_queue": false}'::jsonb
                   WHEN 'professional'  THEN '{"virtual_queue": true}'::jsonb
                   WHEN 'enterprise'    THEN '{"virtual_queue": true}'::jsonb
                   WHEN 'grandfathered' THEN '{"virtual_queue": true}'::jsonb
                   ELSE                     '{"virtual_queue": false}'::jsonb
               END
           ELSE '{}'::jsonb
       END
    || CASE
           WHEN NOT (features ? 'visitor_notifications') THEN
               CASE code
                   WHEN 'starter'       THEN '{"visitor_notifications": false}'::jsonb
                   WHEN 'professional'  THEN '{"visitor_notifications": true}'::jsonb
                   WHEN 'enterprise'    THEN '{"visitor_notifications": true}'::jsonb
                   WHEN 'grandfathered' THEN '{"visitor_notifications": false}'::jsonb
                   ELSE                     '{"visitor_notifications": false}'::jsonb
               END
           ELSE '{}'::jsonb
       END
WHERE features IS NOT NULL;
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.6.1_plan_features_virtual_queue_visitor_notifications migration: %w", err)
	}

	err = manager.RunMigration("v1.6.2_deployment_saas_settings_sms", func(db *gorm.DB) error {
		// Add SMS provider configuration columns to the deployment_saas_settings singleton row.
		return db.Exec(`
ALTER TABLE deployment_saas_settings
    ADD COLUMN IF NOT EXISTS sms_provider   varchar(32)  NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sms_api_key    text         NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sms_api_secret text         NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sms_from_name  varchar(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sms_enabled    boolean      NOT NULL DEFAULT false;
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.6.2_deployment_saas_settings_sms migration: %w", err)
	}

	err = manager.RunMigration("v1.6.3_unit_clients_locale", func(db *gorm.DB) error {
		// Add preferred locale column to unit_clients, populated when a visitor identifies via phone (kiosk/virtual queue).
		return db.Exec(`
ALTER TABLE unit_clients
    ADD COLUMN IF NOT EXISTS locale varchar(8) NULL DEFAULT NULL;
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.6.3_unit_clients_locale migration: %w", err)
	}

	err = manager.RunMigration("v1.6.4_ticket_visitor_token", func(db *gorm.DB) error {
		// Add visitor_token to tickets: a secret UUID returned to the visitor at creation time.
		// Used to authenticate visitor-facing mutating endpoints (cancel, phone opt-in).
		return db.Exec(`
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS visitor_token uuid NOT NULL DEFAULT gen_random_uuid();
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.6.4_ticket_visitor_token migration: %w", err)
	}

	err = manager.RunMigration("v1.7.0_skill_based_routing", func(db *gorm.DB) error {
		// Add skill_based_routing_enabled to units and create operator_skills table.
		if err := db.Exec(`
ALTER TABLE units
    ADD COLUMN IF NOT EXISTS skill_based_routing_enabled boolean NOT NULL DEFAULT false;
`).Error; err != nil {
			return err
		}
		return db.Exec(`
CREATE TABLE IF NOT EXISTS operator_skills (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    unit_id text NOT NULL REFERENCES units(id) ON UPDATE CASCADE ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    service_id text NOT NULL REFERENCES services(id) ON UPDATE CASCADE ON DELETE CASCADE,
    priority int NOT NULL DEFAULT 1,
    CONSTRAINT uniq_op_skill UNIQUE (unit_id, user_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_operator_skills_unit_user ON operator_skills (unit_id, user_id);
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.7.0_skill_based_routing migration: %w", err)
	}

	err = manager.RunMigration("v1.7.1_ticket_served_by_user_id", func(db *gorm.DB) error {
		// Add served_by_user_id to tickets: records the operator (counter.assigned_to at call time).
		// Enables accurate per-operator CSAT aggregation and staff performance analytics.
		return db.Exec(`
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS served_by_user_id text;
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.7.1_ticket_served_by_user_id migration: %w", err)
	}

	err = manager.RunMigration("v1.7.2_anomaly_alerts", func(db *gorm.DB) error {
		// units.id is text (GORM string PK), not uuid — FK types must match (SQLSTATE 42804).
		return db.Exec(`
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    unit_id text NOT NULL REFERENCES units(id) ON UPDATE CASCADE ON DELETE CASCADE,
    kind varchar(64) NOT NULL,
    message text NOT NULL,
    severity varchar(32) NOT NULL DEFAULT 'warning',
    created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_unit_created ON anomaly_alerts (unit_id, created_at DESC);
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.7.2_anomaly_alerts migration: %w", err)
	}

	err = manager.RunMigration("v1.7.3_anomaly_alerts_unit_fk", func(db *gorm.DB) error {
		// When GORM runs with DisableForeignKeyConstraintWhenMigrating, CREATE TABLE may omit FK;
		// add it on upgrades and fresh installs if missing.
		return db.Exec(`
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'fk_anomaly_alerts_unit_id'
	) THEN
		ALTER TABLE anomaly_alerts
		ADD CONSTRAINT fk_anomaly_alerts_unit_id
		FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE CASCADE ON DELETE CASCADE;
	END IF;
END $$;
`).Error
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.7.3_anomaly_alerts_unit_fk migration: %w", err)
	}

	err = manager.RunMigration("v1.7.4_subscription_plan_annual_prepay", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE subscription_plans
	ADD COLUMN IF NOT EXISTS annual_prepay_discount_percent integer;
ALTER TABLE subscription_plans
	ADD COLUMN IF NOT EXISTS annual_prepay_price_per_month bigint;
`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
DO $$
BEGIN
	ALTER TABLE subscription_plans
		ADD CONSTRAINT subscription_plans_annual_prepay_discount_pct_chk
		CHECK (annual_prepay_discount_percent IS NULL OR (annual_prepay_discount_percent BETWEEN 1 AND 100));
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
	ALTER TABLE subscription_plans
		ADD CONSTRAINT subscription_plans_annual_prepay_price_per_mo_chk
		CHECK (annual_prepay_price_per_month IS NULL OR annual_prepay_price_per_month > 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
	ALTER TABLE subscription_plans
		ADD CONSTRAINT subscription_plans_annual_prepay_exclusive_chk
		CHECK (
			(annual_prepay_discount_percent IS NULL)
			OR (annual_prepay_price_per_month IS NULL)
		);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.7.4_subscription_plan_annual_prepay migration: %w", err)
	}

	err = manager.RunMigration("v1.8.0_integrations_api_keys_webhooks_outbox", func(db *gorm.DB) error {
		// company_id / unit_id / user ids / ticket_history ids are TEXT (GORM string PKs), same as companies.id — not PostgreSQL uuid.
		if err := db.Exec(`
CREATE TABLE IF NOT EXISTS integration_api_keys (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE,
	unit_id TEXT REFERENCES units(id) ON UPDATE CASCADE ON DELETE SET NULL,
	name text NOT NULL,
	secret_hash text NOT NULL,
	scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
	created_by_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
	revoked_at timestamptz,
	last_used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_company_id ON integration_api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_unit_id ON integration_api_keys(unit_id);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE,
	unit_id TEXT REFERENCES units(id) ON UPDATE CASCADE ON DELETE SET NULL,
	url text NOT NULL,
	signing_secret text NOT NULL,
	event_types jsonb NOT NULL DEFAULT '[]'::jsonb,
	enabled boolean NOT NULL DEFAULT true,
	consecutive_failures integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_company_id ON webhook_endpoints(company_id);

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
	id TEXT PRIMARY KEY,
	webhook_endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON UPDATE CASCADE ON DELETE CASCADE,
	ticket_history_id TEXT REFERENCES ticket_histories(id) ON UPDATE CASCADE ON DELETE SET NULL,
	http_status integer,
	response_snippet text,
	duration_ms integer NOT NULL DEFAULT 0,
	error_message text,
	attempt integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_endpoint ON webhook_delivery_logs(webhook_endpoint_id);

CREATE TABLE IF NOT EXISTS webhook_outbox (
	id TEXT PRIMARY KEY,
	company_id TEXT NOT NULL REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE,
	ticket_history_id TEXT NOT NULL REFERENCES ticket_histories(id) ON UPDATE CASCADE ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_created_at ON webhook_outbox(created_at);
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.0_integrations_api_keys_webhooks_outbox migration: %w", err)
	}

	err = manager.RunMigration("v1.8.1_subscription_plan_integration_features", func(db *gorm.DB) error {
		// Add outbound_webhooks / public_queue_widget to existing plan JSON when keys are missing.
		if err := db.Exec(`
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{"outbound_webhooks": false}'::jsonb
WHERE features->'outbound_webhooks' IS NULL;
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{"public_queue_widget": false}'::jsonb
WHERE features->'public_queue_widget' IS NULL;
UPDATE subscription_plans
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{outbound_webhooks}', 'true'::jsonb, true)
WHERE code IN ('professional', 'enterprise', 'grandfathered');
UPDATE subscription_plans
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{public_queue_widget}', 'true'::jsonb, true)
WHERE code IN ('professional', 'enterprise', 'grandfathered');
UPDATE subscription_plans
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{outbound_webhooks}', 'false'::jsonb, true)
WHERE code = 'starter';
UPDATE subscription_plans
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{public_queue_widget}', 'false'::jsonb, true)
WHERE code = 'starter';
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.1_subscription_plan_integration_features migration: %w", err)
	}

	err = manager.RunMigration("v1.8.2_webhook_outbox_retry", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE webhook_outbox
	ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
	ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_next_attempt ON webhook_outbox(next_attempt_at ASC, created_at ASC);
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.2_webhook_outbox_retry migration: %w", err)
	}

	err = manager.RunMigration("v1.8.3_subscription_plan_integration_limits", func(db *gorm.DB) error {
		if err := db.Exec(`
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || '{"integration_api_keys_max": 2}'::jsonb
WHERE code = 'starter' AND limits->'integration_api_keys_max' IS NULL;
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || '{"webhook_endpoints_max": 2}'::jsonb
WHERE code = 'starter' AND limits->'webhook_endpoints_max' IS NULL;
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || '{"integration_api_keys_max": 20}'::jsonb
WHERE code = 'professional' AND limits->'integration_api_keys_max' IS NULL;
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || '{"webhook_endpoints_max": 20}'::jsonb
WHERE code = 'professional' AND limits->'webhook_endpoints_max' IS NULL;
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || '{"integration_api_keys_max": -1}'::jsonb
WHERE code IN ('enterprise', 'grandfathered') AND limits->'integration_api_keys_max' IS NULL;
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || '{"webhook_endpoints_max": -1}'::jsonb
WHERE code IN ('enterprise', 'grandfathered') AND limits->'webhook_endpoints_max' IS NULL;
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.3_subscription_plan_integration_limits migration: %w", err)
	}

	err = manager.RunMigration("v1.8.4_digital_signage", func(db *gorm.DB) error {
		if err := db.AutoMigrate(
			&dbmodels.Playlist{},
			&dbmodels.PlaylistItem{},
			&dbmodels.PlaylistSchedule{},
			&dbmodels.ExternalFeed{},
			&dbmodels.ScreenAnnouncement{},
		); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.4_digital_signage migration: %w", err)
	}

	err = manager.RunMigration("v1.8.5_external_feed_consecutive_failures", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE external_feeds
	ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
UPDATE external_feeds SET consecutive_failures = 0 WHERE consecutive_failures IS NULL;
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.5_external_feed_consecutive_failures migration: %w", err)
	}

	err = manager.RunMigration("v1.8.6_signage_validity", func(db *gorm.DB) error {
		if err := db.Exec(`
ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS valid_from date,
    ADD COLUMN IF NOT EXISTS valid_to date;
ALTER TABLE playlist_schedules
    ADD COLUMN IF NOT EXISTS valid_from date,
    ADD COLUMN IF NOT EXISTS valid_to date;
ALTER TABLE screen_announcements
    ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'banner';
UPDATE screen_announcements SET display_mode = 'banner' WHERE display_mode IS NULL OR display_mode = '';
`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(
			&dbmodels.PlaylistItem{},
			&dbmodels.PlaylistSchedule{},
			&dbmodels.ScreenAnnouncement{},
		); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.6_signage_validity migration: %w", err)
	}

	err = manager.RunMigration("v1.8.7_screen_layout_templates", func(db *gorm.DB) error {
		if err := db.AutoMigrate(&dbmodels.ScreenLayoutTemplate{}); err != nil {
			return err
		}
		if err := db.Exec(`
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{"custom_screen_layouts": true}'::jsonb
WHERE code IN ('professional', 'enterprise', 'grandfathered')
  AND (features->>'custom_screen_layouts') IS NULL;
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{"custom_screen_layouts": false}'::jsonb
WHERE code = 'starter'
  AND (features->>'custom_screen_layouts') IS NULL;
`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.7_screen_layout_templates migration: %w", err)
	}

	err = manager.RunMigration("v1.8.8_queue_funnel_sms", func(db *gorm.DB) error {
		if err := db.AutoMigrate(
			&dbmodels.Ticket{},
			&dbmodels.QueueFunnelEvent{},
			&dbmodels.TicketShortLink{},
		); err != nil {
			return err
		}
		if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_queue_funnel_events_created ON queue_funnel_events (created_at);`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.8_queue_funnel_sms migration: %w", err)
	}

	err = manager.RunMigration("v1.8.9_kiosk_telemetry_events", func(db *gorm.DB) error {
		if err := db.AutoMigrate(
			&dbmodels.KioskTelemetryEvent{},
			&dbmodels.KioskETASlotCalibration{},
			&dbmodels.KioskTicketIdempotency{},
		); err != nil {
			return err
		}
		if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_kiosk_telemetry_unit_created ON kiosk_telemetry_events (unit_id, created_at);`).Error; err != nil {
			return err
		}
		if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_queue_funnel_unit_created ON queue_funnel_events (unit_id, created_at);`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.9_kiosk_telemetry_events migration: %w", err)
	}

	err = manager.RunMigration("v1.8.10_kiosk_plan_features", func(db *gorm.DB) error {
		//nolint:gosec // static JSON patch
		if err := db.Exec(`
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{
  "kiosk_operations_analytics": true,
  "kiosk_smart_eta": true,
  "kiosk_post_service_survey": true,
  "kiosk_id_ocr": true,
  "kiosk_offline_mode": true
}'::jsonb
WHERE code IN ('professional', 'enterprise', 'grandfathered')
  AND (features->>'kiosk_operations_analytics') IS NULL;`).Error; err != nil {
			return err
		}
		//nolint:gosec
		if err := db.Exec(`
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{
  "kiosk_operations_analytics": false,
  "kiosk_smart_eta": false,
  "kiosk_post_service_survey": false,
  "kiosk_id_ocr": false,
  "kiosk_offline_mode": false
}'::jsonb
WHERE code = 'starter' AND (features->>'kiosk_operations_analytics') IS NULL;`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.10_kiosk_plan_features migration: %w", err)
	}

	err = manager.RunMigration("v1.8.11_kiosk_eta_p95", func(db *gorm.DB) error {
		if err := db.Exec(`ALTER TABLE kiosk_eta_slot_calibration ADD COLUMN IF NOT EXISTS p95_wait_sec int NOT NULL DEFAULT 0;`).Error; err != nil {
			return err
		}
		//nolint:gosec // backfill: previous rows used p90 as upper tail; p95 recompute on next refresh
		if err := db.Exec(`UPDATE kiosk_eta_slot_calibration SET p95_wait_sec = p90_wait_sec WHERE p95_wait_sec = 0;`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(
			&dbmodels.KioskETAGBDTArtifact{},
		); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.11_kiosk_eta_p95 migration: %w", err)
	}

	err = manager.RunMigration("v1.8.12_employee_idp_and_identification_mode", func(db *gorm.DB) error {
		if err := db.Exec(`ALTER TABLE services ADD COLUMN IF NOT EXISTS identification_mode text NOT NULL DEFAULT 'none';`).Error; err != nil {
			return err
		}
		if err := db.Exec(`UPDATE services SET identification_mode = CASE WHEN offer_identification THEN 'phone' ELSE 'none' END;`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_identification_mode;`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE services ADD CONSTRAINT chk_services_identification_mode CHECK (identification_mode IN ('none','phone','qr','login','badge'));`).Error; err != nil {
			return err
		}
		if err := db.Exec(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS kiosk_identified_user_id uuid NULL;`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(
			&dbmodels.UnitEmployeeIdpSetting{},
			&dbmodels.UnitEmployeeIdpSecret{},
		); err != nil {
			return err
		}
		//nolint:gosec // static JSON feature flags
		if err := db.Exec(`
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{"kiosk_employee_idp": true}'::jsonb
WHERE code IN ('professional', 'enterprise', 'grandfathered') AND (features->>'kiosk_employee_idp') IS NULL;`).Error; err != nil {
			return err
		}
		if err := db.Exec(`
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || '{"kiosk_employee_idp": false}'::jsonb
WHERE code = 'starter' AND (features->>'kiosk_employee_idp') IS NULL;`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.12_employee_idp_and_identification_mode migration: %w", err)
	}

	err = manager.RunMigration("v1.8.13_services_sort_order", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE services
			ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
		`).Error; err != nil {
			return err
		}
		if err := db.AutoMigrate(&dbmodels.Service{}); err != nil {
			return err
		}
		if err := db.Exec(`
			CREATE INDEX IF NOT EXISTS idx_services_unit_sort
			ON services (unit_id, sort_order, name);
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.13_services_sort_order migration: %w", err)
	}

	err = manager.RunMigration("v1.8.14_services_icon_key", func(db *gorm.DB) error {
		if err := db.Exec(`
			ALTER TABLE services
			ADD COLUMN IF NOT EXISTS icon_key text;
		`).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to run v1.8.14_services_icon_key migration: %w", err)
	}

	fmt.Println("✅ All migrations completed successfully")
	return nil
}
