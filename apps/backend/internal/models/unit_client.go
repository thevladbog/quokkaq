package models

import (
	"time"
)

// UnitClient is a per-unit directory entry (visitor / customer). One row per unit has is_anonymous=true (shared kiosk tickets).
type UnitClient struct {
	ID        string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string  `gorm:"not null;index" json:"unitId"`
	FirstName string  `gorm:"not null" json:"firstName"`
	LastName  string  `gorm:"not null" json:"lastName"`
	PhoneE164 *string `gorm:"column:phone_e164" json:"phoneE164,omitempty"`
	PhotoURL  *string `gorm:"column:photo_url" json:"photoUrl,omitempty"`
	// Locale is the visitor's preferred locale ("ru" or "en"), set from the kiosk/virtual-queue on first phone identification.
	Locale      *string   `gorm:"column:locale" json:"locale,omitempty"`
	IsAnonymous bool      `gorm:"not null;default:false" json:"isAnonymous"`
	CreatedAt   time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	// Definitions are visitor tags assigned to this client (excludes anonymous aggregate use in API).
	// Join table FKs are defined in SQL migrations (unit-scoped composites); constraint:false avoids duplicate AutoMigrate constraints.
	Definitions []UnitVisitorTagDefinition `gorm:"many2many:unit_client_tag_assignments;joinForeignKey:unit_client_id;joinReferences:tag_definition_id;constraint:false" json:"definitions,omitempty"`
}

func (UnitClient) TableName() string {
	return "unit_clients"
}
