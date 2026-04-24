package models

import "time"

// KioskTicketIdempotency links an Idempotency-Key header to a created ticket (5.5 offline sync).
type KioskTicketIdempotency struct {
	ID                 string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID             string    `gorm:"not null;uniqueIndex:ux_kiosk_idem" json:"unitId"`
	IdempotencyKey     string    `gorm:"not null;uniqueIndex:ux_kiosk_idem" json:"idempotencyKey"`
	TicketID           string    `gorm:"index;not null" json:"ticketId"`
	TerminalOrClientID *string   `gorm:"" json:"terminalOrClientId,omitempty"`
	CreatedAt          time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (KioskTicketIdempotency) TableName() string { return "kiosk_ticket_idempotency" }
