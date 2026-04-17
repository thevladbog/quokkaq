package services

import (
	"os"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// SupportReportPlatformNone means SUPPORT_REPORT_PLATFORM is unset or not recognized.
const SupportReportPlatformNone = "none"

func normalizeSupportReportPlatformEnv(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "\ufeff")
	s = strings.Trim(s, `"'`)
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "-", "_")
	return strings.TrimSpace(s)
}

// ParseSupportReportCreatePlatform reads SUPPORT_REPORT_PLATFORM (plane | yandex_tracker | none).
// Leading BOM / surrounding quotes and hyphens instead of underscores are tolerated (common .env editor issues).
func ParseSupportReportCreatePlatform() string {
	v := normalizeSupportReportPlatformEnv(os.Getenv("SUPPORT_REPORT_PLATFORM"))
	switch v {
	case models.TicketBackendPlane:
		return models.TicketBackendPlane
	case models.TicketBackendYandexTracker:
		return models.TicketBackendYandexTracker
	default:
		return SupportReportPlatformNone
	}
}

// SupportTicketCreateEnvHint returns a short operator-facing hint when Create would fail with
// ErrSupportTicketIntegrationNotConfigured (no secrets). Empty if the selected backend looks ready.
func SupportTicketCreateEnvHint() string {
	switch ParseSupportReportCreatePlatform() {
	case models.TicketBackendYandexTracker:
		return strings.TrimSpace(NewYandexTrackerClientFromEnv().IntegrationDisabledReason())
	case models.TicketBackendPlane:
		return strings.TrimSpace(NewPlaneClientFromEnv().IntegrationDisabledReason())
	default:
		return `set SUPPORT_REPORT_PLATFORM to yandex_tracker or plane (see apps/backend/.env.example), then restart the API`
	}
}
