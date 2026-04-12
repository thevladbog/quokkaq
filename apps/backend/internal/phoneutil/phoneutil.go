package phoneutil

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/nyaruka/phonenumbers"
)

// ErrInvalidPhone is returned when the number cannot be parsed or is not a valid E.164 number.
var ErrInvalidPhone = errors.New("invalid phone number")

var (
	defaultRegionOnce sync.Once
	defaultRegion     string
)

// DefaultRegion returns PHONE_DEFAULT_REGION or "RU" for parsing national-format numbers.
// The value is read from the environment once on first use.
func DefaultRegion() string {
	defaultRegionOnce.Do(func() {
		r := strings.TrimSpace(os.Getenv("PHONE_DEFAULT_REGION"))
		if r == "" {
			defaultRegion = "RU"
			return
		}
		defaultRegion = strings.ToUpper(r)
	})
	return defaultRegion
}

// ParseAndNormalize parses input and returns E.164 (e.g. +79001234567).
func ParseAndNormalize(input string, defaultRegion string) (string, error) {
	s := strings.TrimSpace(input)
	if s == "" {
		return "", ErrInvalidPhone
	}
	if defaultRegion == "" {
		defaultRegion = DefaultRegion()
	}
	num, err := phonenumbers.Parse(s, defaultRegion)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalidPhone, err)
	}
	if !phonenumbers.IsValidNumber(num) {
		return "", ErrInvalidPhone
	}
	return phonenumbers.Format(num, phonenumbers.E164), nil
}

// TryParse returns (e164, true) if input is a valid phone, or ("", false) if not parseable as phone.
func TryParse(input string, defaultRegion string) (string, bool) {
	e164, err := ParseAndNormalize(input, defaultRegion)
	if err != nil {
		return "", false
	}
	return e164, true
}
