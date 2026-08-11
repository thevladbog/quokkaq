package models

import (
	"encoding/json"
	"time"
)

// ScreenLayoutTemplate is a tenant-scoped named screen layout definition (JSON matches frontend ScreenTemplate).
type ScreenLayoutTemplate struct {
	ID                 string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID          string  `gorm:"not null;index" json:"companyId"`
	Name               string  `gorm:"not null" json:"name"`
	Surface            string  `gorm:"size:32;not null;default:queue-display;index" json:"surface"`
	PublishedVersionID *string `gorm:"column:published_version_id;index" json:"publishedVersionId,omitempty"`
	// swaggertype:object — stored as JSONB; API returns arbitrary JSON object.
	Definition json.RawMessage `gorm:"type:jsonb;not null" json:"definition" swaggertype:"object"`
	CreatedAt  time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt  time.Time       `gorm:"default:now()" json:"updatedAt"`
}
