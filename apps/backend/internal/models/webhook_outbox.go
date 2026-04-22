package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookOutbox rows are written in the same DB transaction as ticket_histories
// and processed asynchronously so HTTP delivery never blocks commits.
type WebhookOutbox struct {
	ID              string     `gorm:"primaryKey" json:"id"`
	CompanyID       string     `gorm:"not null;index;column:company_id" json:"companyId"`
	TicketHistoryID string     `gorm:"not null;index;column:ticket_history_id" json:"ticketHistoryId"`
	AttemptCount    int        `gorm:"not null;default:0;column:attempt_count" json:"attemptCount"`
	NextAttemptAt   time.Time  `gorm:"not null;column:next_attempt_at" json:"nextAttemptAt"`
	LockedUntil     *time.Time `gorm:"column:locked_until" json:"lockedUntil,omitempty"`
	CreatedAt       time.Time  `gorm:"autoCreateTime" json:"createdAt"`
}

// TableName keeps GORM on the singular table name (migration: webhook_outbox; default GORM name would be webhook_outboxes).
func (WebhookOutbox) TableName() string {
	return "webhook_outbox"
}

func (w *WebhookOutbox) BeforeCreate(tx *gorm.DB) error {
	if w.ID == "" {
		w.ID = uuid.New().String()
	}
	return nil
}
