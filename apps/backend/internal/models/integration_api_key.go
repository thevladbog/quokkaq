package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IntegrationAPIKey is a machine credential for /integrations/v1 (Bearer qqk_<id>_<secret>).
type IntegrationAPIKey struct {
	ID              string          `gorm:"primaryKey" json:"id"`
	CompanyID       string          `gorm:"not null;index" json:"companyId"`
	UnitID          *string         `gorm:"index" json:"unitId,omitempty"`
	Name            string          `gorm:"not null" json:"name"`
	SecretHash      string          `gorm:"not null;column:secret_hash" json:"-"`
	Scopes          json.RawMessage `gorm:"type:jsonb;not null;default:'[]'" json:"scopes"`
	CreatedByUserID *string         `gorm:"column:created_by_user_id" json:"createdByUserId,omitempty"`
	RevokedAt       *time.Time      `gorm:"column:revoked_at" json:"revokedAt,omitempty"`
	LastUsedAt      *time.Time      `gorm:"column:last_used_at" json:"lastUsedAt,omitempty"`
	CreatedAt       time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt       time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (k *IntegrationAPIKey) BeforeCreate(tx *gorm.DB) error {
	if k.ID == "" {
		k.ID = uuid.New().String()
	}
	return nil
}
