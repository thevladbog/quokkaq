package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// ErrUnitClientHistoryInvalidCursor is returned when the history list cursor cannot be parsed.
var ErrUnitClientHistoryInvalidCursor = errors.New("invalid client history cursor")

// UnitClientHistoryListRow is one history row with optional actor display name from users join.
type UnitClientHistoryListRow struct {
	ID           string
	UnitID       string
	UnitClientID string
	ActorUserID  *string
	Action       string
	Payload      []byte
	CreatedAt    time.Time
	ActorName    sql.NullString
}

// UnitClientHistoryRepository persists per-client CRM audit rows.
type UnitClientHistoryRepository interface {
	CreateTx(tx *gorm.DB, row *models.UnitClientHistory) error
	ListByUnitClientPaged(unitID, unitClientID string, limit int, beforeTime *time.Time, beforeID *string) ([]UnitClientHistoryListRow, error)
}

type unitClientHistoryRepository struct {
	db *gorm.DB
}

func NewUnitClientHistoryRepository() UnitClientHistoryRepository {
	return &unitClientHistoryRepository{db: database.DB}
}

func (r *unitClientHistoryRepository) CreateTx(tx *gorm.DB, row *models.UnitClientHistory) error {
	if tx == nil {
		return errors.New("nil tx in UnitClientHistoryRepository.CreateTx")
	}
	return tx.Create(row).Error
}

func (r *unitClientHistoryRepository) ListByUnitClientPaged(unitID, unitClientID string, limit int, beforeTime *time.Time, beforeID *string) ([]UnitClientHistoryListRow, error) {
	if limit <= 0 {
		limit = 20
	}
	// Allow 101 so callers can over-fetch by 1 for reliable nextCursor without phantom pages.
	if limit > 101 {
		limit = 101
	}
	q := r.db.Table("unit_client_histories AS h").
		Select("h.id, h.unit_id, h.unit_client_id, h.actor_user_id, h.action, h.payload, h.created_at, COALESCE(NULLIF(TRIM(u.name), ''), u.email) AS actor_name").
		Joins("LEFT JOIN users AS u ON u.id = h.actor_user_id").
		Where("h.unit_id = ? AND h.unit_client_id = ?", unitID, unitClientID).
		Order("h.created_at DESC, h.id DESC").
		Limit(limit)
	if beforeTime != nil && beforeID != nil && *beforeID != "" {
		q = q.Where("(h.created_at < ?) OR (h.created_at = ? AND h.id < ?)", *beforeTime, *beforeTime, *beforeID)
	}
	var rows []UnitClientHistoryListRow
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// EncodeUnitClientHistoryCursor builds an opaque pagination cursor from the last row.
func EncodeUnitClientHistoryCursor(t time.Time, id string) string {
	return fmt.Sprintf("%s|%s", t.Format(time.RFC3339Nano), id)
}

// DecodeUnitClientHistoryCursor parses the cursor from ListClientHistory nextCursor.
func DecodeUnitClientHistoryCursor(raw string) (time.Time, string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, "", ErrUnitClientHistoryInvalidCursor
	}
	parts := strings.SplitN(raw, "|", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return time.Time{}, "", ErrUnitClientHistoryInvalidCursor
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", fmt.Errorf("%w: %v", ErrUnitClientHistoryInvalidCursor, err)
	}
	return ts, parts[1], nil
}
