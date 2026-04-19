package models

import (
	"encoding/json"
	"time"
)

type Notification struct {
	ID       string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Type     string     `gorm:"not null" json:"type"`
	Payload  []byte     `gorm:"type:jsonb;not null" json:"payload"`
	Status   string     `gorm:"default:'pending'" json:"status"`
	Attempts int        `gorm:"default:0" json:"attempts"`
	LastAt   *time.Time `json:"lastAt,omitempty"`
}

type AuditLog struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    *string   `json:"userId,omitempty"`
	Action    string    `gorm:"not null" json:"action"`
	Payload   []byte    `gorm:"type:jsonb" json:"payload,omitempty"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`
}

type UnitMaterial struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string    `gorm:"not null" json:"unitId"`
	Type      string    `gorm:"not null" json:"type"`
	URL       string    `gorm:"not null" json:"url"`
	Filename  string    `gorm:"not null" json:"filename"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
}

type Invitation struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string    `gorm:"not null;index" json:"companyId"`
	Token     string    `gorm:"unique;not null" json:"token"`
	Status    string    `gorm:"default:'active'" json:"status"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	UserID    *string   `gorm:"unique" json:"userId,omitempty"`
	Email     string    `gorm:"not null" json:"email"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	User    *User   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`

	// Stored permissions to be assigned upon acceptance (JSONB; OpenAPI as generic object)
	TargetUnits json.RawMessage `gorm:"type:jsonb" json:"targetUnits" swaggertype:"object"`
	TargetRoles json.RawMessage `gorm:"type:jsonb" json:"targetRoles" swaggertype:"object"`
}

type MessageTemplate struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string    `gorm:"not null;index" json:"companyId"`
	Name      string    `gorm:"not null" json:"name"`
	Subject   string    `gorm:"not null" json:"subject"`
	Content   string    `gorm:"not null" json:"content"`
	IsDefault bool      `gorm:"default:false" json:"isDefault"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
