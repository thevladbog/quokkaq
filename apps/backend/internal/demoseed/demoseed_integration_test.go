//go:build demoseed_integration

package demoseed_test

import (
	"io"
	"log/slog"
	"os"
	"testing"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/demoseed"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/subscriptionplanseed"
	"quokkaq-go-backend/pkg/database"
)

func TestDemoseedRun_smokeOnFreshPostgres(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Fatal("DATABASE_URL is required for demoseed_integration tests (e.g. postgresql://user:pass@localhost:5432/db?sslmode=disable)")
	}
	if os.Getenv("DEMOSEED_ALLOW_RESET") != "1" {
		t.Skip("skipping destructive schema reset: set DEMOSEED_ALLOW_RESET=1 to run (CI sets this)")
	}

	t.Setenv("DEMO_HISTORY_DAYS", "2")
	t.Setenv("DEMO_UNIT_TIMEZONE", "UTC")

	config.Load()
	logger.InitWriter(io.Discard, "text", slog.LevelError)

	if err := database.Connect(); err != nil {
		t.Fatalf("connect: %v", err)
	}
	db := database.DB

	// Fresh public schema so the test is repeatable against a long-lived local Postgres (CI gets an empty instance per run).
	if err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE`).Error; err != nil {
		t.Fatalf("drop schema: %v", err)
	}
	if err := db.Exec(`CREATE SCHEMA public`).Error; err != nil {
		t.Fatalf("create schema: %v", err)
	}
	if err := db.Exec(`GRANT ALL ON SCHEMA public TO public`).Error; err != nil {
		t.Fatalf("grant schema: %v", err)
	}

	if err := database.RunVersionedMigrations(database.AllMigratableModels()...); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	if err := subscriptionplanseed.UpsertSubscriptionPlans(db); err != nil {
		t.Fatalf("seed plans: %v", err)
	}

	cfg := demoseed.LoadConfig()
	if err := demoseed.Run(db, cfg); err != nil {
		t.Fatalf("demoseed.Run: %v", err)
	}

	var companyCount int64
	if err := db.Model(&models.Company{}).Where("name = ?", "QuokkaQ Demo").Count(&companyCount).Error; err != nil {
		t.Fatalf("count companies: %v", err)
	}
	if companyCount != 1 {
		t.Fatalf("want 1 QuokkaQ Demo company, got %d", companyCount)
	}

	var unitCount int64
	if err := db.Model(&models.Unit{}).Where("code = ?", "MAIN").Count(&unitCount).Error; err != nil {
		t.Fatalf("count units: %v", err)
	}
	if unitCount != 1 {
		t.Fatalf("want 1 MAIN unit, got %d", unitCount)
	}

	var adminCount, opCount int64
	if err := db.Model(&models.User{}).Where("email = ?", cfg.AdminEmail).Count(&adminCount).Error; err != nil {
		t.Fatalf("admin user: %v", err)
	}
	if err := db.Model(&models.User{}).Where("email = ?", cfg.OperatorEmail).Count(&opCount).Error; err != nil {
		t.Fatalf("operator user: %v", err)
	}
	if adminCount != 1 || opCount != 1 {
		t.Fatalf("want 1 admin and 1 operator user, got admin=%d op=%d", adminCount, opCount)
	}

	var subCount int64
	if err := db.Model(&models.Subscription{}).Count(&subCount).Error; err != nil {
		t.Fatalf("subscriptions: %v", err)
	}
	if subCount < 1 {
		t.Fatalf("want at least 1 subscription, got %d", subCount)
	}

	var ticketCount int64
	if err := db.Model(&models.Ticket{}).Count(&ticketCount).Error; err != nil {
		t.Fatalf("tickets: %v", err)
	}
	if ticketCount < 10 {
		t.Fatalf("want meaningful ticket volume, got %d", ticketCount)
	}

	var bucketCount int64
	if err := db.Model(&models.StatisticsDailyBucket{}).Count(&bucketCount).Error; err != nil {
		t.Fatalf("stat buckets: %v", err)
	}
	if bucketCount < 1 {
		t.Fatalf("want at least 1 statistics_daily_bucket, got %d", bucketCount)
	}

	var surveyStatCount int64
	if err := db.Model(&models.StatisticsSurveyDaily{}).Count(&surveyStatCount).Error; err != nil {
		t.Fatalf("survey stats: %v", err)
	}
	if surveyStatCount < 1 {
		t.Fatalf("want at least 1 statistics_survey_daily, got %d", surveyStatCount)
	}

	// No platform_admin role on any user (demo is tenant-scoped only).
	var platformAdminAssignments int64
	if err := db.Raw(`
SELECT COUNT(*) FROM user_roles ur
INNER JOIN roles r ON r.id = ur.role_id AND r.name = 'platform_admin'
`).Scan(&platformAdminAssignments).Error; err != nil {
		t.Fatalf("platform_admin user_roles: %v", err)
	}
	if platformAdminAssignments != 0 {
		t.Fatalf("demo seed must not assign platform_admin; got %d rows", platformAdminAssignments)
	}
}
