package models

import (
	"time"
)

// UnitVisitorTagDefinition is an admin-defined tag (label + color) scoped to a unit.
type UnitVisitorTagDefinition struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID    string    `gorm:"not null;index" json:"unitId"`
	Label     string    `gorm:"not null" json:"label"`
	Color     string    `gorm:"not null" json:"color"` // e.g. #RRGGBB
	SortOrder int       `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (UnitVisitorTagDefinition) TableName() string {
	return "unit_visitor_tag_definitions"
}

// UnitClientTagAssignment is the many-to-many join between unit_clients and tag definitions.
// unit_id duplicates the client's unit and enforces composite FKs so assignments cannot cross units.
type UnitClientTagAssignment struct {
	UnitID          string `gorm:"primaryKey;column:unit_id;not null" json:"unitId"`
	UnitClientID    string `gorm:"primaryKey;column:unit_client_id" json:"unitClientId"`
	TagDefinitionID string `gorm:"primaryKey;column:tag_definition_id" json:"tagDefinitionId"`
}

func (UnitClientTagAssignment) TableName() string {
	return "unit_client_tag_assignments"
}
