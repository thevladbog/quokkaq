package repository

import (
	"errors"
	"time"

	"quokkaq-go-backend/internal/calendar/summary"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type CalendarIntegrationRepository struct{}

func NewCalendarIntegrationRepository() *CalendarIntegrationRepository {
	return &CalendarIntegrationRepository{}
}

// ListEnabled returns all integrations with CalDAV sync turned on.
func (r *CalendarIntegrationRepository) ListEnabled() ([]models.UnitCalendarIntegration, error) {
	var rows []models.UnitCalendarIntegration
	err := database.DB.Where("enabled = ?", true).Find(&rows).Error
	return rows, err
}

func (r *CalendarIntegrationRepository) GetByUnitID(unitID string) (*models.UnitCalendarIntegration, error) {
	var row models.UnitCalendarIntegration
	err := database.DB.Where("unit_id = ?", unitID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *CalendarIntegrationRepository) SaveIntegration(row *models.UnitCalendarIntegration) error {
	var existing models.UnitCalendarIntegration
	err := database.DB.Where("unit_id = ?", row.UnitID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return database.DB.Create(row).Error
	}
	if err != nil {
		return err
	}
	row.ID = existing.ID
	row.CreatedAt = existing.CreatedAt
	return database.DB.Save(row).Error
}

func (r *CalendarIntegrationRepository) UpdateSyncMeta(id string, lastSyncAt time.Time, syncErr string) error {
	return database.DB.Model(&models.UnitCalendarIntegration{}).Where("id = ?", id).Updates(map[string]interface{}{
		"last_sync_at":    lastSyncAt,
		"last_sync_error": syncErr,
	}).Error
}

func (r *CalendarIntegrationRepository) UpsertExternalSlot(row *models.CalendarExternalSlot) error {
	row.LastSeenAt = time.Now().UTC()
	var existing models.CalendarExternalSlot
	err := database.DB.Where("integration_id = ? AND href = ?", row.IntegrationID, row.Href).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return database.DB.Create(row).Error
	}
	if err != nil {
		return err
	}
	row.ID = existing.ID
	return database.DB.Save(row).Error
}

// DeleteSlotsNotSeenSince removes slot rows for an integration older than t (stale sync).
func (r *CalendarIntegrationRepository) DeleteSlotsNotSeenSince(integrationID string, t time.Time) error {
	return database.DB.Where("integration_id = ? AND last_seen_at < ?", integrationID, t).Delete(&models.CalendarExternalSlot{}).Error
}

func (r *CalendarIntegrationRepository) ListExternalSlotsForServiceDate(unitID, serviceID, localDate string, loc *time.Location) ([]models.CalendarExternalSlot, error) {
	// localDate YYYY-MM-DD — compare start_utc in that local day
	startDay, err := time.ParseInLocation("2006-01-02", localDate, loc)
	if err != nil {
		return nil, err
	}
	endDay := startDay.Add(24 * time.Hour)
	var rows []models.CalendarExternalSlot
	err = database.DB.Where("unit_id = ? AND service_id = ? AND start_utc >= ? AND start_utc < ? AND parsed_state = ?",
		unitID, serviceID, startDay.UTC(), endDay.UTC(), summary.StateFree).
		Order("start_utc").
		Find(&rows).Error
	return rows, err
}

func (r *CalendarIntegrationRepository) GetExternalSlotByHref(integrationID, href string) (*models.CalendarExternalSlot, error) {
	var row models.CalendarExternalSlot
	err := database.DB.Where("integration_id = ? AND href = ?", integrationID, href).First(&row).Error
	return &row, err
}

func (r *CalendarIntegrationRepository) CreateIncident(inc *models.CalendarSyncIncident) error {
	return database.DB.Create(inc).Error
}

func (r *CalendarIntegrationRepository) HasRecentIncident(unitID, typ, href string, since time.Time) (bool, error) {
	var n int64
	err := database.DB.Model(&models.CalendarSyncIncident{}).
		Where("unit_id = ? AND type = ? AND external_href = ? AND created_at >= ?", unitID, typ, href, since).
		Count(&n).Error
	return n > 0, err
}

func (r *CalendarIntegrationRepository) MarkIncidentEmailSent(id string) error {
	now := time.Now().UTC()
	return database.DB.Model(&models.CalendarSyncIncident{}).Where("id = ?", id).Update("email_sent_at", now).Error
}

// ListActivePreRegistrationsWithExternal returns non-canceled pre-regs that reference a calendar href.
func (r *CalendarIntegrationRepository) ListActivePreRegistrationsWithExternal(unitID string) ([]models.PreRegistration, error) {
	var rows []models.PreRegistration
	err := database.DB.Where("unit_id = ? AND external_event_href IS NOT NULL AND external_event_href <> '' AND status IN ?", unitID, []string{"created", "ticket_issued"}).
		Find(&rows).Error
	return rows, err
}

func (r *CalendarIntegrationRepository) WithTx(fn func(tx *gorm.DB) error) error {
	return database.DB.Transaction(fn)
}
