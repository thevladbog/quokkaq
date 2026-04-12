package models

import (
	"time"
)

type Ticket struct {
	ID                string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	QueueNumber       string     `gorm:"not null" json:"queueNumber"`
	UnitID            string     `gorm:"not null" json:"unitId"`
	ServiceID         string     `gorm:"not null" json:"serviceId"`
	BookingID         *string    `json:"bookingId,omitempty"`
	CounterID         *string    `json:"counterId,omitempty"`
	PreRegistrationID *string    `json:"preRegistrationId,omitempty"`
	ClientID          *string    `json:"clientId,omitempty"`
	Status            string     `gorm:"default:'waiting'" json:"status"`
	Priority          int        `gorm:"default:0" json:"priority"`
	IsEOD             bool       `gorm:"default:false" json:"isEod"`
	TTSUrl            *string    `json:"ttsUrl,omitempty"` // URL to the generated TTS audio file
	CreatedAt         time.Time  `gorm:"default:now()" json:"createdAt"`
	CalledAt          *time.Time `json:"calledAt,omitempty"`
	ConfirmedAt       *time.Time `json:"confirmedAt,omitempty"`
	CompletedAt       *time.Time `json:"completedAt,omitempty"`
	LastCalledAt      *time.Time `json:"lastCalledAt,omitempty"`
	MaxWaitingTime    *int       `json:"maxWaitingTime,omitempty"` // Snapshot from Service at creation
	OperatorComment   *string    `gorm:"type:text" json:"operatorComment,omitempty"`

	// Relations
	Unit    Unit     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service  `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"service,omitempty"`
	Booking *Booking `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"booking,omitempty"`
	Counter *Counter `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"counter,omitempty"`
	// No DB FK: avoids AutoMigrate cycle with pre_registrations.ticket_id → tickets.id
	PreRegistration *PreRegistration `gorm:"foreignKey:PreRegistrationID;references:ID;constraint:false" json:"preRegistration,omitempty"`
	Client          *UnitClient      `gorm:"foreignKey:ClientID,UnitID;references:ID,UnitID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"client,omitempty"`
	Histories       []TicketHistory  `gorm:"foreignKey:TicketID" json:"-"`
}

type TicketHistory struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	TicketID  string    `gorm:"not null" json:"ticketId"`
	Action    string    `gorm:"not null" json:"action"`
	UserID    *string   `json:"userId,omitempty"`
	Payload   []byte    `gorm:"type:jsonb" json:"payload,omitempty"`
	CreatedAt time.Time `gorm:"default:now()" json:"createdAt"`

	Ticket Ticket `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

type TicketNumberSequence struct {
	ID         string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID     string `gorm:"not null" json:"unitId"`
	ServiceID  string `gorm:"not null" json:"serviceId"`
	Date       string `gorm:"not null" json:"date"`
	LastNumber int    `gorm:"default:0" json:"lastNumber"`

	Unit    Unit    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
