package models

import "time"

// UnitOperationalState tracks EOD/statistics pipeline and admission freezes per subdivision.
type UnitOperationalState struct {
	UnitID string `gorm:"primaryKey;type:uuid" json:"unitId"`

	// Phase: idle | freezing | eod | reconciling | quiet | error
	Phase string `gorm:"size:32;not null;default:idle" json:"phase"`

	KioskFrozen           bool   `gorm:"not null;default:false" json:"kioskFrozen"`
	CounterLoginBlocked   bool   `gorm:"not null;default:false" json:"counterLoginBlocked"`
	StatisticsQuiet       bool   `gorm:"not null;default:false" json:"statisticsQuiet"`
	ReconcileInProgress   bool   `gorm:"not null;default:false" json:"reconcileInProgress"`
	ReconcileProgressNote string `gorm:"size:512" json:"reconcileProgressNote,omitempty"`

	LastEODAt          *time.Time `json:"lastEodAt,omitempty"`
	LastReconcileAt    *time.Time `json:"lastReconcileAt,omitempty"`
	LastReconcileError *string    `gorm:"type:text" json:"lastReconcileError,omitempty"`
	StatisticsAsOf     *time.Time `json:"statisticsAsOf,omitempty"`

	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (UnitOperationalState) TableName() string {
	return "unit_operational_states"
}

// UnitOperationsPublic is embedded in unit GET for kiosk/staff clients.
type UnitOperationsPublic struct {
	KioskFrozen         bool   `json:"kioskFrozen"`
	CounterLoginBlocked bool   `json:"counterLoginBlocked"`
	Phase               string `json:"phase,omitempty"`
	// KioskIdOCR: plan includes 5.4 (ID document OCR on kiosk). UI also requires UnitConfig.kiosk.idOcrEnabled.
	KioskIdOCR bool `json:"kioskIdOcr,omitempty"`
	// KioskOfflineMode: plan includes 5.5 (read cache + outbox). UI also needs UnitConfig.kiosk.offlineModeEnabled.
	KioskOfflineMode bool `json:"kioskOfflineMode,omitempty"`
}
