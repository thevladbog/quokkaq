package services

import (
	"context"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// calendarSyncDriver pulls external calendar state for one integration row.
type calendarSyncDriver interface {
	Sync(ctx context.Context, svc *CalendarIntegrationService, integ *models.UnitCalendarIntegration) error
}

type calDAVFamilyDriver struct{}

func (calDAVFamilyDriver) Sync(ctx context.Context, svc *CalendarIntegrationService, integ *models.UnitCalendarIntegration) error {
	return svc.syncCalDAVStyle(ctx, integ)
}

type microsoftGraphCalendarDriver struct{}

func (microsoftGraphCalendarDriver) Sync(ctx context.Context, svc *CalendarIntegrationService, integ *models.UnitCalendarIntegration) error {
	return svc.syncMicrosoftGraphCalendar(ctx, integ)
}

func calendarSyncDriverFor(kind string) calendarSyncDriver {
	if strings.TrimSpace(kind) == models.CalendarIntegrationKindMicrosoftGraph {
		return microsoftGraphCalendarDriver{}
	}
	return calDAVFamilyDriver{}
}
