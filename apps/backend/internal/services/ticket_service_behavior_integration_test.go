package services

import (
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type ticketBehaviorIntegrationRepo struct {
	repository.TicketRepository
}

func (r ticketBehaviorIntegrationRepo) GetNextSequenceTx(*gorm.DB, string, string, string) (int, error) {
	return 1, nil
}

func (r ticketBehaviorIntegrationRepo) CreateTx(tx *gorm.DB, ticket *models.Ticket) error {
	ticket.ID = "ticket-behavior-1"
	return tx.Create(ticket).Error
}

type ticketBehaviorClientRepo struct {
	repository.UnitClientRepository
}

func (ticketBehaviorClientRepo) EnsureAnonymousForUnitTx(*gorm.DB, string) (*models.UnitClient, error) {
	return &models.UnitClient{ID: "anonymous-client", UnitID: "u1", IsAnonymous: true}, nil
}

func setupTicketBehaviorIntegration(t *testing.T) (TicketService, *gorm.DB) {
	t.Helper()
	db := visitorTestDB(t)
	if err := db.Exec(`
CREATE TABLE services (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	parent_id text,
	name text NOT NULL,
	name_ru text,
	name_en text,
	description text,
	description_ru text,
	description_en text,
	image_url text,
	icon_key text,
	background_color text,
	text_color text,
	prefix text,
	number_sequence text,
	duration integer,
	max_waiting_time integer,
	max_service_time integer,
	prebook integer NOT NULL DEFAULT 0,
	calendar_slot_key text,
	offer_identification integer NOT NULL DEFAULT 0,
	identification_mode text NOT NULL DEFAULT 'none',
	kiosk_document_settings text,
	kiosk_identification_config text,
	behavior text,
	is_leaf integer NOT NULL DEFAULT 0,
	restricted_service_zone_id text,
	sort_order integer NOT NULL DEFAULT 0,
	grid_row integer,
	grid_col integer,
	grid_row_span integer,
	grid_col_span integer
);
`).Error; err != nil {
		t.Fatal(err)
	}
	behavior := `{"version":1,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true}],"dataRetentionDays":1}`
	if err := db.Exec(`INSERT INTO services (id, unit_id, name, identification_mode, behavior) VALUES (?, ?, ?, ?, ?)`, "service-behavior", "u1", "Behavior service", models.IdentificationModeBadge, behavior).Error; err != nil {
		t.Fatal(err)
	}

	previous := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = previous })
	hub := ws.NewHub()
	go hub.Run()
	return NewTicketService(
		ticketBehaviorIntegrationRepo{TicketRepository: repository.NewTicketRepositoryWithDB(db)},
		repository.NewCounterRepositoryWithDB(db),
		repository.NewServiceRepository(),
		nil,
		repository.NewOperatorIntervalRepositoryWithDB(db),
		ticketBehaviorClientRepo{},
		nil,
		nil,
		nil,
		nil,
		nil,
		hub,
		noopJobEnqueuer{},
	), db
}

func TestTicketServiceBehaviorFormWithBadgePersistsDocumentsDataAndExpiry(t *testing.T) {
	service, db := setupTicketBehaviorIntegration(t)
	kioskUserID := "employee-1"
	input := json.RawMessage(`{"form":{"room":"A-101"}}`)
	ticket, err := service.CreateTicket("u1", "service-behavior", nil, nil, nil, &input, nil, &kioskUserID)
	if err != nil {
		t.Fatal(err)
	}
	if ticket.KioskIdentifiedUserID == nil || *ticket.KioskIdentifiedUserID != kioskUserID {
		t.Fatal("badge identity was not retained")
	}
	if ticket.DocumentsDataExpiresAt == nil || ticket.DocumentsData == nil {
		t.Fatal("behavior form did not produce retained documents data")
	}

	var storedData sql.NullString
	var storedExpiry time.Time
	if err := db.Raw(`SELECT documents_data, documents_data_expires_at FROM tickets WHERE id = ?`, ticket.ID).Row().Scan(&storedData, &storedExpiry); err != nil {
		t.Fatal(err)
	}
	if !storedData.Valid || storedExpiry.IsZero() {
		t.Fatal("ticket row did not persist documentsData and expiry")
	}
	if !storedExpiry.After(time.Now().UTC()) || !storedExpiry.Before(time.Now().UTC().AddDate(0, 0, 2)) {
		t.Fatalf("unexpected behavior expiry: %v", storedExpiry)
	}
	// A past expiry is the repository cleanup predicate; the repository's SQLite
	// cleanup-contract test exercises the production-equivalent DELETE/NULL write.
	if err := db.Exec(`UPDATE tickets SET documents_data_expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Minute), ticket.ID).Error; err != nil {
		t.Fatal(err)
	}
	var cleanupEligible int
	if err := db.Raw(`SELECT COUNT(*) FROM tickets WHERE id = ? AND documents_data IS NOT NULL AND documents_data_expires_at < ?`, ticket.ID, time.Now().UTC()).Row().Scan(&cleanupEligible); err != nil {
		t.Fatal(err)
	}
	if cleanupEligible != 1 {
		t.Fatalf("expired behavior form ticket cleanup eligibility = %d", cleanupEligible)
	}

	legacy := json.RawMessage(`{"form":"legacy"}`)
	_, err = service.CreateTicket("u1", "service-behavior", nil, nil, nil, &legacy, nil, &kioskUserID)
	if !errors.Is(err, ErrDocumentsDataWithKioskIdp) {
		t.Fatalf("legacy form with badge error = %v", err)
	}
}
