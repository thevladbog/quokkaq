package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SupportReportShare grants an additional user read access to a support report (QuokkaQ API + Tracker field sync).
type SupportReportShare struct {
	ID               string    `gorm:"primaryKey" json:"id"`
	SupportReportID  string    `gorm:"not null;uniqueIndex:uq_support_report_share_report_user;column:support_report_id" json:"supportReportId"`
	SharedWithUserID string    `gorm:"not null;uniqueIndex:uq_support_report_share_report_user;column:shared_with_user_id" json:"sharedWithUserId"`
	GrantedByUserID  string    `gorm:"not null;column:granted_by_user_id" json:"grantedByUserId"`
	CreatedAt        time.Time `gorm:"autoCreateTime" json:"createdAt" swaggertype:"string" format:"date-time"`
}

func (SupportReportShare) TableName() string {
	return "support_report_shares"
}

func (s *SupportReportShare) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}
