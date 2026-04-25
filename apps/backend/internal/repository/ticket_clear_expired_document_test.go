package repository

import (
	"testing"
	"time"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// newClearExpiredTestDB is SQLite with the columns needed for document-data TTL.
func newClearExpiredTestDB(t *testing.T) *gorm.DB {
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
	service_zone_id text,
	service_id text NOT NULL,
	status text DEFAULT 'waiting',
	priority integer DEFAULT 0,
	is_eod integer DEFAULT 0,
	is_credit integer DEFAULT 0,
	documents_data text,
	documents_data_expires_at datetime,
	created_at datetime
);
`).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

// clearExpiredSQL mirrors production: null documents when past expiry. SQLite uses
// datetime() instead of PostgreSQL NOW() so we can test in-memory.
// Production: [ticket_repository.go ClearExpiredTicketDocuments] uses < NOW() on Postgres.
func (r *ticketRepository) clearExpiredDocumentRowsSQLite() (int64, error) {
	res := r.db.Exec(`UPDATE tickets SET documents_data = NULL, documents_data_expires_at = NULL
		WHERE documents_data_expires_at IS NOT NULL
		AND datetime(documents_data_expires_at) < datetime('now')`)
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

func TestClearExpiredDocumentRows_pastCleared(t *testing.T) {
	db := newClearExpiredTestDB(t)
	r := &ticketRepository{db: db}
	past := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)
	future := time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339)
	nowish := time.Now().UTC().Format(time.RFC3339)
	if err := db.Exec(`
INSERT INTO tickets (id, queue_number, unit_id, service_id, documents_data, documents_data_expires_at, created_at)
VALUES
  ('a', '1', 'u1', 's1', '{"k":1}', ?, ?),
  ('b', '2', 'u1', 's1', '{"k":2}', ?, ?);
`, past, nowish, future, nowish).Error; err != nil {
		t.Fatal(err)
	}
	n, err := r.clearExpiredDocumentRowsSQLite()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("rows affected: want 1, got %d", n)
	}
	var aDoc, aExp, bDoc, bExp *string
	_ = db.Raw(`SELECT documents_data, documents_data_expires_at FROM tickets WHERE id = 'a' LIMIT 1`).Row().Scan(&aDoc, &aExp)
	if aDoc != nil || aExp != nil {
		t.Fatalf("past row should be cleared, got d=%v e=%v", aDoc, aExp)
	}
	_ = db.Raw(`SELECT documents_data, documents_data_expires_at FROM tickets WHERE id = 'b' LIMIT 1`).Row().Scan(&bDoc, &bExp)
	if bDoc == nil || bExp == nil {
		t.Fatal("future row should keep data and future expiry")
	}
}
