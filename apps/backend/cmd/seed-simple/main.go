package main

import (
	"fmt"
	"os"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	fmt.Println("Starting database seeding...")
	config.Load()
	database.Connect()

	const adminEmail = "admin@quokkaq.com"
	var existing int64
	if err := database.DB.Model(&models.User{}).Where("email = ?", adminEmail).Count(&existing).Error; err != nil {
		fmt.Printf("Seed check failed: %v\n", err)
		os.Exit(1)
	}
	if existing > 0 {
		fmt.Println("Seed already applied (admin user exists), skipping.")
		return
	}

	// Create seed data
	fmt.Println("Seeding data...")

	// Create company (marked SaaS operator: unlimited quotas, legal profile for the deployment)
	company := models.Company{
		Name:           "QuokkaQ Demo",
		IsSaaSOperator: true,
	}
	database.DB.Create(&company)
	fmt.Printf("Created company: %s (ID: %s)\n", company.Name, company.ID)

	// Create unit
	unit := models.Unit{
		CompanyID: company.ID,
		Name:      "Main Office",
		Code:      "MAIN",
		Timezone:  "Europe/Moscow",
	}
	database.DB.Create(&unit)
	fmt.Printf("Created unit: %s (ID: %s)\n", unit.Name, unit.ID)

	// Create roles
	adminRole := models.Role{Name: "admin"}
	supervisorRole := models.Role{Name: "supervisor"}
	operatorRole := models.Role{Name: "operator"}
	platformAdminRole := models.Role{Name: "platform_admin"}
	database.DB.Create(&adminRole)
	database.DB.Create(&supervisorRole)
	database.DB.Create(&operatorRole)
	database.DB.Create(&platformAdminRole)
	fmt.Println("Created roles: admin, supervisor, operator, platform_admin")

	// Create admin user
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	hashedPasswordStr := string(hashedPassword)
	adminEmailStr := adminEmail
	adminUser := models.User{
		Name:     "Admin User",
		Email:    &adminEmailStr,
		Password: &hashedPasswordStr,
	}
	database.DB.Create(&adminUser)
	fmt.Printf("Created admin user: %s (ID: %s, email: %s, password: admin123)\n", adminUser.Name, adminUser.ID, *adminUser.Email)

	// Assign admin role
	database.DB.Create(&models.UserRole{
		UserID: adminUser.ID,
		RoleID: adminRole.ID,
	})

	database.DB.Create(&models.UserRole{
		UserID: adminUser.ID,
		RoleID: platformAdminRole.ID,
	})

	// Assign user to unit
	database.DB.Create(&models.UserUnit{
		UserID: adminUser.ID,
		UnitID: unit.ID,
	})

	// Create operator user
	operatorPassword, _ := bcrypt.GenerateFromPassword([]byte("operator123"), bcrypt.DefaultCost)
	operatorPasswordStr := string(operatorPassword)
	operatorEmail := "operator@quokkaq.com"
	operatorUser := models.User{
		Name:     "Operator User",
		Email:    &operatorEmail,
		Password: &operatorPasswordStr,
	}
	database.DB.Create(&operatorUser)
	fmt.Printf("Created operator user: %s (ID: %s, email: %s, password: operator123)\n", operatorUser.Name, operatorUser.ID, *operatorUser.Email)

	// Assign operator role
	database.DB.Create(&models.UserRole{
		UserID: operatorUser.ID,
		RoleID: operatorRole.ID,
	})

	// Assign operator to unit
	database.DB.Create(&models.UserUnit{
		UserID: operatorUser.ID,
		UnitID: unit.ID,
	})

	// Create services
	serviceA := models.Service{
		UnitID:      unit.ID,
		Name:        "Service A",
		NameRu:      stringPtr("Услуга А"),
		NameEn:      stringPtr("Service A"),
		Description: stringPtr("General service"),
		Prefix:      stringPtr("A"),
		Duration:    intPtr(15),
		IsLeaf:      true,
	}
	database.DB.Create(&serviceA)
	fmt.Printf("Created service: %s (ID: %s)\n", serviceA.Name, serviceA.ID)

	serviceB := models.Service{
		UnitID:      unit.ID,
		Name:        "Service B",
		NameRu:      stringPtr("Услуга Б"),
		NameEn:      stringPtr("Service B"),
		Description: stringPtr("Premium service"),
		Prefix:      stringPtr("B"),
		Duration:    intPtr(30),
		IsLeaf:      true,
	}
	database.DB.Create(&serviceB)
	fmt.Printf("Created service: %s (ID: %s)\n", serviceB.Name, serviceB.ID)

	// Create counters
	counter1 := models.Counter{
		UnitID: unit.ID,
		Name:   "Counter 1",
	}
	database.DB.Create(&counter1)
	fmt.Printf("Created counter: %s (ID: %s)\n", counter1.Name, counter1.ID)

	counter2 := models.Counter{
		UnitID: unit.ID,
		Name:   "Counter 2",
	}
	database.DB.Create(&counter2)
	fmt.Printf("Created counter: %s (ID: %s)\n", counter2.Name, counter2.ID)

	// Create sample tickets
	now := time.Now()
	ticket1 := models.Ticket{
		UnitID:      unit.ID,
		ServiceID:   serviceA.ID,
		QueueNumber: "A001",
		Status:      "waiting",
		CreatedAt:   now,
	}
	database.DB.Create(&ticket1)

	ticket2 := models.Ticket{
		UnitID:      unit.ID,
		ServiceID:   serviceB.ID,
		QueueNumber: "B001",
		Status:      "waiting",
		CreatedAt:   now.Add(1 * time.Minute),
	}
	database.DB.Create(&ticket2)

	ticket3 := models.Ticket{
		UnitID:      unit.ID,
		ServiceID:   serviceA.ID,
		QueueNumber: "A002",
		Status:      "waiting",
		CreatedAt:   now.Add(2 * time.Minute),
	}
	database.DB.Create(&ticket3)

	fmt.Println("Created 3 sample tickets")

	fmt.Println("\n✅ Database seeding completed successfully!")
	fmt.Println("\nTest credentials:")
	fmt.Println("Admin: admin@quokkaq.com / admin123 (tenant admin + platform_admin)")
	fmt.Println("Operator: operator@quokkaq.com / operator123")
}

func stringPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}
