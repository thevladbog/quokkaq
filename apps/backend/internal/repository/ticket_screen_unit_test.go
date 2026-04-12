package repository

import (
	"testing"
	"time"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newScreenTicketsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Minimal schema matching Preload chain used by FindBySubdivisionAndServiceZoneID.
	if err := db.Exec(`
CREATE TABLE units (
	id text PRIMARY KEY,
	company_id text NOT NULL DEFAULT 'c',
	code text NOT NULL DEFAULT 'x',
	kind text NOT NULL DEFAULT 'subdivision',
	sort_order integer DEFAULT 0,
	name text NOT NULL DEFAULT 'n',
	timezone text NOT NULL DEFAULT 'UTC',
	config text,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE services (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	name text NOT NULL DEFAULT 's',
	is_leaf integer DEFAULT 1,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE counters (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	name text NOT NULL DEFAULT 'c',
	created_at datetime,
	updated_at datetime
);
CREATE TABLE pre_registrations (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	created_at datetime,
	updated_at datetime
);
CREATE TABLE unit_clients (
	id text NOT NULL,
	unit_id text NOT NULL,
	first_name text NOT NULL,
	last_name text NOT NULL,
	PRIMARY KEY (id, unit_id)
);
CREATE TABLE visitor_tag_definitions (
	id text PRIMARY KEY,
	unit_id text NOT NULL,
	label text NOT NULL DEFAULT 'l',
	color text NOT NULL DEFAULT '#000',
	created_at datetime,
	updated_at datetime
);
CREATE TABLE tickets (
	id text PRIMARY KEY,
	queue_number text NOT NULL,
	unit_id text NOT NULL,
	service_zone_id text,
	service_id text NOT NULL,
	counter_id text,
	pre_registration_id text,
	client_id text,
	status text DEFAULT 'waiting',
	priority integer DEFAULT 0,
	is_eod integer DEFAULT 0,
	created_at datetime,
	FOREIGN KEY (unit_id) REFERENCES units(id),
	FOREIGN KEY (service_id) REFERENCES services(id)
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestFindBySubdivisionAndServiceZoneID(t *testing.T) {
	db := newScreenTicketsTestDB(t)
	r := &ticketRepository{db: db}

	sub := "sub-scr"
	zoneA := "zone-a-scr"
	zoneB := "zone-b-scr"
	svc := "svc-scr"
	now := time.Now().UTC().Format(time.RFC3339)
	if err := db.Exec(`INSERT INTO units (id) VALUES (?)`, sub).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO services (id, unit_id) VALUES (?, ?)`, svc, sub).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
INSERT INTO tickets (id, queue_number, unit_id, service_zone_id, service_id, status, is_eod, created_at)
VALUES
  ('t-a1', 'A1', ?, ?, ?, 'waiting', 0, ?),
  ('t-a2', 'A2', ?, ?, ?, 'called', 0, ?),
  ('t-b1', 'B1', ?, ?, ?, 'waiting', 0, ?),
  ('t-null', 'G1', ?, NULL, ?, 'waiting', 0, ?);
`, sub, zoneA, svc, now, sub, zoneA, svc, now, sub, zoneB, svc, now, sub, svc, now).Error; err != nil {
		t.Fatal(err)
	}

	got, err := r.FindBySubdivisionAndServiceZoneID(sub, zoneA)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("zone A: want 2 tickets, got %d", len(got))
	}
	ids := map[string]bool{got[0].ID: true, got[1].ID: true}
	if !ids["t-a1"] || !ids["t-a2"] {
		t.Fatalf("zone A: unexpected ids %v / %v", got[0].ID, got[1].ID)
	}

	gotB, err := r.FindBySubdivisionAndServiceZoneID(sub, zoneB)
	if err != nil {
		t.Fatal(err)
	}
	if len(gotB) != 1 || gotB[0].ID != "t-b1" {
		t.Fatalf("zone B: want [t-b1], got %#v", gotB)
	}
}
