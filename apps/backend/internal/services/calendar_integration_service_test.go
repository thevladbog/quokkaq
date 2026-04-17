package services

import (
	"context"
	"errors"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func boolPtr(b bool) *bool { return &b }

func setupCalendarIntegrationServiceTestDB(t *testing.T) func() {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Raw DDL: SQLite does not support gen_random_uuid() / jsonb defaults from AutoMigrate.
	if err := db.Exec(`
CREATE TABLE units (
	id text PRIMARY KEY,
	company_id text NOT NULL,
	parent_id text,
	code text NOT NULL,
	kind text NOT NULL DEFAULT 'subdivision',
	sort_order integer NOT NULL DEFAULT 0,
	name text NOT NULL,
	timezone text NOT NULL,
	config text,
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
CREATE TABLE pre_registrations (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	service_id text NOT NULL,
	date text NOT NULL,
	time text NOT NULL,
	code text NOT NULL,
	customer_first_name text NOT NULL,
	customer_last_name text NOT NULL,
	customer_phone text NOT NULL,
	comment text,
	status text,
	ticket_id text,
	external_event_href text,
	external_event_etag text,
	calendar_integration_id text,
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

func newTestCalendarService() *CalendarIntegrationService {
	return NewCalendarIntegrationService(
		repository.NewCalendarIntegrationRepository(),
		repository.NewServiceRepository(),
		repository.NewUnitRepository(),
		nil,
	)
}

func TestCalendarIntegrationService_CreateIntegration_LimitFourPerUnit(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	svc := newTestCalendarService()

	if err := database.DB.Create(&models.Unit{
		ID:        "unit-limit",
		CompanyID: "co1",
		Code:      "A",
		Kind:      models.UnitKindSubdivision,
		Name:      "U",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}

	req := func(i int) *CreateCalendarIntegrationRequest {
		return &CreateCalendarIntegrationRequest{
			UnitID:        "unit-limit",
			Kind:          models.CalendarIntegrationKindYandexCalDAV,
			Enabled:       boolPtr(true),
			CaldavBaseURL: "https://caldav.yandex.ru",
			CalendarPath:  "/cal/p/",
			Username:      "u@yandex.ru",
			AppPassword:   "app-pass-123456789012",
			Timezone:      "Europe/Moscow",
		}
	}
	for i := 0; i < 4; i++ {
		r := req(i)
		r.CalendarPath = "/cal/p/" + string(rune('a'+i))
		_, err := svc.CreateIntegration("co1", r)
		if err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}

	_, err := svc.CreateIntegration("co1", req(0))
	if !errors.Is(err, ErrCalendarIntegrationLimit) {
		t.Fatalf("want ErrCalendarIntegrationLimit, got %v", err)
	}
}

func TestCalendarIntegrationService_CreateIntegration_UnitNotInCompany(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	svc := newTestCalendarService()

	for _, id := range []string{"unit-a", "unit-b"} {
		if err := database.DB.Create(&models.Unit{
			ID:        id,
			CompanyID: map[string]string{"unit-a": "co1", "unit-b": "co2"}[id],
			Code:      id,
			Kind:      models.UnitKindSubdivision,
			Name:      id,
			Timezone:  "UTC",
		}).Error; err != nil {
			t.Fatal(err)
		}
	}

	_, err := svc.CreateIntegration("co1", &CreateCalendarIntegrationRequest{
		UnitID:       "unit-b",
		Kind:         models.CalendarIntegrationKindYandexCalDAV,
		Enabled:      boolPtr(true),
		CalendarPath: "/x/",
		Username:     "x@yandex.ru",
		AppPassword:  "app-pass-123456789012",
		Timezone:     "UTC",
	})
	if err == nil {
		t.Fatal("expected error when unit belongs to another company")
	}
}

func TestCalendarIntegrationService_ListPublicForCompany(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	svc := newTestCalendarService()

	for _, u := range []struct {
		id, name string
	}{
		{"u1", "Alpha"},
		{"u2", "Beta"},
	} {
		if err := database.DB.Create(&models.Unit{
			ID:        u.id,
			CompanyID: "co-list",
			Code:      u.id,
			Kind:      models.UnitKindSubdivision,
			Name:      u.name,
			Timezone:  "UTC",
		}).Error; err != nil {
			t.Fatal(err)
		}
	}

	for _, path := range []string{"/a/", "/b/"} {
		_, err := svc.CreateIntegration("co-list", &CreateCalendarIntegrationRequest{
			UnitID:       "u1",
			Kind:         models.CalendarIntegrationKindYandexCalDAV,
			Enabled:      boolPtr(true),
			CalendarPath: path,
			Username:     "x@yandex.ru",
			AppPassword:  "app-pass-123456789012",
			Timezone:     "UTC",
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	_, err := svc.CreateIntegration("co-list", &CreateCalendarIntegrationRequest{
		UnitID:       "u2",
		Kind:         models.CalendarIntegrationKindYandexCalDAV,
		Enabled:      boolPtr(false),
		CalendarPath: "/c/",
		Username:     "y@yandex.ru",
		AppPassword:  "app-pass-123456789012",
		Timezone:     "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}

	list, err := svc.ListPublicForCompany("co-list")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 {
		t.Fatalf("want 3 integrations, got %d", len(list))
	}
	names := map[string]struct{}{}
	for _, p := range list {
		names[p.UnitName] = struct{}{}
	}
	if _, ok := names["Alpha"]; !ok {
		t.Fatalf("missing unit name Alpha: %#v", list)
	}
	if _, ok := names["Beta"]; !ok {
		t.Fatalf("missing unit name Beta: %#v", list)
	}
}

func TestCalendarIntegrationService_DeleteIntegration_BlocksActivePreRegistration(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	svc := newTestCalendarService()

	if err := database.DB.Create(&models.Unit{
		ID:        "unit-del",
		CompanyID: "co-del",
		Code:      "d",
		Kind:      models.UnitKindSubdivision,
		Name:      "D",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}

	pub, err := svc.CreateIntegration("co-del", &CreateCalendarIntegrationRequest{
		UnitID:       "unit-del",
		Kind:         models.CalendarIntegrationKindYandexCalDAV,
		Enabled:      boolPtr(true),
		CalendarPath: "/z/",
		Username:     "z@yandex.ru",
		AppPassword:  "app-pass-123456789012",
		Timezone:     "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}
	integID := pub.ID

	svcID := "svc1"
	if err := database.DB.Exec(`
INSERT INTO pre_registrations (
  id, unit_id, service_id, date, time, code,
  customer_first_name, customer_last_name, customer_phone,
  status, calendar_integration_id, created_at, updated_at
) VALUES (?, ?, ?, '2026-01-01', '10:00', '123456',
  'a', 'b', '+1000000000',
  'created', ?, datetime('now'), datetime('now'))`,
		"pr1", "unit-del", svcID, integID,
	).Error; err != nil {
		t.Fatal(err)
	}

	err = svc.DeleteIntegration("co-del", integID)
	if err == nil {
		t.Fatal("expected error when active pre-registrations reference integration")
	}

	if err := database.DB.Exec(`UPDATE pre_registrations SET status = 'canceled' WHERE id = 'pr1'`).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteIntegration("co-del", integID); err != nil {
		t.Fatal(err)
	}
}

func TestCalendarIntegrationService_SyncIntegration_NoOpWhenMissingOrDisabled(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	svc := newTestCalendarService()

	ctx := context.Background()
	if err := svc.SyncIntegration(ctx, "00000000-0000-0000-0000-000000000001"); err != nil {
		t.Fatalf("missing id: %v", err)
	}

	if err := database.DB.Create(&models.Unit{
		ID:        "unit-sync",
		CompanyID: "co-s",
		Code:      "s",
		Kind:      models.UnitKindSubdivision,
		Name:      "S",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	pub, err := svc.CreateIntegration("co-s", &CreateCalendarIntegrationRequest{
		UnitID:       "unit-sync",
		Kind:         models.CalendarIntegrationKindYandexCalDAV,
		Enabled:      boolPtr(false),
		CalendarPath: "/off/",
		Username:     "off@yandex.ru",
		AppPassword:  "app-pass-123456789012",
		Timezone:     "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SyncIntegration(ctx, pub.ID); err != nil {
		t.Fatalf("disabled integration: %v", err)
	}
}

func TestCalendarIntegrationService_ResolveIntegrationForPreReg_ExplicitID(t *testing.T) {
	defer setupCalendarIntegrationServiceTestDB(t)()
	svc := newTestCalendarService()

	if err := database.DB.Create(&models.Unit{
		ID:        "unit-r",
		CompanyID: "co-r",
		Code:      "r",
		Kind:      models.UnitKindSubdivision,
		Name:      "R",
		Timezone:  "UTC",
	}).Error; err != nil {
		t.Fatal(err)
	}
	a, err := svc.CreateIntegration("co-r", &CreateCalendarIntegrationRequest{
		UnitID:       "unit-r",
		Kind:         models.CalendarIntegrationKindYandexCalDAV,
		Enabled:      boolPtr(true),
		CalendarPath: "/r1/",
		Username:     "a@yandex.ru",
		AppPassword:  "app-pass-123456789012",
		Timezone:     "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.CreateIntegration("co-r", &CreateCalendarIntegrationRequest{
		UnitID:       "unit-r",
		Kind:         models.CalendarIntegrationKindYandexCalDAV,
		Enabled:      boolPtr(true),
		CalendarPath: "/r2/",
		Username:     "b@yandex.ru",
		AppPassword:  "app-pass-123456789012",
		Timezone:     "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}

	row, err := svc.ResolveIntegrationForPreReg("unit-r", a.ID)
	if err != nil || row.ID != a.ID {
		t.Fatalf("want integration a, got %v err=%v", row, err)
	}
	_, err = svc.ResolveIntegrationForPreReg("unit-r", b.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.ResolveIntegrationForPreReg("unit-other", b.ID)
	if err == nil {
		t.Fatal("expected error for wrong unit")
	}
}
