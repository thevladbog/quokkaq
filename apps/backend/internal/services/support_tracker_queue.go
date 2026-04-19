package services

import (
	"os"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// ResolveSupportTrackerQueue returns queue from deployment settings, else YANDEX_TRACKER_QUEUE.
func ResolveSupportTrackerQueue(settings *models.DeploymentSaaSSettings) string {
	if settings != nil {
		if q := strings.TrimSpace(settings.SupportTrackerQueue); q != "" {
			return q
		}
	}
	return strings.TrimSpace(os.Getenv("YANDEX_TRACKER_QUEUE"))
}
