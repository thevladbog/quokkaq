package models

import (
	"encoding/json"
	"time"
)

// ScreenLayoutTemplate is a tenant-scoped named screen layout definition (JSON matches frontend ScreenTemplate).
type ScreenLayoutTemplate struct {
	ID        string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string `gorm:"not null;index" json:"companyId"`
	Name      string `gorm:"not null" json:"name"`
	// swaggertype:object — stored as JSONB; API returns arbitrary JSON object.
	Definition json.RawMessage `gorm:"type:jsonb;not null" json:"definition" swaggertype:"object"`
	CreatedAt  time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt  time.Time       `gorm:"default:now()" json:"updatedAt"`
}
