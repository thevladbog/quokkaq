package models

import "time"

// QueueFunnelEvent records analytics for the public queue / kiosk / SMS funnel.
type QueueFunnelEvent struct {
	ID        string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string `gorm:"index;not null" json:"companyId"`
	UnitID    string `gorm:"index;not null" json:"unitId"`
	TicketID  string `gorm:"index" json:"ticketId,omitempty"`
	// Event: ticket_created, virtual_queue_join, welcome_sms_queued, welcome_email_queued, public_rate_limited, ...
	Event string `gorm:"not null;index" json:"event"`
	// Source: kiosk, virtual_queue, staff, pre_registration, system
	Source string `gorm:"" json:"source,omitempty"`
	Meta   []byte `gorm:"type:jsonb" json:"meta,omitempty" swaggertype:"object"`
	// SmsSource when relevant: platform | tenant
	SmsSource string    `gorm:"" json:"smsSource,omitempty"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (QueueFunnelEvent) TableName() string {
	return "queue_funnel_events"
}
