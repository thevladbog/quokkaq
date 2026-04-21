// Package subscriptionplanseed upserts subscription_plans rows from pkg/plans definitions.
package subscriptionplanseed

import (
	"encoding/json"
	"errors"
	"fmt"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/plans"

	"gorm.io/gorm"
)

func displayOrderForPlanCode(code string) int {
	switch code {
	case "starter":
		return 1
	case "professional":
		return 2
	case "enterprise":
		return 3
	case "grandfathered":
		return 99
	default:
		return 1000
	}
}

func planSeedIsPublic(code string) bool {
	return code != "grandfathered"
}

func planSeedAllowInstantPurchase(code string) bool {
	if code == "grandfathered" || code == "enterprise" {
		return false
	}
	return true
}

func planSeedIsFree(_ string) bool {
	// grandfathered is a legacy zero-price plan but not semantically "free" (it's a legacy tier).
	// No seeded plan is currently marked as isFree; that flag is set by platform operators via the constructor.
	return false
}

// planSeedPricingModel returns the pricing model for seeded plans.
// All new plans default to per_unit (price per subdivision per month).
func planSeedPricingModel(_ string) string {
	return "per_unit"
}

// UpsertSubscriptionPlans creates or updates rows for every entry in plans.Plans.
func UpsertSubscriptionPlans(db *gorm.DB) error {
	for _, planDef := range plans.Plans {
		limitsJSON, err := planDef.LimitsJSON()
		if err != nil {
			return fmt.Errorf("plan %s limits json: %w", planDef.Code, err)
		}

		featuresJSON, err := planDef.FeaturesJSON()
		if err != nil {
			return fmt.Errorf("plan %s features json: %w", planDef.Code, err)
		}

		var existing models.SubscriptionPlan
		err = db.Where("code = ?", planDef.Code).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			plan := &models.SubscriptionPlan{
				Name:                 planDef.Name,
				NameEn:               planDef.Name,
				Code:                 planDef.Code,
				Price:                planDef.Price,
				Currency:             planDef.Currency,
				Interval:             planDef.Interval,
				Limits:               limitsJSON,
				Features:             featuresJSON,
				IsActive:             true,
				IsPublic:             planSeedIsPublic(planDef.Code),
				IsPromoted:           planDef.Code == "professional",
				DisplayOrder:         displayOrderForPlanCode(planDef.Code),
				LimitsNegotiable:     json.RawMessage("{}"),
				AllowInstantPurchase: planSeedAllowInstantPurchase(planDef.Code),
				IsFree:               planSeedIsFree(planDef.Code),
				PricingModel:         planSeedPricingModel(planDef.Code),
			}
			if err := db.Create(plan).Error; err != nil {
				return fmt.Errorf("create plan %s: %w", planDef.Code, err)
			}
			continue
		}
		if err != nil {
			return fmt.Errorf("look up plan %s: %w", planDef.Code, err)
		}

		existing.Name = planDef.Name
		existing.NameEn = planDef.Name
		existing.Price = planDef.Price
		existing.Currency = planDef.Currency
		existing.Interval = planDef.Interval
		existing.Limits = limitsJSON
		existing.Features = featuresJSON
		existing.IsActive = true
		existing.IsPublic = planSeedIsPublic(planDef.Code)
		existing.IsPromoted = planDef.Code == "professional"
		existing.DisplayOrder = displayOrderForPlanCode(planDef.Code)
		existing.AllowInstantPurchase = planSeedAllowInstantPurchase(planDef.Code)
		// Preserve operator-set isFree/pricingModel; seed does not override platform customizations.
		if existing.PricingModel == "" {
			existing.PricingModel = planSeedPricingModel(planDef.Code)
		}
		if len(existing.LimitsNegotiable) == 0 {
			existing.LimitsNegotiable = json.RawMessage("{}")
		}
		if err := db.Save(&existing).Error; err != nil {
			return fmt.Errorf("update plan %s: %w", planDef.Code, err)
		}
	}
	return nil
}
