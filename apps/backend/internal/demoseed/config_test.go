package demoseed

import (
	"testing"
)

func TestLoadConfig_defaults(t *testing.T) {
	t.Setenv("DEMO_HISTORY_DAYS", "")
	t.Setenv("DEMO_ADMIN_EMAIL", "")
	t.Setenv("DEMO_ADMIN_PASSWORD", "")
	t.Setenv("DEMO_OPERATOR_EMAIL", "")
	t.Setenv("DEMO_OPERATOR_PASSWORD", "")
	t.Setenv("DEMO_UNIT_TIMEZONE", "UTC")

	c := LoadConfig()
	if c.HistoryDays != defaultHistoryDays {
		t.Fatalf("history days: got %d want %d", c.HistoryDays, defaultHistoryDays)
	}
	if c.AdminEmail != defaultAdminEmail {
		t.Fatalf("admin email default")
	}
	if c.AdminPass != "demo-admin-change-me" {
		t.Fatalf("admin pass default")
	}
	if c.UnitTimezone != "UTC" {
		t.Fatalf("timezone: %s", c.UnitTimezone)
	}
}

func TestLoadConfig_historyDaysClamp(t *testing.T) {
	t.Setenv("DEMO_HISTORY_DAYS", "500")
	t.Setenv("DEMO_UNIT_TIMEZONE", "UTC")
	c := LoadConfig()
	if c.HistoryDays != defaultHistoryDays {
		t.Fatalf("invalid large days should fall back to default, got %d", c.HistoryDays)
	}
	t.Setenv("DEMO_HISTORY_DAYS", "14")
	c = LoadConfig()
	if c.HistoryDays != 14 {
		t.Fatalf("got %d", c.HistoryDays)
	}
}

func TestLoadConfig_customPassword(t *testing.T) {
	t.Setenv("DEMO_ADMIN_PASSWORD", "secret-pass")
	t.Setenv("DEMO_UNIT_TIMEZONE", "UTC")
	c := LoadConfig()
	if c.AdminPass != "secret-pass" {
		t.Fatalf("custom password not picked up")
	}
}
