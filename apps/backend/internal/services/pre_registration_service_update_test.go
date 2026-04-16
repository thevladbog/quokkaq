package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type recordingPreRegCalendar struct {
	releaseCalls int
	lastHref     string
	lastETag     string
}

func (r *recordingPreRegCalendar) ResolveIntegrationForPreReg(unitID, _ string) (*models.UnitCalendarIntegration, error) {
	return &models.UnitCalendarIntegration{
		ID:      "ci-test",
		UnitID:  unitID,
		Enabled: true,
	}, nil
}

func (r *recordingPreRegCalendar) ResolveIntegrationForRelease(pr *models.PreRegistration) (*models.UnitCalendarIntegration, error) {
	return &models.UnitCalendarIntegration{
		ID:      "ci-test",
		UnitID:  pr.UnitID,
		Enabled: true,
	}, nil
}

func (r *recordingPreRegCalendar) HasEnabledCalendarIntegration(_ string) (bool, error) {
	return true, nil
}

func (r *recordingPreRegCalendar) ReleaseFreeSlot(_ context.Context, _ *models.UnitCalendarIntegration, _ *models.Service, href, etag string) error {
	r.releaseCalls++
	r.lastHref = href
	r.lastETag = etag
	return nil
}

func (r *recordingPreRegCalendar) ValidateAndApplyBooked(context.Context, *models.UnitCalendarIntegration, *models.Service, string, string, *models.PreRegistration) (string, error) {
	return "new-etag", nil
}

func (r *recordingPreRegCalendar) ListCalendarSlots(string, string, string) ([]models.PreRegCalendarSlotItem, error) {
	return nil, nil
}

func TestPreRegistrationService_Update_CanceledImmutable(t *testing.T) {
	svc := &PreRegistrationService{}
	prev := &models.PreRegistration{Status: "canceled"}
	next := &models.PreRegistration{Status: "created"}
	err := svc.Update(context.Background(), prev, next, nil)
	if !errors.Is(err, ErrPreRegistrationCanceledImmutable) {
		t.Fatalf("want ErrPreRegistrationCanceledImmutable, got %v", err)
	}
}

func TestPreRegistrationService_Update_CannotCancelFromNonCreated(t *testing.T) {
	svc := &PreRegistrationService{}
	prev := &models.PreRegistration{Status: "ticket_issued"}
	next := &models.PreRegistration{Status: "canceled"}
	err := svc.Update(context.Background(), prev, next, &models.PreRegistrationUpdateRequest{Status: "canceled"})
	if !errors.Is(err, ErrPreRegistrationCannotCancel) {
		t.Fatalf("want ErrPreRegistrationCannotCancel, got %v", err)
	}
}

func TestPreRegistrationService_Update_Cancel_ReleasesCalendar(t *testing.T) {
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE services (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	name text NOT NULL
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
	t.Cleanup(func() { database.DB = old })

	unitID := "unit-pr"
	svcID := "svc-pr"
	prID := "pr-cancel"
	href := "https://caldav.example/res1"
	etag := "etag-1"
	now := time.Now().UTC()

	if err := db.Exec(`INSERT INTO services (id, unit_id, name) VALUES (?, ?, ?)`, svcID, unitID, "Svc").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
INSERT INTO pre_registrations (
	id, unit_id, service_id, date, time, code,
	customer_first_name, customer_last_name, customer_phone, comment, status,
	external_event_href, external_event_etag, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		prID, unitID, svcID, "2026-04-20", "10:00", "000001",
		"A", "B", "+10000000000", "", "created",
		href, etag, now, now,
	).Error; err != nil {
		t.Fatal(err)
	}

	cal := &recordingPreRegCalendar{}
	s := NewPreRegistrationService(
		repository.NewPreRegistrationRepository(),
		nil,
		nil,
		repository.NewServiceRepository(),
		cal,
	)

	prevRow, err := s.GetByID(prID)
	if err != nil {
		t.Fatal(err)
	}
	previous := models.ClonePreRegistration(prevRow)

	next := models.ClonePreRegistration(prevRow)
	next.Status = "canceled"

	if err := s.Update(context.Background(), previous, next, &models.PreRegistrationUpdateRequest{Status: "canceled"}); err != nil {
		t.Fatal(err)
	}

	if cal.releaseCalls != 1 {
		t.Fatalf("ReleaseFreeSlot calls: want 1, got %d", cal.releaseCalls)
	}
	if cal.lastHref != href {
		t.Fatalf("ReleaseFreeSlot href: want %q, got %q", href, cal.lastHref)
	}
	if cal.lastETag != etag {
		t.Fatalf("ReleaseFreeSlot etag: want %q, got %q", etag, cal.lastETag)
	}

	var st string
	var ext *string
	if err := db.Raw(`SELECT status, external_event_href FROM pre_registrations WHERE id = ?`, prID).Row().Scan(&st, &ext); err != nil {
		t.Fatal(err)
	}
	if st != "canceled" {
		t.Fatalf("status: want canceled, got %q", st)
	}
	if ext != nil && *ext != "" {
		t.Fatalf("external_event_href: want nil/empty, got %v", ext)
	}
}
