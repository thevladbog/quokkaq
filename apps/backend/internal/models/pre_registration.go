package models

import (
	"time"
)

type PreRegistration struct {
	ID            string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID        string    `gorm:"not null" json:"unitId"`
	ServiceID     string    `gorm:"not null" json:"serviceId"`
	Date          string    `gorm:"not null" json:"date"` // YYYY-MM-DD
	Time          string    `gorm:"not null" json:"time"` // HH:MM
	Code          string    `gorm:"not null" json:"code"` // 6-digit unique code
	CustomerName  string    `gorm:"not null" json:"customerName"`
	CustomerPhone string    `gorm:"not null" json:"customerPhone"`
	Comment       string    `json:"comment,omitempty"`
	Status        string    `gorm:"default:'created'" json:"status"` // created, canceled, ticket_issued, completed
	TicketID      *string   `json:"ticketId,omitempty"`
	CreatedAt     time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Unit    Unit    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"service,omitempty"`
	Ticket  *Ticket `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"ticket,omitempty"`
}
