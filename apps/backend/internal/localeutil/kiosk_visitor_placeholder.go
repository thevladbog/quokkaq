package localeutil

import (
	"errors"
	"strings"
)

// ErrKioskVisitorLocaleInvalid is returned when visitorLocale is missing or not supported for kiosk placeholder names.
var ErrKioskVisitorLocaleInvalid = errors.New("visitorLocale must be en or ru when visitorPhone is set")

// UnknownVisitorPlaceholderNames returns first and last name for a new unit client created from kiosk phone identification.
func UnknownVisitorPlaceholderNames(locale string) (firstName, lastName string, err error) {
	switch strings.ToLower(strings.TrimSpace(locale)) {
	case "ru":
		return "Неизвестно", "Неизвестно", nil
	case "en":
		return "Unknown", "Unknown", nil
	default:
		return "", "", ErrKioskVisitorLocaleInvalid
	}
}
