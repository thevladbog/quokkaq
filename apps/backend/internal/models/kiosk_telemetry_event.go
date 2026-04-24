package models

import "time"

// KioskTelemetryEvent is a time-series sample from a kiosk (latency, heartbeat, or printer class).
// TicketID is nil for non-ticket device metrics.
type KioskTelemetryEvent struct {
	ID         string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID  string  `gorm:"index;not null" json:"companyId"`
	UnitID     string  `gorm:"index;not null" json:"unitId"`
	TerminalID *string `gorm:"" json:"terminalId,omitempty"`
	Kind       string  `gorm:"index;not null" json:"kind"`
	// Meta JSON: e.g. {"roundtripMs":42,"kioskAppVersion":"0.1.1","error":"..."} — short-lived diagnostic fields, no PII.
	Meta      []byte    `gorm:"type:jsonb" json:"meta,omitempty" swaggertype:"object"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (KioskTelemetryEvent) TableName() string {
	return "kiosk_telemetry_events"
}
