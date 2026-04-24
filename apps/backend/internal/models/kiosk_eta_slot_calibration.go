package models

import "time"

// KioskETASlotCalibration stores p50/p90 wait (seconds) by unit × service × local DOW × hour.
type KioskETASlotCalibration struct {
	ID         string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID     string `gorm:"not null;uniqueIndex:ux_kiosk_eta_slot" json:"unitId"`
	ServiceID  string `gorm:"not null;uniqueIndex:ux_kiosk_eta_slot" json:"serviceId"`
	DayOfWeek  int16  `gorm:"not null;uniqueIndex:ux_kiosk_eta_slot" json:"dayOfWeek"` // 0=Sun .. 6=Sat
	Hour       int16  `gorm:"not null;uniqueIndex:ux_kiosk_eta_slot" json:"hour"`
	P50WaitSec int    `gorm:"not null" json:"p50WaitSec"`
	P90WaitSec int    `gorm:"not null" json:"p90WaitSec"`
	// P95WaitSec is 95th percentile of historical wait in this slot (5.2 smart ETA).
	P95WaitSec int       `gorm:"not null" json:"p95WaitSec"`
	SampleN    int       `gorm:"not null" json:"sampleN"`
	UpdatedAt  time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (KioskETASlotCalibration) TableName() string { return "kiosk_eta_slot_calibration" }
