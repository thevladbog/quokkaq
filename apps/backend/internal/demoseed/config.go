package demoseed

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config drives demo dataset generation (anchor date and horizon).
type Config struct {
	Anchor        time.Time
	HistoryDays   int
	AdminEmail    string
	AdminPass     string
	OperatorEmail string
	OperatorPass  string
	UnitTimezone  string
}

const (
	defaultHistoryDays   = 90
	defaultAdminEmail    = "demo-admin@demo.quokkaq.local"
	defaultOperatorEmail = "demo-operator@demo.quokkaq.local"
	defaultTimezone      = "Europe/Moscow"
)

// LoadConfig reads DEMO_* environment variables (same process as other seed CLIs).
func LoadConfig() Config {
	days := defaultHistoryDays
	if v := strings.TrimSpace(os.Getenv("DEMO_HISTORY_DAYS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}
	adminEmail := strings.TrimSpace(os.Getenv("DEMO_ADMIN_EMAIL"))
	if adminEmail == "" {
		adminEmail = defaultAdminEmail
	}
	adminPass := strings.TrimSpace(os.Getenv("DEMO_ADMIN_PASSWORD"))
	if adminPass == "" {
		adminPass = "demo-admin-change-me"
	}
	opEmail := strings.TrimSpace(os.Getenv("DEMO_OPERATOR_EMAIL"))
	if opEmail == "" {
		opEmail = defaultOperatorEmail
	}
	opPass := strings.TrimSpace(os.Getenv("DEMO_OPERATOR_PASSWORD"))
	if opPass == "" {
		opPass = "demo-operator-change-me"
	}
	tz := strings.TrimSpace(os.Getenv("DEMO_UNIT_TIMEZONE"))
	if tz == "" {
		tz = defaultTimezone
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
		tz = "UTC"
	}
	anchor := time.Now().In(loc)
	return Config{
		Anchor:        anchor,
		HistoryDays:   days,
		AdminEmail:    adminEmail,
		AdminPass:     adminPass,
		OperatorEmail: opEmail,
		OperatorPass:  opPass,
		UnitTimezone:  tz,
	}
}
