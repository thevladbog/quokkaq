package services

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"

	"gorm.io/gorm"
)

// AnalyticsService tracks events and usage for billing and analytics
type AnalyticsService interface {
	TrackEvent(companyID, event string, properties map[string]interface{}) error
	TrackTicketCreated(companyID string) error
	TrackUserInvited(companyID string) error
	TrackUnitCreated(companyID string) error
	TrackServiceConfigured(companyID string) error
	TrackCounterOpened(companyID string) error
	TrackBookingMade(companyID string) error
}

type analyticsService struct {
	quotaService QuotaService
}

func NewAnalyticsService(quotaService QuotaService) AnalyticsService {
	return &analyticsService{
		quotaService: quotaService,
	}
}

func (s *analyticsService) TrackEvent(companyID, event string, properties map[string]interface{}) error {
	// In a real implementation, you might want to:
	// 1. Send to external analytics platform (Mixpanel, Amplitude, etc.)
	// 2. Store in a separate analytics table
	// 3. Trigger webhooks
	
	// For now, we'll just log usage for quota tracking
	return nil
}

func (s *analyticsService) TrackTicketCreated(companyID string) error {
	if err := s.quotaService.IncrementUsage(companyID, "tickets_per_month", 1); err != nil {
		return err
	}
	return s.TrackEvent(companyID, "ticket_created", nil)
}

func (s *analyticsService) TrackUserInvited(companyID string) error {
	return s.TrackEvent(companyID, "user_invited", nil)
}

func (s *analyticsService) TrackUnitCreated(companyID string) error {
	return s.TrackEvent(companyID, "unit_created", nil)
}

func (s *analyticsService) TrackServiceConfigured(companyID string) error {
	return s.TrackEvent(companyID, "service_configured", nil)
}

func (s *analyticsService) TrackCounterOpened(companyID string) error {
	return s.TrackEvent(companyID, "counter_opened", nil)
}

func (s *analyticsService) TrackBookingMade(companyID string) error {
	return s.TrackEvent(companyID, "booking_made", nil)
}

// GetCompanyIDForUnit retrieves the company ID for a given unit
func GetCompanyIDForUnit(unitID string) (string, error) {
	db := database.DB
	var unit models.Unit
	if err := db.Select("company_id").Where("id = ?", unitID).First(&unit).Error; err != nil {
		return "", err
	}
	return unit.CompanyID, nil
}

// SyncCurrentUsageToRecords creates usage records for current state
// Useful for initial data migration or periodic snapshots
func SyncCurrentUsageToRecords(companyID string) error {
	db := database.DB
	now := time.Now()
	billingMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	quotaService := NewQuotaService()

	// Metrics to track
	metrics := []string{"units", "users", "services", "counters"}

	for _, metric := range metrics {
		current, err := quotaService.GetCurrentUsage(companyID, metric)
		if err != nil {
			continue
		}

		// Check if record already exists for this month
		var existingRecord models.UsageRecord
		err = db.Where("company_id = ? AND metric_type = ? AND billing_month = ?",
			companyID, metric, billingMonth).
			First(&existingRecord).Error

		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			record := &models.UsageRecord{
				CompanyID:    companyID,
				MetricType:   metric,
				Value:        current,
				Timestamp:    now,
				BillingMonth: billingMonth,
			}
			if err := db.Create(record).Error; err != nil {
				return err
			}
			continue
		}

		existingRecord.Value = current
		existingRecord.Timestamp = now
		if err := db.Save(&existingRecord).Error; err != nil {
			return err
		}
	}

	return nil
}
