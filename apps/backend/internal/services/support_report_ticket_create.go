package services

// SupportReportTicketCreateExtras carries optional metadata for external ticketing (used by Yandex Tracker local fields; Plane ignores).
type SupportReportTicketCreateExtras struct {
	// ApiAccessToTicket is comma-separated QuokkaQ user ids → Tracker field apiAccessToTheTicket.
	ApiAccessToTicket string
	// ApplicantsEmail is the support report author's email → Tracker field applicantsEmailApi.
	ApplicantsEmail string
	// CompanyTrackerLabel is "<tenant name> (<short legal name>)" for filtering → Tracker field company.
	CompanyTrackerLabel string
}
