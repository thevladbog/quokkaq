package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CalendarIntegrationKind identifies the provider implementation (extensible).
const CalendarIntegrationKindYandexCalDAV = "yandex_caldav"

// UnitCalendarIntegration stores CalDAV credentials and calendar path per unit.
// Multiple rows per unit_id are allowed (max enforced in service). App password is encrypted (AES-GCM, same as SSO).
type UnitCalendarIntegration struct {
	ID                   string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID               string     `gorm:"not null;index:idx_unit_calendar_integrations_unit_id" json:"unitId"`
	Kind                 string     `gorm:"not null;default:'yandex_caldav'" json:"kind"`
	DisplayName          string     `gorm:"not null;default:''" json:"displayName,omitempty"`
	Enabled              bool       `gorm:"default:false" json:"enabled"`
	CaldavBaseURL        string     `gorm:"not null;default:'https://caldav.yandex.ru'" json:"caldavBaseUrl"`
	CalendarPath         string     `gorm:"not null" json:"calendarPath"` // e.g. /calendars/xxx@yandex.ru/events-xxx/
	Username             string     `gorm:"not null" json:"username"`     // full Yandex login email
	AppPasswordEncrypted string     `gorm:"type:text;not null" json:"-"`
	Timezone             string     `gorm:"not null;default:'Europe/Moscow'" json:"timezone"`
	AdminNotifyEmails    string     `gorm:"type:text" json:"adminNotifyEmails,omitempty"` // comma-separated
	LastSyncAt           *time.Time `json:"lastSyncAt,omitempty"`
	LastSyncError        string     `gorm:"type:text" json:"lastSyncError,omitempty"`
	CreatedAt            time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt            time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

// BeforeCreate assigns a UUID when ID is empty (PostgreSQL can also use gen_random_uuid() default).
func (u *UnitCalendarIntegration) BeforeCreate(_ *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}

// CalendarExternalSlot is a cached row for one VEVENT (identified by href) imported from CalDAV.
type CalendarExternalSlot struct {
	ID            string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID        string    `gorm:"not null;index" json:"unitId"`
	IntegrationID string    `gorm:"not null;index;uniqueIndex:idx_cal_slot_int_href,priority:1" json:"integrationId"`
	Href          string    `gorm:"not null;uniqueIndex:idx_cal_slot_int_href,priority:2" json:"href"`
	ICalUID       string    `gorm:"not null;index" json:"iCalUid"`
	RecurrenceID  *string   `json:"recurrenceId,omitempty"`
	ETag          string    `gorm:"type:text" json:"eTag,omitempty"`
	StartUTC      time.Time `gorm:"not null;index" json:"startUtc"`
	EndUTC        time.Time `gorm:"not null" json:"endUtc"`
	Summary       string    `gorm:"type:text" json:"summary"`
	ParsedState   string    `gorm:"not null" json:"parsedState"` // free, booked, ticket_waiting, unknown
	ServiceID     *string   `gorm:"index" json:"serviceId,omitempty"`
	PreRegID      *string   `gorm:"index" json:"preRegistrationId,omitempty"`
	LastSeenAt    time.Time `gorm:"not null" json:"lastSeenAt"`

	Unit        Unit                    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Integration UnitCalendarIntegration `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

// CalendarSyncIncident records orphan / drift situations for admins and email dedup.
type CalendarSyncIncident struct {
	ID                string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID            string     `gorm:"not null;index" json:"unitId"`
	Type              string     `gorm:"not null;index" json:"type"` // orphan_booking_missing_event, parse_error, ...
	PreRegistrationID *string    `gorm:"index" json:"preRegistrationId,omitempty"`
	ExternalHref      string     `gorm:"type:text" json:"externalHref,omitempty"`
	Detail            string     `gorm:"type:text" json:"detail,omitempty"`
	EmailSentAt       *time.Time `json:"emailSentAt,omitempty"`
	CreatedAt         time.Time  `gorm:"default:now()" json:"createdAt"`

	Unit Unit `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
