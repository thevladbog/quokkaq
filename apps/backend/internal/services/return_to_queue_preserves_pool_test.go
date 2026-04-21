package services

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type noopJobEnqueuer struct{}

func (noopJobEnqueuer) EnqueueTtsGenerate(TtsJobPayload) error { return nil }

func TestReturnToQueue_preservesServiceZoneAndService(t *testing.T) {
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
CREATE TABLE tickets (
	id text PRIMARY KEY,
	queue_number text NOT NULL,
	unit_id text NOT NULL,
	service_zone_id text,
	service_id text NOT NULL,
	booking_id text,
	counter_id text,
	pre_registration_id text,
	client_id text,
	status text,
	priority integer DEFAULT 0,
	is_eod integer DEFAULT 0,
	is_credit integer DEFAULT 0,
	tts_url text,
	created_at datetime,
	called_at datetime,
	confirmed_at datetime,
	completed_at datetime,
	last_called_at datetime,
	max_waiting_time integer,
	max_service_time integer,
	operator_comment text
);
CREATE TABLE ticket_histories (
	id text PRIMARY KEY,
	ticket_id text NOT NULL,
	action text NOT NULL,
	user_id text,
	payload blob,
	created_at datetime
);
`).Error; err != nil {
		t.Fatal(err)
	}

	unitID := "u-rtq"
	zoneID := "zone-rtq"
	svcID := "svc-rtq"
	created := time.Now().UTC().Format(time.RFC3339)
	called := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	if err := db.Exec(`
INSERT INTO tickets (
	id, queue_number, unit_id, service_zone_id, service_id, status, priority, is_eod,
	created_at, called_at, confirmed_at, counter_id
) VALUES (
	't-rtq', 'A-1', ?, ?, ?, 'called', 0, 0,
	?, ?, NULL, NULL
);
`, unitID, zoneID, svcID, created, called).Error; err != nil {
		t.Fatal(err)
	}

	hub := ws.NewHub()
	go hub.Run()

	ticketRepo := repository.NewTicketRepositoryWithDB(db)
	counterRepo := repository.NewCounterRepositoryWithDB(db)
	intervalRepo := repository.NewOperatorIntervalRepositoryWithDB(db)

	svc := NewTicketService(
		ticketRepo,
		counterRepo,
		nil,
		nil,
		intervalRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		hub,
		noopJobEnqueuer{},
	)

	out, err := svc.ReturnToQueue("t-rtq", nil)
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "waiting" {
		t.Fatalf("status: want waiting, got %q", out.Status)
	}
	if out.ServiceID != svcID {
		t.Fatalf("service_id: want %q, got %q", svcID, out.ServiceID)
	}
	if out.ServiceZoneID == nil || *out.ServiceZoneID != zoneID {
		t.Fatalf("service_zone_id: want %q, got %v", zoneID, out.ServiceZoneID)
	}
	if out.CounterID != nil {
		t.Fatalf("counter_id: want nil, got %v", out.CounterID)
	}
}
