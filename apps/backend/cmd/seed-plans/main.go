package main

import (
	"errors"
	"fmt"
	"log"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"quokkaq-go-backend/pkg/plans"

	"gorm.io/gorm"
)

func main() {
	config.Load()
	database.Connect()

	fmt.Println("Seeding subscription plans...")

	db := database.DB

	for _, planDef := range plans.Plans {
		limitsJSON, err := planDef.LimitsJSON()
		if err != nil {
			log.Printf("Failed to marshal limits for plan %s: %v", planDef.Code, err)
			continue
		}

		featuresJSON, err := planDef.FeaturesJSON()
		if err != nil {
			log.Printf("Failed to marshal features for plan %s: %v", planDef.Code, err)
			continue
		}

		var existing models.SubscriptionPlan
		err = db.Where("code = ?", planDef.Code).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			plan := &models.SubscriptionPlan{
				Name:     planDef.Name,
				Code:     planDef.Code,
				Price:    planDef.Price,
				Currency: planDef.Currency,
				Interval: planDef.Interval,
				Limits:   limitsJSON,
				Features: featuresJSON,
				IsActive: true,
			}
			if err := db.Create(plan).Error; err != nil {
				log.Printf("Failed to create plan %s: %v", planDef.Code, err)
				continue
			}
			fmt.Printf("✓ Created plan: %s (%s)\n", planDef.Name, planDef.Code)
			continue
		}
		if err != nil {
			log.Printf("Failed to look up plan %s: %v", planDef.Code, err)
			continue
		}

		// Keep DB in sync with pkg/plans (price is minor units: kopeks for RUB).
		existing.Name = planDef.Name
		existing.Price = planDef.Price
		existing.Currency = planDef.Currency
		existing.Interval = planDef.Interval
		existing.Limits = limitsJSON
		existing.Features = featuresJSON
		existing.IsActive = true
		if err := db.Save(&existing).Error; err != nil {
			log.Printf("Failed to update plan %s: %v", planDef.Code, err)
			continue
		}
		fmt.Printf("✓ Updated plan: %s (%s)\n", planDef.Name, planDef.Code)
	}

	fmt.Println("Subscription plans seeding completed!")
}
