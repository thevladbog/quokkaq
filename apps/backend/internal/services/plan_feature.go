package services

import (
	"encoding/json"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

// PlanFeatureCounterGuestSurvey is the subscription plan.features key for guest survey at counters.
const PlanFeatureCounterGuestSurvey = "counter_guest_survey"

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
