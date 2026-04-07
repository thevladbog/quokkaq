package models

import "time"

// DesktopTerminal is a paired kiosk device (Tauri) scoped to one unit.
type DesktopTerminal struct {
	ID                string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID            string     `gorm:"not null;index" json:"unitId"`
	Name              *string    `json:"name,omitempty"`
	DefaultLocale     string     `gorm:"not null;default:en" json:"defaultLocale"`
	KioskFullscreen   bool       `gorm:"not null;default:false" json:"kioskFullscreen"`
	PairingCodeDigest string     `gorm:"uniqueIndex;not null;size:64" json:"-"`
	SecretHash        string     `gorm:"not null" json:"-"`
	RevokedAt         *time.Time `json:"revokedAt,omitempty"`
	LastSeenAt        *time.Time `json:"lastSeenAt,omitempty"`
	CreatedAt         time.Time  `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt         time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	Unit Unit `gorm:"foreignKey:UnitID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"unit,omitempty"`
}
