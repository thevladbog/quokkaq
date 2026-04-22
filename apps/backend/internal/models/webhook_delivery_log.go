package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookDeliveryLog records one HTTP delivery attempt to a webhook endpoint.
type WebhookDeliveryLog struct {
	ID                string    `gorm:"primaryKey" json:"id"`
	WebhookEndpointID string    `gorm:"not null;index;column:webhook_endpoint_id" json:"webhookEndpointId"`
	TicketHistoryID   *string   `gorm:"index;column:ticket_history_id" json:"ticketHistoryId,omitempty"`
	HTTPStatus        *int      `gorm:"column:http_status" json:"httpStatus,omitempty"`
	ResponseSnippet   string    `gorm:"type:text;column:response_snippet" json:"-"`
	DurationMs        int       `gorm:"not null;default:0;column:duration_ms" json:"durationMs"`
	ErrorMessage      string    `gorm:"type:text;column:error_message" json:"errorMessage,omitempty"`
	Attempt           int       `gorm:"not null;default:1" json:"attempt"`
	CreatedAt         time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (w *WebhookDeliveryLog) BeforeCreate(tx *gorm.DB) error {
	if w.ID == "" {
		w.ID = uuid.New().String()
	}
	return nil
}
