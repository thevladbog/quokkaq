package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
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

func main() {
	config.Load()
	logger.Init()
	database.Connect()

	fmt.Println("Seeding subscription plans...")

	db := database.DB

	for _, planDef := range plans.Plans {
		limitsJSON, err := planDef.LimitsJSON()
		if err != nil {
			logger.Printf("Failed to marshal limits for plan %s: %v", planDef.Code, err)
			continue
		}

		featuresJSON, err := planDef.FeaturesJSON()
		if err != nil {
			logger.Printf("Failed to marshal features for plan %s: %v", planDef.Code, err)
			continue
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
			}
			if err := db.Create(plan).Error; err != nil {
				logger.Printf("Failed to create plan %s: %v", planDef.Code, err)
				continue
			}
			fmt.Printf("✓ Created plan: %s (%s)\n", planDef.Name, planDef.Code)
			continue
		}
		if err != nil {
			logger.Printf("Failed to look up plan %s: %v", planDef.Code, err)
			continue
		}

		// Keep DB in sync with pkg/plans (price is minor units: kopeks for RUB).
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
		if len(existing.LimitsNegotiable) == 0 {
			existing.LimitsNegotiable = json.RawMessage("{}")
		}
		if err := db.Save(&existing).Error; err != nil {
			logger.Printf("Failed to update plan %s: %v", planDef.Code, err)
			continue
		}
		fmt.Printf("✓ Updated plan: %s (%s)\n", planDef.Name, planDef.Code)
	}

	fmt.Println("Subscription plans seeding completed!")
}
