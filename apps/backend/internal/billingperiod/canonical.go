package billingperiod

import (
	"errors"
	"strings"
)

// ErrInvalidBillingPeriod is returned when billingPeriod is non-empty but not a supported value.
var ErrInvalidBillingPeriod = errors.New("billingPeriod must be month or annual")

// ParseOptional trims and lower-cases a client billing period. Empty input returns ("", nil).
// Non-empty values must be a supported alias; otherwise it returns a non-nil error.
func ParseOptional(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "", nil
	}
	switch s {
	case "month", "monthly":
		return "month", nil
	case "annual", "yearly", "year":
		return "annual", nil
	default:
		return "", ErrInvalidBillingPeriod
	}
}

// ParseWithMonthDefault returns "month" for empty input, otherwise the same rules as ParseOptional.
func ParseWithMonthDefault(raw string) (string, error) {
	result, err := ParseOptional(raw)
	if err != nil {
		return "", err
	}
	if result == "" {
		return "month", nil
	}
	return result, nil
}
