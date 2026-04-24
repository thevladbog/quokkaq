package models

import (
	"time"
)

// ClonePreRegistration returns a deep copy of pointer fields for update/calendar diff logic.
func ClonePreRegistration(p *PreRegistration) *PreRegistration {
	if p == nil {
		return nil
	}
	c := *p
	if p.ExternalEventHref != nil {
		x := *p.ExternalEventHref
		c.ExternalEventHref = &x
	}
	if p.ExternalEventETag != nil {
		x := *p.ExternalEventETag
		c.ExternalEventETag = &x
	}
	if p.CalendarIntegrationID != nil {
		x := *p.CalendarIntegrationID
		c.CalendarIntegrationID = &x
	}
	if p.TicketID != nil {
		x := *p.TicketID
		c.TicketID = &x
	}
	return &c
}

type PreRegistration struct {
	ID                string  `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID            string  `gorm:"not null" json:"unitId"`
	ServiceID         string  `gorm:"not null" json:"serviceId"`
	Date              string  `gorm:"not null" json:"date"` // YYYY-MM-DD
	Time              string  `gorm:"not null" json:"time"` // HH:MM
	Code              string  `gorm:"not null" json:"code"` // 6-digit unique code
	CustomerFirstName string  `gorm:"not null" json:"customerFirstName"`
	CustomerLastName  string  `gorm:"not null" json:"customerLastName"`
	CustomerPhone     string  `gorm:"not null" json:"customerPhone"`
	Comment           string  `json:"comment,omitempty"`
	Status            string  `gorm:"default:'created'" json:"status"` // created, canceled, ticket_issued, completed
	TicketID          *string `json:"ticketId,omitempty"`
	// Calendar (CalDAV) mirror: booking is tied to a specific event resource.
	ExternalEventHref     *string   `gorm:"column:external_event_href" json:"externalEventHref,omitempty"`
	ExternalEventETag     *string   `gorm:"column:external_event_etag" json:"externalEventEtag,omitempty"`
	CalendarIntegrationID *string   `gorm:"column:calendar_integration_id" json:"calendarIntegrationId,omitempty"`
	CreatedAt             time.Time `gorm:"default:now()" json:"createdAt"`
	UpdatedAt             time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Unit    Unit    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Service Service `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"service,omitempty"`
	Ticket  *Ticket `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"ticket,omitempty"`
}

// PreRegistrationCreateRequest is the JSON body for creating a pre-registration (server sets id, code, status, timestamps).
type PreRegistrationCreateRequest struct {
	ServiceID         string `json:"serviceId"`
	Date              string `json:"date"`
	Time              string `json:"time"`
	CustomerFirstName string `json:"customerFirstName"`
	CustomerLastName  string `json:"customerLastName"`
	CustomerPhone     string `json:"customerPhone"`
	Comment           string `json:"comment,omitempty"`
	// ExternalEventHref is required for units with calendar integration (identifies the CalDAV resource).
	ExternalEventHref string `json:"externalEventHref,omitempty"`
	ExternalEventEtag string `json:"externalEventEtag,omitempty"`
	// CalendarIntegrationID identifies which calendar connection to use when the unit has multiple.
	CalendarIntegrationID string `json:"calendarIntegrationId,omitempty"`
}

// PreRegistrationUpdateRequest is the JSON body for updating an existing pre-registration.
type PreRegistrationUpdateRequest struct {
	ServiceID         string `json:"serviceId"`
	Date              string `json:"date"`
	Time              string `json:"time"`
	CustomerFirstName string `json:"customerFirstName"`
	CustomerLastName  string `json:"customerLastName"`
	CustomerPhone     string `json:"customerPhone"`
	Comment           string `json:"comment,omitempty"`
	// Status optional; only "canceled" is accepted to cancel an active pre-registration.
	Status string `json:"status,omitempty" enums:"canceled" example:"canceled"`
	// When rescheduling with calendar integration, provide the new CalDAV slot (same as create).
	ExternalEventHref     string `json:"externalEventHref,omitempty"`
	ExternalEventEtag     string `json:"externalEventEtag,omitempty"`
	CalendarIntegrationID string `json:"calendarIntegrationId,omitempty"`
}

// PreRegistrationCodeRequest is the JSON body for kiosk validate and redeem endpoints.
type PreRegistrationCodeRequest struct {
	Code string `json:"code"`
}

// KioskPhoneLookupStartRequest starts SMS verification for “find my booking by phone” on the kiosk.
type KioskPhoneLookupStartRequest struct {
	Phone string `json:"phone"`
}

// KioskPhoneLookupStartResponse is returned with a short-lived session id; SMS carries the 6-digit code.
type KioskPhoneLookupStartResponse struct {
	SessionID string `json:"sessionId"`
}

// KioskPhoneLookupVerifyRequest completes OTP; returns a lookupToken for listing and redeeming.
type KioskPhoneLookupVerifyRequest struct {
	SessionID string `json:"sessionId"`
	Code      string `json:"code"`
}

// KioskPhoneLookupVerifyResponse carries an opaque token for subsequent public GET/POSTs.
type KioskPhoneLookupVerifyResponse struct {
	LookupToken string `json:"lookupToken"`
}

// KioskPhoneRedeemRequest redeems a booking after a verified Kiosk phone lookup.
type KioskPhoneRedeemRequest struct {
	LookupToken       string `json:"lookupToken"`
	PreRegistrationID string `json:"preRegistrationId"`
}

// KioskPrResolveResponse is the JSON from resolving a signed prToken query.
type KioskPrResolveResponse struct {
	Code string `json:"code"`
	Date string `json:"date"`
}

// PreRegistrationBulkRemindResponse is the JSON from staff bulk appointment reminder.
type PreRegistrationBulkRemindResponse struct {
	Sent int    `json:"sent"`
	Date string `json:"date"`
}

// PreRegistrationRedeemResponse is returned by the redeem endpoint (HTTP 200 for both success and validation failure).
type PreRegistrationRedeemResponse struct {
	Success bool    `json:"success"`
	Ticket  *Ticket `json:"ticket,omitempty"`
	Message string  `json:"message,omitempty"`
}

// PreRegCalendarSlotItem is one bookable slot when the unit uses CalDAV-backed capacity.
type PreRegCalendarSlotItem struct {
	Time                  string `json:"time"`
	ExternalEventHref     string `json:"externalEventHref"`
	ExternalEventEtag     string `json:"externalEventEtag,omitempty"`
	CalendarIntegrationID string `json:"calendarIntegrationId"`
	IntegrationLabel      string `json:"integrationLabel,omitempty"`
}
