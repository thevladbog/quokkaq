package services

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestParseSupportReportCreatePlatform_normalizes(t *testing.T) {
	cases := []struct {
		env  string
		want string
	}{
		{"yandex_tracker", models.TicketBackendYandexTracker},
		{"YANDEX_TRACKER", models.TicketBackendYandexTracker},
		{"yandex-tracker", models.TicketBackendYandexTracker},
		{"\"yandex_tracker\"", models.TicketBackendYandexTracker},
		{"\ufeffplane", models.TicketBackendPlane},
		{"", SupportReportPlatformNone},
		{"unknown", SupportReportPlatformNone},
	}
	for _, tc := range cases {
		t.Run(tc.env, func(t *testing.T) {
			t.Setenv("SUPPORT_REPORT_PLATFORM", tc.env)
			if got := ParseSupportReportCreatePlatform(); got != tc.want {
				t.Fatalf("ParseSupportReportCreatePlatform(): got %q want %q", got, tc.want)
			}
		})
	}
}
