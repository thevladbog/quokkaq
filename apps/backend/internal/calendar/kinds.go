// Package calendar documents supported third-party calendar integration kinds for units.
package calendar

import "quokkaq-go-backend/internal/models"

// SupportedKinds lists values accepted for UnitCalendarIntegration.Kind in the product API.
func SupportedKinds() []string {
	return []string{
		models.CalendarIntegrationKindYandexCalDAV,
		models.CalendarIntegrationKindGoogleCalDAV,
		models.CalendarIntegrationKindMicrosoftGraph,
	}
}

// KindDescriptions maps kind strings to short operator-facing descriptions.
var KindDescriptions = map[string]string{
	models.CalendarIntegrationKindYandexCalDAV:   "Yandex Calendar (CalDAV app password)",
	models.CalendarIntegrationKindGoogleCalDAV:   "Google Calendar (OAuth + CalDAV)",
	models.CalendarIntegrationKindMicrosoftGraph: "Microsoft 365 / Outlook (OAuth; slot sync via Graph API is planned — use Google or Yandex for live CalDAV import today)",
}
