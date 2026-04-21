package services

import (
	"errors"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// visitorTestDB opens an in-memory SQLite with the tables needed by VisitorCancelTicket
// and AttachPhoneToTicket.
func visitorTestDB(t *testing.T) *gorm.DB {
	t.Helper()
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
CREATE TABLE unit_clients (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	first_name text NOT NULL,
	last_name text NOT NULL,
	phone_e164 text,
	photo_url text,
	locale text,
	is_anonymous integer DEFAULT 0,
	created_at datetime,
	updated_at datetime
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

// insertWaitingTicket inserts a waiting ticket row and returns its ID.
func insertWaitingTicket(t *testing.T, db *gorm.DB, id, unitID, svcID string) {
	t.Helper()
	created := time.Now().UTC().Format(time.RFC3339)
	if err := db.Exec(`
INSERT INTO tickets (id, queue_number, unit_id, service_id, status, priority, is_eod, is_credit, created_at)
VALUES (?, 'А-1', ?, ?, 'waiting', 0, 0, 0, ?)
`, id, unitID, svcID, created).Error; err != nil {
		t.Fatal(err)
	}
}

func insertCalledTicket(t *testing.T, db *gorm.DB, id, unitID, svcID string) {
	t.Helper()
	created := time.Now().UTC().Format(time.RFC3339)
	called := time.Now().UTC().Add(-30 * time.Second).Format(time.RFC3339)
	if err := db.Exec(`
INSERT INTO tickets (id, queue_number, unit_id, service_id, status, priority, is_eod, is_credit, created_at, called_at)
VALUES (?, 'А-2', ?, ?, 'called', 0, 0, 0, ?, ?)
`, id, unitID, svcID, created, called).Error; err != nil {
		t.Fatal(err)
	}
}

// stubClientRepo is a minimal UnitClientRepository for AttachPhoneToTicket tests.
type stubClientRepo struct {
	repository.UnitClientRepository
	findByPhoneResult *models.UnitClient
	findByPhoneErr    error
	created           []*models.UnitClient
}

func (s *stubClientRepo) FindByUnitAndPhoneE164Tx(_ *gorm.DB, _, _ string) (*models.UnitClient, error) {
	return s.findByPhoneResult, s.findByPhoneErr
}

func (s *stubClientRepo) CreateTx(_ *gorm.DB, c *models.UnitClient) error {
	c.ID = "new-client-id"
	s.created = append(s.created, c)
	return nil
}

// buildVisitorSvc constructs a ticketService suitable for visitor tests.
func buildVisitorSvc(t *testing.T, db *gorm.DB, clientRepo repository.UnitClientRepository) TicketService {
	t.Helper()
	hub := ws.NewHub()
	go hub.Run()
	ticketRepo := repository.NewTicketRepositoryWithDB(db)
	counterRepo := repository.NewCounterRepositoryWithDB(db)
	intervalRepo := repository.NewOperatorIntervalRepositoryWithDB(db)
	return NewTicketService(
		ticketRepo,
		counterRepo,
		nil, nil,
		intervalRepo,
		clientRepo,
		nil, nil, nil,
		nil, // operatorSkillRepo
		nil, // calendar
		hub,
		noopJobEnqueuer{},
	)
}

// --- VisitorCancelTicket ---

func TestVisitorCancelTicket_waitingBecomesNoShow(t *testing.T) {
	db := visitorTestDB(t)
	insertWaitingTicket(t, db, "t-vc-1", "u1", "s1")
	svc := buildVisitorSvc(t, db, nil)

	out, err := svc.VisitorCancelTicket("t-vc-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.Status != "no_show" {
		t.Errorf("status: want 'no_show', got %q", out.Status)
	}
	// Verify history row was created.
	var count int64
	db.Raw("SELECT COUNT(*) FROM ticket_histories WHERE ticket_id = ?", "t-vc-1").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 history row, got %d", count)
	}
}

func TestVisitorCancelTicket_nonWaitingReturnsError(t *testing.T) {
	db := visitorTestDB(t)
	insertCalledTicket(t, db, "t-vc-called", "u1", "s1")
	svc := buildVisitorSvc(t, db, nil)

	_, err := svc.VisitorCancelTicket("t-vc-called")
	if !errors.Is(err, ErrTicketNotCancellable) {
		t.Errorf("expected ErrTicketNotCancellable, got %v", err)
	}
}

func TestVisitorCancelTicket_notFoundReturnsError(t *testing.T) {
	db := visitorTestDB(t)
	svc := buildVisitorSvc(t, db, nil)

	_, err := svc.VisitorCancelTicket("nonexistent-ticket")
	if err == nil {
		t.Fatal("expected error for nonexistent ticket, got nil")
	}
}

// --- AttachPhoneToTicket ---

func TestAttachPhoneToTicket_createsNewClientAndLinksTicket(t *testing.T) {
	db := visitorTestDB(t)
	insertWaitingTicket(t, db, "t-ap-1", "u1", "s1")
	// "phone not found" → repo creates new client
	clientRepo := &stubClientRepo{
		findByPhoneErr: gorm.ErrRecordNotFound,
	}
	svc := buildVisitorSvc(t, db, clientRepo)

	out, err := svc.AttachPhoneToTicket("t-ap-1", "+79001234567", "ru")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.ClientID == nil {
		t.Fatal("expected ClientID to be set after attach")
	}
	if len(clientRepo.created) != 1 {
		t.Errorf("expected 1 new client row, got %d", len(clientRepo.created))
	}
	if clientRepo.created[0].PhoneE164 == nil || *clientRepo.created[0].PhoneE164 != "+79001234567" {
		t.Errorf("new client phone: want '+79001234567', got %v", clientRepo.created[0].PhoneE164)
	}
}

func TestAttachPhoneToTicket_existingClientLinked(t *testing.T) {
	db := visitorTestDB(t)
	insertWaitingTicket(t, db, "t-ap-2", "u1", "s1")
	existingPhone := "+79001111111"
	existingClient := &models.UnitClient{
		ID:        "existing-client-id",
		UnitID:    "u1",
		PhoneE164: &existingPhone,
	}
	clientRepo := &stubClientRepo{
		findByPhoneResult: existingClient,
		findByPhoneErr:    nil,
	}
	svc := buildVisitorSvc(t, db, clientRepo)

	out, err := svc.AttachPhoneToTicket("t-ap-2", existingPhone, "ru")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.ClientID == nil || *out.ClientID != "existing-client-id" {
		t.Errorf("expected ticket linked to 'existing-client-id', got %v", out.ClientID)
	}
	if len(clientRepo.created) != 0 {
		t.Errorf("should not create new client when existing client found")
	}
}

func TestAttachPhoneToTicket_nonWaitingReturnsError(t *testing.T) {
	db := visitorTestDB(t)
	insertCalledTicket(t, db, "t-ap-called", "u1", "s1")
	svc := buildVisitorSvc(t, db, &stubClientRepo{})

	_, err := svc.AttachPhoneToTicket("t-ap-called", "+79001234567", "ru")
	if !errors.Is(err, ErrTicketNotWaiting) {
		t.Errorf("expected ErrTicketNotWaiting, got %v", err)
	}
}
