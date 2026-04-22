package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookOutbox rows are written in the same DB transaction as ticket_histories
// and processed asynchronously so HTTP delivery never blocks commits.
type WebhookOutbox struct {
	ID              string    `gorm:"primaryKey" json:"id"`
	CompanyID       string    `gorm:"not null;index;column:company_id" json:"companyId"`
	TicketHistoryID string    `gorm:"not null;index;column:ticket_history_id" json:"ticketHistoryId"`
	CreatedAt       time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (w *WebhookOutbox) BeforeCreate(tx *gorm.DB) error {
	if w.ID == "" {
		w.ID = uuid.New().String()
	}
	return nil
}
