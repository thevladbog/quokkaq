package repository

import (
	"testing"
	"time"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newFindWaitingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Minimal schema: GORM AutoMigrate pulls in related models with PostgreSQL-only defaults.
	if err := db.Exec(`
CREATE TABLE tickets (
	id text PRIMARY KEY,
	queue_number text NOT NULL,
	unit_id text NOT NULL,
	service_zone_id text,
	service_id text NOT NULL,
	status text DEFAULT 'waiting',
	priority integer DEFAULT 0,
	is_eod integer DEFAULT 0,
	created_at datetime
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestFindWaiting_nilPoolSelectsOnlySubdivisionWideTickets(t *testing.T) {
	db := newFindWaitingTestDB(t)
	r := &ticketRepository{db: db}

	unitID := "unit-find-wait"
	zoneA := "zone-a-fw"
	svcID := "svc-fw"
	now := time.Now().UTC().Format(time.RFC3339)
	now2 := time.Now().UTC().Add(time.Minute).Format(time.RFC3339)
	if err := db.Exec(`
INSERT INTO tickets (id, queue_number, unit_id, service_zone_id, service_id, status, priority, is_eod, created_at)
VALUES ('t-zone', 'Z-1', ?, ?, ?, 'waiting', 0, 0, ?),
       ('t-null', 'G-1', ?, NULL, ?, 'waiting', 0, 0, ?);
`, unitID, zoneA, svcID, now, unitID, svcID, now2).Error; err != nil {
		t.Fatal(err)
	}

	got, err := r.FindWaiting(unitID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "t-null" {
		t.Fatalf("nil pool: want ticket t-null, got %s", got.ID)
	}

	gotZ, err := r.FindWaiting(unitID, nil, &zoneA)
	if err != nil {
		t.Fatal(err)
	}
	if gotZ.ID != "t-zone" {
		t.Fatalf("zone pool: want ticket t-zone, got %s", gotZ.ID)
	}
}
