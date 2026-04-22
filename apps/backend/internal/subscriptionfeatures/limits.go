package subscriptionfeatures

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"

	"gorm.io/gorm"
)

// CompanyPlanLimitInt returns the numeric limit from the active subscription plan JSON (`limits` on subscription_plans).
// Missing key yields (0, nil) — callers should treat 0 as "unset" and fall back to a product default if needed.
// Value -1 means unlimited.
func CompanyPlanLimitInt(ctx context.Context, db *gorm.DB, companyID, key string) (int, error) {
	if companyID == "" || key == "" {
		return 0, nil
	}
	if op, err := companyIsSaaSOperator(ctx, db, companyID); err == nil && op {
		return -1, nil
	}
	row := db.WithContext(ctx).Raw(`
SELECT sp.limits FROM companies c
LEFT JOIN subscriptions s ON s.id = c.subscription_id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE c.id = ? LIMIT 1
`, companyID).Row()
	var raw []byte
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return 0, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return 0, nil
	}
	v, ok := m[key]
	if !ok || v == nil {
		return 0, nil
	}
	switch t := v.(type) {
	case float64:
		if math.IsNaN(t) {
			return 0, nil
		}
		return int(t), nil
	case int:
		return t, nil
	case int64:
		return int(t), nil
	case json.Number:
		i, err := t.Int64()
		if err != nil {
			return 0, nil
		}
		return int(i), nil
	default:
		return 0, nil
	}
}
