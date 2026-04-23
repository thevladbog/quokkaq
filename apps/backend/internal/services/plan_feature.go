package services

import (
	"encoding/json"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

// PlanFeatureCounterGuestSurvey is the subscription plan.features key for guest survey at counters.
const PlanFeatureCounterGuestSurvey = "counter_guest_survey"

// PlanFeatureCounterBoard is the subscription plan.features key for above-counter ticket board terminals.
const PlanFeatureCounterBoard = "counter_board"

// PlanFeatureCustomScreenLayouts enables tenant library CRUD for visual screen templates (cell-grid studio).
const PlanFeatureCustomScreenLayouts = "custom_screen_layouts"

// CompanyHasCounterBoardFeature is true when the plan enables counter_board, or when it has websocket_updates
// (older plans omitted counter_board in JSON; must match CounterBoardSession / ensureCounterBoardFeatureForUnit).
func CompanyHasCounterBoardFeature(companyID string) (bool, error) {
	ok, err := CompanyHasPlanFeature(companyID, PlanFeatureCounterBoard)
	if err != nil || ok {
		return ok, err
	}
	// TODO: Remove this fallback once migrations v1.3.4/v1.3.6 are validated in production and every
	// subscription plan row reliably has PlanFeatureCounterBoard ("counter_board") in JSON — older plans
	// used CompanyHasPlanFeature(companyID, "websocket_updates") only; see CompanyHasCounterBoardFeature.
	return CompanyHasPlanFeature(companyID, "websocket_updates")
}

// CompanyHasCustomScreenLayouts is true when plan.features.custom_screen_layouts is truthy.
func CompanyHasCustomScreenLayouts(companyID string) (bool, error) {
	return CompanyHasPlanFeature(companyID, PlanFeatureCustomScreenLayouts)
}

// CompanyHasPlanFeature returns whether the company's subscription plan enables the feature (boolean JSON).
func CompanyHasPlanFeature(companyID, featureKey string) (bool, error) {
	var c models.Company
	if err := database.DB.Preload("Subscription.Plan").Where("id = ?", companyID).First(&c).Error; err != nil {
		return false, err
	}
	if c.IsSaaSOperator {
		return true, nil
	}
	if c.Subscription == nil || c.Subscription.Plan.ID == "" {
		return false, nil
	}
	raw := c.Subscription.Plan.Features
	if len(raw) == 0 {
		return false, nil
	}
	var feats map[string]bool
	if err := json.Unmarshal(raw, &feats); err != nil {
		return false, err
	}
	return feats[featureKey], nil
}
