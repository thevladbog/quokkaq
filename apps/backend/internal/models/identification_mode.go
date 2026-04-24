package models

// IdentificationMode values for Service.IdentificationMode (kiosk / employee flows).
const (
	IdentificationModeNone  = "none"
	IdentificationModePhone = "phone"
	IdentificationModeQR    = "qr"
	IdentificationModeLogin = "login"
	IdentificationModeBadge = "badge"
)

// IsValidIdentificationMode returns true for known non-empty mode strings.
func IsValidIdentificationMode(m string) bool {
	switch m {
	case IdentificationModeNone, IdentificationModePhone, IdentificationModeQR, IdentificationModeLogin, IdentificationModeBadge:
		return true
	default:
		return false
	}
}
