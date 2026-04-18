package repository

import (
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupCalendarIntegrationRepoTestDB(t *testing.T) func() {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE units (
	id text PRIMARY KEY,
	company_id text NOT NULL,
	code text NOT NULL,
	kind text NOT NULL DEFAULT 'subdivision',
	name text NOT NULL,
	name_en text,
	timezone text NOT NULL,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE unit_calendar_integrations (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	kind text NOT NULL,
	display_name text NOT NULL DEFAULT '',
	enabled integer NOT NULL DEFAULT 0,
	caldav_base_url text NOT NULL,
	calendar_path text NOT NULL,
	username text NOT NULL,
	app_password_encrypted text NOT NULL,
	timezone text NOT NULL,
	admin_notify_emails text,
	last_sync_at datetime,
	last_sync_error text,
	created_at datetime,
	updated_at datetime
);
`).Error; err != nil {
		t.Fatal(err)
	}
	old := database.DB
	database.DB = db
	return func() { database.DB = old }
}

func TestCalendarIntegrationRepository_ListByUnitID_CountByUnitID_MultipleRows(t *testing.T) {
	defer setupCalendarIntegrationRepoTestDB(t)()
	repo := NewCalendarIntegrationRepository()

	if err := database.DB.Exec(`INSERT INTO units (id, company_id, code, kind, name, timezone) VALUES ('u1', 'c1', '1', 'subdivision', 'U', 'UTC')`).Error; err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 3; i++ {
		row := models.UnitCalendarIntegration{
			UnitID:               "u1",
			Kind:                 models.CalendarIntegrationKindYandexCalDAV,
			Enabled:              true,
			CaldavBaseURL:        "https://caldav.yandex.ru",
			CalendarPath:         "/p/",
			Username:             "u@yandex.ru",
			AppPasswordEncrypted: "enc",
			Timezone:             "Europe/Moscow",
		}
		row.CalendarPath = "/p/x" + string(rune('0'+i))
		if err := repo.CreateIntegration(&row); err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}

	n, err := repo.CountByUnitID("u1")
	if err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("CountByUnitID: want 3, got %d", n)
	}

	list, err := repo.ListByUnitID("u1")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 {
		t.Fatalf("ListByUnitID: want 3, got %d", len(list))
	}
}

func TestCalendarIntegrationRepository_ListByCompanyID_JoinsUnits(t *testing.T) {
	defer setupCalendarIntegrationRepoTestDB(t)()
	repo := NewCalendarIntegrationRepository()

	for _, row := range []struct {
		uid, cid string
	}{
		{"ua", "cA"},
		{"ub", "cA"},
		{"uc", "cB"},
	} {
		if err := database.DB.Exec(
			`INSERT INTO units (id, company_id, code, kind, name, timezone) VALUES (?, ?, 'x', 'subdivision', 'n', 'UTC')`,
			row.uid, row.cid,
		).Error; err != nil {
			t.Fatal(err)
		}
	}

	for _, u := range []string{"ua", "ub", "uc"} {
		row := models.UnitCalendarIntegration{
			UnitID:               u,
			Kind:                 models.CalendarIntegrationKindYandexCalDAV,
			Enabled:              true,
			CaldavBaseURL:        "https://caldav.yandex.ru",
			CalendarPath:         "/z/" + u,
			Username:             "x@yandex.ru",
			AppPasswordEncrypted: "enc",
			Timezone:             "UTC",
		}
		if err := repo.CreateIntegration(&row); err != nil {
			t.Fatal(err)
		}
	}

	rows, err := repo.ListByCompanyID("cA")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("company cA: want 2 rows, got %d", len(rows))
	}
	seen := map[string]bool{}
	for _, r := range rows {
		seen[r.UnitID] = true
	}
	if !seen["ua"] || !seen["ub"] {
		t.Fatalf("unexpected set: %#v", rows)
	}

	rowsB, err := repo.ListByCompanyID("cB")
	if err != nil {
		t.Fatal(err)
	}
	if len(rowsB) != 1 || rowsB[0].UnitID != "uc" {
		t.Fatalf("company cB: got %#v", rowsB)
	}
}
