package subscriptionfeatures

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"strings"

	"gorm.io/gorm"
)

func planFeatureTruthy(v interface{}) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return !math.IsNaN(t) && t == 1
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		return s == "true" || s == "1" || s == "yes"
	default:
		return false
	}
}

func loadPlanFeaturesJSON(ctx context.Context, db *gorm.DB, companyID string) ([]byte, error) {
	row := db.WithContext(ctx).Raw(`
SELECT sp.features FROM companies c
LEFT JOIN subscriptions s ON s.id = c.subscription_id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE c.id = ? LIMIT 1
`, companyID).Row()
	var raw []byte
	if err := row.Scan(&raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func companyIsSaaSOperator(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	var v bool
	err := db.WithContext(ctx).Raw(`SELECT is_saas_operator FROM companies WHERE id = ? LIMIT 1`, companyID).Scan(&v).Error
	return v, err
}

// CompanyHasAPIAccess is true when plan.features.api_access is truthy; absent key defaults to false
// (strict gate for integration keys — catalog plans set the flag explicitly).
func CompanyHasAPIAccess(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	if strings.TrimSpace(companyID) == "" {
		return false, nil
	}
	if op, err := companyIsSaaSOperator(ctx, db, companyID); err == nil && op {
		return true, nil
	}
	raw, err := loadPlanFeaturesJSON(ctx, db, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return false, nil
	}
	v, ok := m["api_access"]
	if !ok || v == nil {
		return false, nil
	}
	return planFeatureTruthy(v), nil
}

// CompanyHasOutboundWebhooks is true when plan.features.outbound_webhooks is truthy; absent → false.
func CompanyHasOutboundWebhooks(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	if strings.TrimSpace(companyID) == "" {
		return false, nil
	}
	if op, err := companyIsSaaSOperator(ctx, db, companyID); err == nil && op {
		return true, nil
	}
	raw, err := loadPlanFeaturesJSON(ctx, db, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return false, nil
	}
	v, ok := m["outbound_webhooks"]
	if !ok || v == nil {
		return false, nil
	}
	return planFeatureTruthy(v), nil
}

// CompanyHasPublicQueueWidget is true when plan.features.public_queue_widget is truthy; absent → false.
func CompanyHasPublicQueueWidget(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	if strings.TrimSpace(companyID) == "" {
		return false, nil
	}
	if op, err := companyIsSaaSOperator(ctx, db, companyID); err == nil && op {
		return true, nil
	}
	raw, err := loadPlanFeaturesJSON(ctx, db, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return false, nil
	}
	v, ok := m["public_queue_widget"]
	if !ok || v == nil {
		return false, nil
	}
	return planFeatureTruthy(v), nil
}

// CompanyHasCustomScreenLayouts is true when plan.features.custom_screen_layouts is truthy; absent → false.
func CompanyHasCustomScreenLayouts(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	if strings.TrimSpace(companyID) == "" {
		return false, nil
	}
	if op, err := companyIsSaaSOperator(ctx, db, companyID); err == nil && op {
		return true, nil
	}
	raw, err := loadPlanFeaturesJSON(ctx, db, companyID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return false, nil
	}
	v, ok := m["custom_screen_layouts"]
	if !ok || v == nil {
		return false, nil
	}
	return planFeatureTruthy(v), nil
}
