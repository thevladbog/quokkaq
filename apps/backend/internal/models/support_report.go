package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SupportReport links a QuokkaQ user submission to a Plane work item.
type SupportReport struct {
	ID              string           `gorm:"primaryKey" json:"id"`
	CreatedByUserID string           `gorm:"not null;index;column:created_by_user_id" json:"createdByUserId"`
	PlaneWorkItemID string           `gorm:"not null;index;column:plane_work_item_id" json:"planeWorkItemId"`
	PlaneSequenceID *int             `gorm:"column:plane_sequence_id" json:"planeSequenceId,omitempty"`
	Title           string           `gorm:"not null" json:"title"`
	PlaneStatus     string           `gorm:"column:plane_status" json:"planeStatus,omitempty"`
	TraceID         string           `gorm:"column:trace_id" json:"traceId,omitempty"`
	Diagnostics     *json.RawMessage `gorm:"type:jsonb" json:"diagnostics,omitempty" swaggertype:"object"`
	UnitID          *string          `gorm:"index;column:unit_id" json:"unitId,omitempty"`
	LastSyncedAt    *time.Time       `gorm:"column:last_synced_at" json:"lastSyncedAt,omitempty" swaggertype:"string" format:"date-time"`
	CreatedAt       time.Time        `gorm:"autoCreateTime" json:"createdAt" swaggertype:"string" format:"date-time"`
	UpdatedAt       time.Time        `gorm:"autoUpdateTime" json:"updatedAt" swaggertype:"string" format:"date-time"`
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
