package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/pkg/database"
	"time"

	"gorm.io/gorm"
)

func main() {
	config.Load()
	database.Connect()

	var migrationFailures int

	fmt.Println("Starting SaaS migration...")

	db := database.DB

	// 1. Migrate companies without subscriptions to grandfathered plan
	fmt.Println("\n1. Migrating companies to grandfathered plan...")
	
	var companies []models.Company
	if err := db.Where("subscription_id IS NULL").Find(&companies).Error; err != nil {
		log.Fatalf("Failed to fetch companies: %v", err)
	}

	// Find or create grandfathered plan
	var grandfatheredPlan models.SubscriptionPlan
	if err := db.Where("code = ?", "grandfathered").First(&grandfatheredPlan).Error; err != nil {
		log.Fatalf("Grandfathered plan not found. Please run seed-plans first: %v", err)
	}

	for _, company := range companies {
		// Create unlimited subscription for existing customers
		subscription := &models.Subscription{
			CompanyID:          company.ID,
			PlanID:             grandfatheredPlan.ID,
			Status:             "active",
			CurrentPeriodStart: time.Now(),
			CurrentPeriodEnd:   time.Now().AddDate(100, 0, 0), // 100 years (essentially lifetime)
			CancelAtPeriodEnd:  false,
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(subscription).Error; err != nil {
				return err
			}
			company.SubscriptionID = &subscription.ID
			if err := tx.Save(&company).Error; err != nil {
				return err
			}
			return nil
		})
		if err != nil {
			log.Printf("Failed to migrate company %s (subscription + company link): %v", company.Name, err)
			migrationFailures++
			continue
		}

		fmt.Printf("✓ Migrated company: %s\n", company.Name)
	}

	// 2. Assign owners to companies without ownerUserId
	fmt.Println("\n2. Assigning owners to companies...")
	
	db.Preload("Units").Find(&companies)
	
	for _, company := range companies {
		if company.OwnerUserID != "" {
			continue // Already has owner
		}

		// Find first admin user associated with this company's units
		var ownerID string
		query := `
			SELECT DISTINCT u.id 
			FROM users u
			INNER JOIN user_roles ur ON u.id = ur.user_id
			INNER JOIN roles r ON ur.role_id = r.id
			INNER JOIN user_units uu ON u.id = uu.user_id
			INNER JOIN units un ON uu.unit_id = un.id
			WHERE r.name = 'admin' AND un.company_id = ?
			LIMIT 1
		`
		
		if err := db.Raw(query, company.ID).Scan(&ownerID).Error; err != nil || ownerID == "" {
			if err != nil {
				log.Printf("Failed to look up admin for company %s: %v", company.Name, err)
			} else {
				log.Printf("No admin found for company %s, skipping", company.Name)
			}
			migrationFailures++
			continue
		}

		company.OwnerUserID = ownerID
		if err := db.Save(&company).Error; err != nil {
			log.Printf("Failed to set owner for company %s: %v", company.Name, err)
			migrationFailures++
			continue
		}

		fmt.Printf("✓ Set owner for company: %s\n", company.Name)
	}

	// 3. Create usage records based on current data
	fmt.Println("\n3. Creating usage records...")
	
	db.Find(&companies)
	
	for _, company := range companies {
		if err := services.SyncCurrentUsageToRecords(company.ID); err != nil {
			log.Printf("Failed to sync usage for company %s: %v", company.Name, err)
			migrationFailures++
			continue
		}
		fmt.Printf("✓ Synced usage for company: %s\n", company.Name)
	}

	// 4. Initialize onboarding state for companies
	fmt.Println("\n4. Initializing onboarding state...")
	
	for _, company := range companies {
		if company.OnboardingState != nil {
			continue // Already has onboarding state
		}

		// Check what's already configured
		var unitCount, serviceCount int64
		db.Model(&models.Unit{}).Where("company_id = ?", company.ID).Count(&unitCount)
		
		if unitCount > 0 {
			var firstUnit models.Unit
			db.Where("company_id = ?", company.ID).First(&firstUnit)
			db.Model(&models.Service{}).Where("unit_id = ?", firstUnit.ID).Count(&serviceCount)
		}

		onboardingState := map[string]interface{}{
			"completed": true, // Mark as completed for existing companies
			"currentStep": 5,
			"steps": map[string]bool{
				"unit_created":        unitCount > 0,
				"services_configured": serviceCount > 0,
				"team_invited":        true, // Assume existing companies have teams
			},
		}

		onboardingJSON, _ := json.Marshal(onboardingState)
		company.OnboardingState = onboardingJSON
		
		if err := db.Save(&company).Error; err != nil {
			log.Printf("Failed to set onboarding state for company %s: %v", company.Name, err)
			migrationFailures++
			continue
		}

		fmt.Printf("✓ Set onboarding state for company: %s\n", company.Name)
	}

	if migrationFailures > 0 {
		fmt.Printf("\n✗ SaaS migration finished with %d error(s); see logs above for details.\n", migrationFailures)
		os.Exit(1)
	}
	fmt.Println("\n✓ SaaS migration completed successfully!")
	fmt.Printf("Migrated %d companies to SaaS model\n", len(companies))
}
