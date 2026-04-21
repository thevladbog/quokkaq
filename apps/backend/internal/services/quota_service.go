package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services/subscriptions"
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
	// CheckZonesPerUnit checks whether a specific subdivision has capacity for an additional service zone.
	// subdivisionID is the parent subdivision unit ID; companyID is used to load the plan limits.
	CheckZonesPerUnit(subdivisionID, companyID string) (bool, error)
}

type quotaService struct{}

func NewQuotaService() QuotaService {
	return &quotaService{}
}

// UsageMetrics represents current usage across all metrics
type UsageMetrics struct {
	CurrentPeriod Period                     `json:"currentPeriod"`
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
	db := database.DB
	if err := subscriptions.ApplyPendingPlanIfDueBeforeQuota(db, companyID, time.Now().UTC()); err != nil {
		return false, err
	}

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
		// Count billable branch/operational units; pure service zones do not consume quota.
		var count int64
		if err := db.Model(&models.Unit{}).
			Where("company_id = ? AND kind = ?", companyID, models.UnitKindSubdivision).
			Count(&count).Error; err != nil {
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
		nowUTC := time.Now().UTC()
		billingMonth := time.Date(nowUTC.Year(), nowUTC.Month(), 1, 0, 0, 0, 0, time.UTC)

		// Lazily apply credit carry-over from the previous billing month on the first
		// quota check of a new period: count credit tickets issued in the prior month
		// that have not yet been deducted and insert a negative usage_record entry.
		if err := s.applyCreditCarryOverIfNeeded(companyID, billingMonth); err != nil {
			return 0, err
		}

		var sum int
		query := `
			SELECT COALESCE(SUM(value), 0) 
			FROM usage_records 
			WHERE company_id = ? AND metric_type IN ('tickets_per_month', 'tickets_created', 'tickets_credit_carry_over') AND billing_month = ?
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

// GetLimit returns the quota limit for a specific metric based on the subscription plan.
// It is read-only (no DB writes). Quota enforcement paths call ApplyPendingPlanIfDueBeforeQuota via CheckQuota so scheduled plan changes are applied before limits are read.
func (s *quotaService) GetLimit(companyID string, metric string) (int, error) {
	db := database.DB

	var company models.Company
	if err := db.Preload("Subscription.Plan").Preload("Subscription.PendingPlan").Where("id = ?", companyID).First(&company).Error; err != nil {
		return 0, err
	}

	if company.IsSaaSOperator {
		return -1, nil
	}

	// If no subscription, use default (very limited)
	if company.Subscription == nil || company.Subscription.Plan.ID == "" {
		return s.getDefaultLimit(metric), nil
	}

	plan := company.Subscription.Plan
	if len(plan.Limits) == 0 {
		return s.getDefaultLimit(metric), nil
	}

	// Parse limits from subscription plan
	var limits map[string]int
	if err := json.Unmarshal(plan.Limits, &limits); err != nil {
		return 0, err
	}

	limit, exists := limits[metric]
	if !exists {
		return s.getDefaultLimit(metric), nil
	}

	return limit, nil
}

// quotaMetricKeys are the metrics exposed by GetUsageMetrics / GetCurrentUsage.
// zones_per_unit is not included here because it is per-subdivision, not per-company.
var quotaMetricKeys = []string{"units", "users", "tickets_per_month", "services", "counters"}

// limitsMapForCompany loads subscription plan limits once and merges defaults for missing keys.
func (s *quotaService) limitsMapForCompany(companyID string) (map[string]int, error) {
	db := database.DB

	var company models.Company
	if err := db.Preload("Subscription.Plan").Preload("Subscription.PendingPlan").Where("id = ?", companyID).First(&company).Error; err != nil {
		return nil, err
	}

	if company.IsSaaSOperator {
		out := make(map[string]int, len(quotaMetricKeys))
		for _, m := range quotaMetricKeys {
			out[m] = -1
		}
		return out, nil
	}

	var fromPlan map[string]int
	if company.Subscription != nil && company.Subscription.Plan.ID != "" && len(company.Subscription.Plan.Limits) > 0 {
		if err := json.Unmarshal(company.Subscription.Plan.Limits, &fromPlan); err != nil {
			return nil, err
		}
	}

	out := make(map[string]int, len(quotaMetricKeys))
	for _, m := range quotaMetricKeys {
		if fromPlan != nil {
			if v, ok := fromPlan[m]; ok {
				out[m] = v
				continue
			}
		}
		out[m] = s.getDefaultLimit(m)
	}
	return out, nil
}

// getDefaultLimit returns default limits for free/no-subscription users
func (s *quotaService) getDefaultLimit(metric string) int {
	defaults := map[string]int{
		"units":             1,
		"users":             3,
		"tickets_per_month": 100,
		"services":          5,
		"counters":          2,
		"zones_per_unit":    0, // no zones by default without a plan
	}

	if limit, exists := defaults[metric]; exists {
		return limit
	}
	return 0
}

// CheckZonesPerUnit checks whether subdivisionID has room for one more service_zone child.
// It reads the zones_per_unit limit from the company's subscription plan.
func (s *quotaService) CheckZonesPerUnit(subdivisionID, companyID string) (bool, error) {
	db := database.DB

	limit, err := s.GetLimit(companyID, "zones_per_unit")
	if err != nil {
		return false, err
	}
	if limit == -1 {
		return true, nil // unlimited
	}

	var count int64
	if err := db.Model(&models.Unit{}).
		Where("parent_id = ? AND kind = ?", subdivisionID, models.UnitKindServiceZone).
		Count(&count).Error; err != nil {
		return false, err
	}
	return int(count) < limit, nil
}

// applyCreditCarryOverIfNeeded deducts prior-month credit tickets from the current billing period.
// Called lazily on the first tickets_per_month quota check of each new month.
// It is idempotent: if a carry-over row for the current billingMonth already exists, it is a no-op.
func (s *quotaService) applyCreditCarryOverIfNeeded(companyID string, billingMonth time.Time) error {
	db := database.DB

	// Check if carry-over for this period has already been applied.
	var existingCount int64
	if err := db.Raw(
		`SELECT COUNT(*) FROM usage_records WHERE company_id = ? AND metric_type = 'tickets_credit_carry_over' AND billing_month = ?`,
		companyID, billingMonth,
	).Scan(&existingCount).Error; err != nil {
		return err
	}
	if existingCount > 0 {
		return nil // already applied
	}

	// Count credit tickets issued in the previous billing month.
	prevMonth := billingMonth.AddDate(0, -1, 0)
	prevMonthEnd := billingMonth // exclusive upper bound

	var creditCount int64
	if err := db.Raw(
		`SELECT COUNT(*) FROM tickets
		 WHERE unit_id IN (SELECT id FROM units WHERE company_id = ?)
		   AND is_credit = true
		   AND created_at >= ? AND created_at < ?`,
		companyID, prevMonth, prevMonthEnd,
	).Scan(&creditCount).Error; err != nil {
		return err
	}

	// Always write a carry-over row (even if creditCount == 0) so we don't recheck every time.
	// A zero-value row acts as a sentinel while a positive value deducts from the current period's quota.
	nowUTC := time.Now().UTC()
	carryOver := &models.UsageRecord{
		CompanyID:    companyID,
		MetricType:   "tickets_credit_carry_over",
		Value:        int(creditCount),
		Timestamp:    nowUTC,
		BillingMonth: billingMonth,
	}
	return db.Create(carryOver).Error
}

// IncrementUsage records usage for quota tracking
func (s *quotaService) IncrementUsage(companyID string, metric string, delta int) error {
	db := database.DB

	nowUTC := time.Now().UTC()
	billingMonth := time.Date(nowUTC.Year(), nowUTC.Month(), 1, 0, 0, 0, 0, time.UTC)

	usageRecord := &models.UsageRecord{
		CompanyID:    companyID,
		MetricType:   metric,
		Value:        delta,
		Timestamp:    nowUTC,
		BillingMonth: billingMonth,
	}

	return db.Create(usageRecord).Error
}

// GetUsageMetrics returns a comprehensive view of current usage
func (s *quotaService) GetUsageMetrics(companyID string) (*UsageMetrics, error) {
	nowUTC := time.Now().UTC()
	billingMonth := time.Date(nowUTC.Year(), nowUTC.Month(), 1, 0, 0, 0, 0, time.UTC)
	nextMonth := billingMonth.AddDate(0, 1, 0)

	limits, err := s.limitsMapForCompany(companyID)
	if err != nil {
		return nil, err
	}

	usageMap := make(map[string]UsageMetricInfo)
	for _, metric := range quotaMetricKeys {
		current, err := s.GetCurrentUsage(companyID, metric)
		if err != nil {
			return nil, err
		}

		usageMap[metric] = UsageMetricInfo{
			Current: current,
			Limit:   limits[metric],
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
		current, errU := quotaSvc.GetCurrentUsage(companyID, metric)
		if errU != nil {
			return fmt.Errorf("quota check failed for %s: get current usage: %w", metric, errU)
		}
		limit, errL := quotaSvc.GetLimit(companyID, metric)
		if errL != nil {
			return fmt.Errorf("quota check failed for %s: get limit: %w", metric, errL)
		}
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
