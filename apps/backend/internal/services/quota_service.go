package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"
)

// QuotaService manages resource quotas and usage tracking
type QuotaService interface {
	CheckQuota(companyID string, metric string) (bool, error)
	GetCurrentUsage(companyID string, metric string) (int, error)
	GetLimit(companyID string, metric string) (int, error)
	IncrementUsage(companyID string, metric string, delta int) error
	GetUsageMetrics(companyID string) (*UsageMetrics, error)
}

type quotaService struct{}

func NewQuotaService() QuotaService {
	return &quotaService{}
}

// UsageMetrics represents current usage across all metrics
type UsageMetrics struct {
	CurrentPeriod Period                    `json:"currentPeriod"`
	Metrics       map[string]UsageMetricInfo `json:"metrics"`
}

type Period struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

type UsageMetricInfo struct {
	Current int `json:"current"`
	Limit   int `json:"limit"`
}

// CheckQuota verifies if the company can perform an action based on their quota
func (s *quotaService) CheckQuota(companyID string, metric string) (bool, error) {
	currentUsage, err := s.GetCurrentUsage(companyID, metric)
	if err != nil {
		return false, err
	}

	limit, err := s.GetLimit(companyID, metric)
	if err != nil {
		return false, err
	}

	// -1 means unlimited
	if limit == -1 {
		return true, nil
	}

	return currentUsage < limit, nil
}

// GetCurrentUsage returns the current usage for a specific metric
func (s *quotaService) GetCurrentUsage(companyID string, metric string) (int, error) {
	db := database.DB

	switch metric {
	case "units":
		// Count units for this company
		var count int64
		if err := db.Model(&models.Unit{}).Where("company_id = ?", companyID).Count(&count).Error; err != nil {
			return 0, err
		}
		return int(count), nil

	case "users":
		// Count users associated with this company's units
		var count int64
		query := `
			SELECT COUNT(DISTINCT user_id) 
			FROM user_units 
			WHERE unit_id IN (SELECT id FROM units WHERE company_id = ?)
		`
		if err := db.Raw(query, companyID).Scan(&count).Error; err != nil {
			return 0, err
		}
		return int(count), nil

	case "tickets_per_month":
		// Sum usage_records for monthly ticket quota (canonical key tickets_per_month; legacy rows used tickets_created)
		now := time.Now()
		billingMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

		var sum int
		query := `
			SELECT COALESCE(SUM(value), 0) 
			FROM usage_records 
			WHERE company_id = ? AND metric_type IN ('tickets_per_month', 'tickets_created') AND billing_month = ?
		`
		if err := db.Raw(query, companyID, billingMonth).Scan(&sum).Error; err != nil {
			return 0, err
		}
		return sum, nil

	case "services":
		// Count services across all units for this company
		var count int64
		query := `
			SELECT COUNT(*) 
			FROM services 
			WHERE unit_id IN (SELECT id FROM units WHERE company_id = ?)
		`
		if err := db.Raw(query, companyID).Scan(&count).Error; err != nil {
			return 0, err
		}
		return int(count), nil

	case "counters":
		// Count counters across all units for this company
		var count int64
		query := `
			SELECT COUNT(*) 
			FROM counters 
			WHERE unit_id IN (SELECT id FROM units WHERE company_id = ?)
		`
		if err := db.Raw(query, companyID).Scan(&count).Error; err != nil {
			return 0, err
		}
		return int(count), nil

	default:
		return 0, fmt.Errorf("unknown metric type: %s", metric)
	}
}

// GetLimit returns the quota limit for a specific metric based on the subscription plan
func (s *quotaService) GetLimit(companyID string, metric string) (int, error) {
	db := database.DB

	var company models.Company
	if err := db.Preload("Subscription.Plan").Where("id = ?", companyID).First(&company).Error; err != nil {
		return 0, err
	}

	// If no subscription, use default (very limited)
	if company.Subscription == nil || company.Subscription.Plan.ID == "" {
		return s.getDefaultLimit(metric), nil
	}

	// Parse limits from subscription plan
	var limits map[string]int
	if err := json.Unmarshal(company.Subscription.Plan.Limits, &limits); err != nil {
		return 0, err
	}

	limit, exists := limits[metric]
	if !exists {
		return s.getDefaultLimit(metric), nil
	}

	return limit, nil
}

// getDefaultLimit returns default limits for free/no-subscription users
func (s *quotaService) getDefaultLimit(metric string) int {
	defaults := map[string]int{
		"units":              1,
		"users":              3,
		"tickets_per_month":  100,
		"services":           5,
		"counters":           2,
	}

	if limit, exists := defaults[metric]; exists {
		return limit
	}
	return 0
}

// IncrementUsage records usage for quota tracking
func (s *quotaService) IncrementUsage(companyID string, metric string, delta int) error {
	db := database.DB

	now := time.Now()
	billingMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	usageRecord := &models.UsageRecord{
		CompanyID:    companyID,
		MetricType:   metric,
		Value:        delta,
		Timestamp:    now,
		BillingMonth: billingMonth,
	}

	return db.Create(usageRecord).Error
}

// GetUsageMetrics returns a comprehensive view of current usage
func (s *quotaService) GetUsageMetrics(companyID string) (*UsageMetrics, error) {
	now := time.Now()
	billingMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	nextMonth := billingMonth.AddDate(0, 1, 0)

	metrics := []string{"units", "users", "tickets_per_month", "services", "counters"}
	usageMap := make(map[string]UsageMetricInfo)

	for _, metric := range metrics {
		current, err := s.GetCurrentUsage(companyID, metric)
		if err != nil {
			return nil, err
		}

		limit, err := s.GetLimit(companyID, metric)
		if err != nil {
			return nil, err
		}

		usageMap[metric] = UsageMetricInfo{
			Current: current,
			Limit:   limit,
		}
	}

	return &UsageMetrics{
		CurrentPeriod: Period{
			Start: billingMonth,
			End:   nextMonth,
		},
		Metrics: usageMap,
	}, nil
}

// QuotaError represents a quota limit exceeded error
type QuotaError struct {
	Metric  string
	Current int
	Limit   int
}

func (e *QuotaError) Error() string {
	return fmt.Sprintf("quota exceeded for %s: %d/%d", e.Metric, e.Current, e.Limit)
}

// EnsureQuota checks quota and returns an error if exceeded
func EnsureQuota(companyID string, metric string, quotaSvc QuotaService) error {
	allowed, err := quotaSvc.CheckQuota(companyID, metric)
	if err != nil {
		return err
	}

	if !allowed {
		current, _ := quotaSvc.GetCurrentUsage(companyID, metric)
		limit, _ := quotaSvc.GetLimit(companyID, metric)
		return &QuotaError{
			Metric:  metric,
			Current: current,
			Limit:   limit,
		}
	}

	return nil
}

// IsQuotaError checks if an error is a quota error
func IsQuotaError(err error) bool {
	var quotaErr *QuotaError
	return errors.As(err, &quotaErr)
}
