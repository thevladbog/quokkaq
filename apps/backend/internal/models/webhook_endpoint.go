package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookEndpoint is an outgoing HTTPS subscriber for ticket lifecycle events.
type WebhookEndpoint struct {
	ID                  string          `gorm:"primaryKey" json:"id"`
	CompanyID           string          `gorm:"not null;index" json:"companyId"`
	UnitID              *string         `gorm:"index" json:"unitId,omitempty"`
	URL                 string          `gorm:"not null;type:text" json:"url"`
	SigningSecret       string          `gorm:"not null;type:text;column:signing_secret" json:"-"`
	EventTypes          json.RawMessage `gorm:"type:jsonb;not null;default:'[]'" json:"eventTypes"`
	Enabled             bool            `gorm:"not null;default:true" json:"enabled"`
	ConsecutiveFailures int             `gorm:"not null;default:0;column:consecutive_failures" json:"consecutiveFailures"`
	CreatedAt           time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt           time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (w *WebhookEndpoint) BeforeCreate(tx *gorm.DB) error {
	if w.ID == "" {
		w.ID = uuid.New().String()
	}
	return nil
}
