package models

import "time"

// DesktopTerminal is a paired kiosk device (Tauri) scoped to one unit.
// When CounterID is set, the device is a guest-rating screen at that counter (UnitID is the counter's subdivision).
type DesktopTerminal struct {
	ID                string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID            string     `gorm:"not null;index" json:"unitId"`
	CounterID         *string    `gorm:"index;column:counter_id" json:"counterId,omitempty"`
	Name              *string    `json:"name,omitempty"`
	DefaultLocale     string     `gorm:"not null;default:en" json:"defaultLocale"`
	KioskFullscreen   bool       `gorm:"not null;default:false" json:"kioskFullscreen"`
	PairingCodeDigest string     `gorm:"uniqueIndex;not null;size:64" json:"-"`
	SecretHash        string     `gorm:"not null" json:"-"`
	RevokedAt         *time.Time `json:"revokedAt,omitempty"`
	LastSeenAt        *time.Time `json:"lastSeenAt,omitempty"`
	CreatedAt         time.Time  `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt         time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	Unit    Unit     `gorm:"foreignKey:UnitID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"unit,omitempty"`
	Counter *Counter `gorm:"foreignKey:CounterID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"counter,omitempty"`
}
