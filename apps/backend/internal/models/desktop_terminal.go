package models

import (
	"strings"
	"time"
)

// EffectiveTerminalKind resolves kind with legacy fallback for rows before kind was stored.
func EffectiveTerminalKind(t *DesktopTerminal) string {
	if t == nil {
		return DesktopTerminalKindKiosk
	}
	hasCounter := t.CounterID != nil && strings.TrimSpace(*t.CounterID) != ""
	k := strings.ToLower(strings.TrimSpace(t.Kind))
	if k == "" {
		if hasCounter {
			return DesktopTerminalKindCounterGuestSurvey
		}
		return DesktopTerminalKindKiosk
	}
	if k == DesktopTerminalKindCounterBoard {
		return DesktopTerminalKindCounterBoard
	}
	if k == DesktopTerminalKindCounterGuestSurvey {
		return DesktopTerminalKindCounterGuestSurvey
	}
	// "kiosk" (or unknown) with a counter binding is invalid — treat as guest survey terminal.
	if hasCounter {
		return DesktopTerminalKindCounterGuestSurvey
	}
	return DesktopTerminalKindKiosk
}

// Desktop terminal kind: kiosk (no counter), counter_guest_survey (counter display + survey), counter_board (above-counter ticket board only).
const (
	DesktopTerminalKindKiosk              = "kiosk"
	DesktopTerminalKindCounterGuestSurvey = "counter_guest_survey"
	DesktopTerminalKindCounterBoard       = "counter_board"
)

// DesktopTerminal is a paired kiosk device (Tauri) scoped to one unit.
// When CounterID is set, Kind distinguishes guest survey screen vs ticket board.
type DesktopTerminal struct {
	ID                string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID            string     `gorm:"not null;index" json:"unitId"`
	CounterID         *string    `gorm:"index;column:counter_id" json:"counterId,omitempty"`
	Kind              string     `gorm:"size:32;not null;default:kiosk;index" json:"kind"`
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
