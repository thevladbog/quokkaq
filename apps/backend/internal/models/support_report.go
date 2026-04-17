package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Ticket backends for support_reports.ticket_backend (sync + cancel comment routing).
const (
	TicketBackendPlane         = "plane"
	TicketBackendYandexTracker = "yandex_tracker"
)

// SupportReport links a QuokkaQ user submission to an external ticket (Plane or Yandex Tracker).
type SupportReport struct {
	ID              string `gorm:"primaryKey" json:"id"`
	CreatedByUserID string `gorm:"not null;index;column:created_by_user_id" json:"createdByUserId"`
	// CreatedByName is the submitting user's display name (User.Name); not persisted, filled on read APIs such as GetByID.
	CreatedByName            string           `gorm:"-" json:"createdByName,omitempty"`
	TicketBackend            string           `gorm:"column:ticket_backend;default:plane" json:"ticketBackend,omitempty"`
	PlaneWorkItemID          string           `gorm:"not null;index;column:plane_work_item_id" json:"planeWorkItemId"`
	PlaneSequenceID          *int             `gorm:"column:plane_sequence_id" json:"planeSequenceId,omitempty"`
	Title                    string           `gorm:"not null" json:"title"`
	Description              string           `gorm:"type:text;column:description" json:"description,omitempty"`
	PlaneStatus              string           `gorm:"column:plane_status" json:"planeStatus,omitempty"`
	TraceID                  string           `gorm:"column:trace_id" json:"traceId,omitempty"`
	Diagnostics              *json.RawMessage `gorm:"type:jsonb" json:"diagnostics,omitempty" swaggertype:"object"`
	UnitID                   *string          `gorm:"index;column:unit_id" json:"unitId,omitempty"`
	MarkedIrrelevantAt       *time.Time       `gorm:"column:marked_irrelevant_at" json:"markedIrrelevantAt,omitempty" swaggertype:"string" format:"date-time"`
	MarkedIrrelevantByUserID string           `gorm:"column:marked_irrelevant_by_user_id" json:"markedIrrelevantByUserId,omitempty"`
	LastSyncedAt             *time.Time       `gorm:"column:last_synced_at" json:"lastSyncedAt,omitempty" swaggertype:"string" format:"date-time"`
	CreatedAt                time.Time        `gorm:"autoCreateTime" json:"createdAt" swaggertype:"string" format:"date-time"`
	UpdatedAt                time.Time        `gorm:"autoUpdateTime" json:"updatedAt" swaggertype:"string" format:"date-time"`
}

// TableName overrides default pluralization.
func (SupportReport) TableName() string {
	return "support_reports"
}

// BeforeCreate assigns UUID primary key when empty.
func (r *SupportReport) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
