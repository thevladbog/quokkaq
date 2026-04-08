package main

import (
	"fmt"
	"log"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"quokkaq-go-backend/pkg/plans"
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

		// Use FirstOrCreate to avoid duplicates
		var existingPlan models.SubscriptionPlan
		result := db.Where("code = ?", plan.Code).FirstOrCreate(&existingPlan, plan)
		
		if result.Error != nil {
			log.Printf("Failed to create/find plan %s: %v", planDef.Code, result.Error)
			continue
		}

		if result.RowsAffected > 0 {
			fmt.Printf("✓ Created plan: %s (%s)\n", planDef.Name, planDef.Code)
		} else {
			fmt.Printf("- Plan already exists: %s (%s)\n", planDef.Name, planDef.Code)
		}
	}

	fmt.Println("Subscription plans seeding completed!")
}
