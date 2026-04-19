package main

import (
	"encoding/json"
	"fmt"
	"os"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/pkg/database"
	"time"

	"gorm.io/gorm"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	config.Load()
	logger.Init()
	if err := database.Connect(); err != nil {
		return err
	}

	var migrationFailures int

	fmt.Println("Starting SaaS migration...")

	db := database.DB

	// 1. Migrate companies without subscriptions to grandfathered plan
	fmt.Println("\n1. Migrating companies to grandfathered plan...")

	var companies []models.Company
	if err := db.Where("subscription_id IS NULL").Find(&companies).Error; err != nil {
		logger.Error("Failed to fetch companies", "err", err)
		return fmt.Errorf("failed to fetch companies: %w", err)
	}

	// Find or create grandfathered plan
	var grandfatheredPlan models.SubscriptionPlan
	if err := db.Where("code = ?", "grandfathered").First(&grandfatheredPlan).Error; err != nil {
		logger.Error("grandfathered plan not found; run seed-plans first", "err", err)
		return fmt.Errorf("grandfathered plan not found (run seed-plans first): %w", err)
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
			logger.Printf("Failed to migrate company %s (subscription + company link): %v", company.Name, err)
			migrationFailures++
			continue
		}

		fmt.Printf("✓ Migrated company: %s\n", company.Name)
	}

	// 2. Assign owners to companies without ownerUserId
	fmt.Println("\n2. Assigning owners to companies...")

	companies = nil
	if err := db.Preload("Units").Find(&companies).Error; err != nil {
		logger.Printf("Failed to reload companies with units: %v", err)
		migrationFailures++
	} else {
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
					logger.Printf("Failed to look up admin for company %s: %v", company.Name, err)
				} else {
					logger.Printf("No admin found for company %s, skipping", company.Name)
				}
				migrationFailures++
				continue
			}

			company.OwnerUserID = ownerID
			if err := db.Save(&company).Error; err != nil {
				logger.Printf("Failed to set owner for company %s: %v", company.Name, err)
				migrationFailures++
				continue
			}

			fmt.Printf("✓ Set owner for company: %s\n", company.Name)
		}
	}

	// 3. Create usage records based on current data
	fmt.Println("\n3. Creating usage records...")

	companies = nil
	if err := db.Find(&companies).Error; err != nil {
		logger.Printf("Failed to fetch companies for usage sync: %v", err)
		migrationFailures++
	} else {
		for _, company := range companies {
			if err := services.SyncCurrentUsageToRecords(company.ID); err != nil {
				logger.Printf("Failed to sync usage for company %s: %v", company.Name, err)
				migrationFailures++
				continue
			}
			fmt.Printf("✓ Synced usage for company: %s\n", company.Name)
		}
	}

	// 4. Initialize onboarding state for companies
	fmt.Println("\n4. Initializing onboarding state...")

	companies = nil
	if err := db.Find(&companies).Error; err != nil {
		logger.Printf("Failed to fetch companies for onboarding: %v", err)
		migrationFailures++
	} else {
		for _, company := range companies {
			if company.OnboardingState != nil {
				continue // Already has onboarding state
			}

			var unitCount, serviceCount int64
			if err := db.Model(&models.Unit{}).Where("company_id = ?", company.ID).Count(&unitCount).Error; err != nil {
				logger.Printf("Failed to count units for company %s: %v", company.Name, err)
				migrationFailures++
				continue
			}

			if unitCount > 0 {
				var firstUnit models.Unit
				if err := db.Where("company_id = ?", company.ID).First(&firstUnit).Error; err != nil {
					logger.Printf("Failed to load first unit for company %s: %v", company.Name, err)
					migrationFailures++
					continue
				}
				if err := db.Model(&models.Service{}).Where("unit_id = ?", firstUnit.ID).Count(&serviceCount).Error; err != nil {
					logger.Printf("Failed to count services for company %s: %v", company.Name, err)
					migrationFailures++
					continue
				}
			}

			onboardingState := map[string]interface{}{
				"completed":   true, // Mark as completed for existing companies
				"currentStep": 5,
				"steps": map[string]bool{
					"unit_created":        unitCount > 0,
					"services_configured": serviceCount > 0,
					"team_invited":        true, // Assume existing companies have teams
				},
			}

			onboardingJSON, err := json.Marshal(onboardingState)
			if err != nil {
				logger.Printf("Failed to marshal onboarding state for company %s: %v", company.Name, err)
				migrationFailures++
				continue
			}
			company.OnboardingState = onboardingJSON

			if err := db.Save(&company).Error; err != nil {
				logger.Printf("Failed to set onboarding state for company %s: %v", company.Name, err)
				migrationFailures++
				continue
			}

			fmt.Printf("✓ Set onboarding state for company: %s\n", company.Name)
		}
	}

	if migrationFailures > 0 {
		fmt.Printf("\n✗ SaaS migration finished with %d error(s); see logs above for details.\n", migrationFailures)
		return fmt.Errorf("migration completed with %d error(s)", migrationFailures)
	}
	fmt.Println("\n✓ SaaS migration completed successfully!")
	fmt.Printf("Migrated %d companies to SaaS model\n", len(companies))
	return nil
}
