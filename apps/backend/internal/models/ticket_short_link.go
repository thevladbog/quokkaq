package models

import "time"

// TicketShortLink maps a short public code to a ticket and locale (for compact SMS/QR).
type TicketShortLink struct {
	// Code is an opaque public identifier (alphanumeric, length ~12).
	Code      string    `gorm:"primaryKey;size:16" json:"code"`
	TicketID  string    `gorm:"index;not null" json:"ticketId"`
	CompanyID string    `gorm:"index;not null" json:"companyId"`
	Locale    string    `gorm:"size:8;not null" json:"locale"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (TicketShortLink) TableName() string {
	return "ticket_short_links"
}
