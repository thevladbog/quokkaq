package models

import (
	"encoding/json"
	"time"
)

// ClientVisitTransferEvent is one transfer step in a visit timeline (hydrated from ticket_histories, not stored on tickets).
type ClientVisitTransferEvent struct {
	At                time.Time `json:"at"`
	TransferKind      string    `json:"transferKind,omitempty"`
	FromServiceName   string    `json:"fromServiceName,omitempty"`
	FromServiceNameRu string    `json:"fromServiceNameRu,omitempty"`
	FromServiceNameEn string    `json:"fromServiceNameEn,omitempty"`
	ToServiceName     string    `json:"toServiceName,omitempty"`
	ToServiceNameRu   string    `json:"toServiceNameRu,omitempty"`
	ToServiceNameEn   string    `json:"toServiceNameEn,omitempty"`
	FromCounterName   string    `json:"fromCounterName,omitempty"`
	ToCounterName     string    `json:"toCounterName,omitempty"`
	FromZoneLabel     string    `json:"fromZoneLabel,omitempty"`
	ToZoneLabel       string    `json:"toZoneLabel,omitempty"`
}

type Ticket struct {
	ID          string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	QueueNumber string `gorm:"not null" json:"queueNumber"`
	UnitID      string `gorm:"not null" json:"unitId"`
	// VisitorToken is a secret UUID issued at ticket creation. Visitor endpoints require it in
	// the X-Visitor-Token header to prevent IDOR on cancel and phone opt-in.
	VisitorToken string `gorm:"not null;default:gen_random_uuid()" json:"visitorToken,omitempty"`
	// ServiceZoneID: waiting pool within the subdivision; NULL = subdivision-wide pool.
	ServiceZoneID     *string `json:"serviceZoneId,omitempty" gorm:"column:service_zone_id"`
	ServiceID         string  `gorm:"not null" json:"serviceId"`
	BookingID         *string `json:"bookingId,omitempty"`
	CounterID         *string `json:"counterId,omitempty"`
	PreRegistrationID *string `json:"preRegistrationId,omitempty"`
	// KioskIdentifiedUserID is set when the ticket was issued after kiosk employee identification (badge / login) matched a user in the tenant.
	KioskIdentifiedUserID *string `gorm:"column:kiosk_identified_user_id" json:"kioskIdentifiedUserId,omitempty"`
	// DocumentsData stores kiosk-provided key/value (document OCR, custom fields). PII: see OpenAPI / DWH policy; staff access requires permission tickets.user_data.read.
	// - documentsData is cleared by a scheduled job when documentsDataExpiresAt is in the past (sensitive or document mode with retention).
	// - documentsDataExpiresAt: set at creation for document/sensitive custom flows; may be null for non-sensitive custom data (no auto-expiry from cron).
	DocumentsData          json.RawMessage `gorm:"type:jsonb;column:documents_data" json:"documentsData,omitempty" swaggertype:"object"`
	DocumentsDataExpiresAt *time.Time      `gorm:"column:documents_data_expires_at" json:"documentsDataExpiresAt,omitempty"`
	ClientID               *string         `json:"clientId,omitempty"`
	Status                 string          `gorm:"default:'waiting'" json:"status"`
	Priority               int             `gorm:"default:0" json:"priority"`
	IsEOD                  bool            `gorm:"default:false" json:"isEod"`
	// IsCredit marks a ticket issued when the monthly tickets_per_month quota was exhausted but
	// the working day (EOD) was still open. Credit tickets are counted against the next billing period.
	IsCredit bool    `gorm:"default:false;column:is_credit" json:"isCredit"`
	TTSUrl   *string `json:"ttsUrl,omitempty"` // URL to the generated TTS audio file
	// VisitorWelcomeNotifiedAt is set when the first welcome notification pipeline was claimed for this ticket.
	VisitorWelcomeNotifiedAt *time.Time `gorm:"column:visitor_welcome_notified_at" json:"visitorWelcomeNotifiedAt,omitempty"`
	VisitorNotificationEmail *string    `gorm:"column:visitor_notification_email" json:"visitorNotificationEmail,omitempty"`
	CreatedAt                time.Time  `gorm:"default:now()" json:"createdAt"`
	CalledAt                 *time.Time `json:"calledAt,omitempty"`
	ConfirmedAt              *time.Time `json:"confirmedAt,omitempty"`
	CompletedAt              *time.Time `json:"completedAt,omitempty"`
	LastCalledAt             *time.Time `json:"lastCalledAt,omitempty"`
	MaxWaitingTime           *int       `json:"maxWaitingTime,omitempty"` // Snapshot from Service at creation
	MaxServiceTime           *int       `json:"maxServiceTime,omitempty"` // Snapshot from Service at in_service; cleared on transfer/return
	// ServedByUserID is set when a ticket is called/picked; records the operator (counter.AssignedTo at call time).
	ServedByUserID  *string `gorm:"column:served_by_user_id" json:"servedByUserId,omitempty"`
	OperatorComment *string `gorm:"type:text" json:"operatorComment,omitempty"`
	// ServedByName is hydrated for client visit lists from ticket_histories (not stored on tickets).
	ServedByName *string `json:"servedByName,omitempty" gorm:"-"`
	// TransferTrail lists ticket.transferred events in chronological order (client visit APIs only).
	TransferTrail []ClientVisitTransferEvent `json:"transferTrail,omitempty" gorm:"-"`
	// QueuePosition is the 1-based position in the waiting queue (computed on-the-fly, not stored).
	QueuePosition *int `json:"queuePosition,omitempty" gorm:"-"`
	// EstimatedWaitSeconds is the estimated seconds until this ticket is called (computed on-the-fly).
	EstimatedWaitSeconds *int `json:"estimatedWaitSeconds,omitempty" gorm:"-"`
	// ServiceZoneName is the display name of the service zone unit when ServiceZoneID is set (hydrated, not stored).
	ServiceZoneName *string `json:"serviceZoneName,omitempty" gorm:"-"`

	// Relations
	Unit    Unit     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service  `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"service,omitempty"`
	Booking *Booking `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"booking,omitempty"`
	Counter *Counter `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"counter,omitempty"`
	// No DB FK: avoids AutoMigrate cycle with pre_registrations.ticket_id → tickets.id
	PreRegistration *PreRegistration `gorm:"foreignKey:PreRegistrationID;references:ID;constraint:false" json:"preRegistration,omitempty"`
	Client          *UnitClient      `gorm:"foreignKey:ClientID,UnitID;references:ID,UnitID;constraint:false" json:"client,omitempty"`
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
