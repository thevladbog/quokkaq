package services

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func serviceBehaviorPersistenceDB(t *testing.T) *gorm.DB {
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
	parent_id text,
	code text NOT NULL,
	kind text NOT NULL,
	sort_order integer NOT NULL DEFAULT 0,
	name text NOT NULL,
	name_en text,
	timezone text NOT NULL,
	config text,
	skill_based_routing_enabled integer NOT NULL DEFAULT 0,
	created_at datetime,
	updated_at datetime
);
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
INSERT INTO units (id, company_id, code, kind, name, timezone) VALUES ('unit-1', 'company-1', 'u1', 'subdivision', 'Unit', 'UTC');
`).Error; err != nil {
		t.Fatal(err)
	}
	previous := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = previous })
	return db
}

func mustServiceBehavior(t *testing.T, raw string) *models.ServiceBehavior {
	t.Helper()
	behavior, err := models.ParseServiceBehaviorJSON(json.RawMessage(raw))
	if err != nil {
		t.Fatal(err)
	}
	return behavior
}

func TestServiceBehaviorPersistenceAndNullCanonicalization(t *testing.T) {
	db := serviceBehaviorPersistenceDB(t)
	serviceRepo := repository.NewServiceRepository()
	serviceService := NewServiceService(serviceRepo, repository.NewUnitRepository())
	valid := `{"version":1,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true}],"dataRetentionDays":7}`

	created := &models.Service{
		ID:       "service-1",
		UnitID:   "unit-1",
		Name:     "Behavior service",
		Behavior: mustServiceBehavior(t, valid),
	}
	if err := serviceService.CreateService(created); err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := db.Raw(`SELECT behavior FROM services WHERE id = ?`, created.ID).Row().Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != valid {
		t.Fatalf("stored behavior = %s", stored)
	}

	updated := *created
	updatedBehavior := `{"version":1,"fields":[{"key":"room","label":{"en":"Room"},"type":"text","required":true}],"dataRetentionDays":3}`
	if err := MergeServiceJSONPatch(&updated, map[string]json.RawMessage{"behavior": json.RawMessage(updatedBehavior)}); err != nil {
		t.Fatal(err)
	}
	if err := serviceService.UpdateService(&updated); err != nil {
		t.Fatal(err)
	}
	if err := db.Raw(`SELECT behavior FROM services WHERE id = ?`, created.ID).Row().Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != updatedBehavior {
		t.Fatalf("updated behavior did not persist: %s", stored)
	}

	omitted := updated
	if err := MergeServiceJSONPatch(&omitted, map[string]json.RawMessage{"name": json.RawMessage(`"Renamed"`)}); err != nil {
		t.Fatal(err)
	}
	if err := serviceService.UpdateService(&omitted); err != nil {
		t.Fatal(err)
	}
	if err := db.Raw(`SELECT behavior FROM services WHERE id = ?`, created.ID).Row().Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != updatedBehavior {
		t.Fatalf("omitted behavior should persist, got %s", stored)
	}

	cleared := omitted
	if err := MergeServiceJSONPatch(&cleared, map[string]json.RawMessage{"behavior": json.RawMessage("null")}); err != nil {
		t.Fatal(err)
	}
	if cleared.Behavior != nil {
		t.Fatalf("explicit null did not clear behavior: %#v", cleared.Behavior)
	}
	if err := serviceService.UpdateService(&cleared); err != nil {
		t.Fatal(err)
	}
	var nullBehavior sql.NullString
	if err := db.Raw(`SELECT behavior FROM services WHERE id = ?`, created.ID).Row().Scan(&nullBehavior); err != nil {
		t.Fatal(err)
	}
	if nullBehavior.Valid {
		t.Fatalf("cleared behavior persisted as %q instead of SQL NULL", nullBehavior.String)
	}

	var nullCreate models.Service
	if err := json.Unmarshal([]byte(`{"id":"service-2","unitId":"unit-1","name":"Null behavior","behavior":null}`), &nullCreate); err != nil {
		t.Fatal(err)
	}
	if err := serviceService.CreateService(&nullCreate); err != nil {
		t.Fatal(err)
	}
	if nullCreate.Behavior != nil {
		t.Fatalf("create null behavior = %#v, want nil", nullCreate.Behavior)
	}
	if err := db.Raw(`SELECT behavior FROM services WHERE id = ?`, nullCreate.ID).Row().Scan(&nullBehavior); err != nil {
		t.Fatal(err)
	}
	if nullBehavior.Valid {
		t.Fatalf("create null persisted as %q instead of SQL NULL", nullBehavior.String)
	}
	response, err := json.Marshal(nullCreate)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(response, []byte(`"behavior"`)) {
		t.Fatalf("canonical response exposed behavior:null: %s", response)
	}

	if err := db.Exec(`UPDATE services SET behavior = 'null' WHERE id = ?`, created.ID).Error; err != nil {
		t.Fatal(err)
	}
	legacyNull, err := serviceService.GetServiceByID(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if legacyNull.Behavior != nil {
		t.Fatalf("legacy JSON null remained in response model: %#v", legacyNull.Behavior)
	}
	response, err = json.Marshal(legacyNull)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(response, []byte(`"behavior"`)) {
		t.Fatalf("legacy JSON null response exposed behavior:null: %s", response)
	}
}
