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

func (noopJobEnqueuer) EnqueueTtsGenerate(TtsJobPayload) error             { return nil }
func (noopJobEnqueuer) EnqueueSMSSend(SMSSendJobPayload) error             { return nil }
func (noopJobEnqueuer) EnqueueVisitorNotify(VisitorNotifyJobPayload) error { return nil }

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
	visitor_token text NOT NULL DEFAULT (lower(hex(randomblob(16)))),
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
	served_by_user_id text,
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
CREATE TABLE companies (
	id text PRIMARY KEY,
	subscription_id text,
	is_saas_operator integer NOT NULL DEFAULT 0
);
CREATE TABLE units (
	id text PRIMARY KEY,
	company_id text NOT NULL
);
CREATE TABLE subscription_plans (
	id text PRIMARY KEY,
	features text
);
CREATE TABLE subscriptions (
	id text PRIMARY KEY,
	plan_id text
);
INSERT INTO companies (id, is_saas_operator) VALUES ('c-rtq', 0);
INSERT INTO units (id, company_id) VALUES ('u-rtq', 'c-rtq');
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
		nil, // operatorSkillRepo
		nil, // calendar
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
