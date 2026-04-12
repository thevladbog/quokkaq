package main

import (
	"fmt"
	"log"
	"time"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	fmt.Println("Starting database seeding...")

	// Load config and connect to database
	config.Load()
	database.Connect()

	// Drop all tables
	fmt.Println("Dropping existing tables...")
	if err := database.DB.Migrator().DropTable(
		&models.PasswordResetToken{},
		&models.ServiceSlot{},
		&models.DaySchedule{},
		&models.PreRegistration{},
		&models.DesktopTerminal{},
		&models.TicketHistory{},
		&models.Ticket{},
		&models.UnitClientTagAssignment{},
		&models.UnitVisitorTagDefinition{},
		&models.UnitClient{},
		&models.TicketNumberSequence{},
		&models.Booking{},
		&models.Counter{},
		&models.Service{},
		&models.UserUnit{},
		&models.UserRole{},
		&models.User{},
		&models.Role{},
		&models.UsageRecord{},
		&models.Invoice{},
		&models.Subscription{},
		&models.SubscriptionPlan{},
		&models.Unit{},
		&models.Company{},
		&models.Notification{},
		&models.AuditLog{},
		&models.UnitMaterial{},
		&models.Invitation{},
		&models.MessageTemplate{},
	); err != nil {
		fmt.Printf("Warning: Error dropping tables: %v\n", err)
	}

	// Recreate tables with auto-migration
	fmt.Println("Creating tables...")

	database.AutoMigrate(
		&models.Company{},
		&models.SubscriptionPlan{},
		&models.Subscription{},
		&models.Invoice{},
		&models.UsageRecord{},
		&models.Unit{},
		&models.User{},
		&models.Role{},
		&models.UserRole{},
		&models.UserUnit{},
		&models.Service{},
		&models.Counter{},
		&models.UnitClient{},
		&models.UnitVisitorTagDefinition{},
		&models.UnitClientTagAssignment{},
		&models.Ticket{},
		&models.TicketHistory{},
		&models.TicketNumberSequence{},
		&models.Booking{},
		&models.Notification{},
		&models.AuditLog{},
		&models.UnitMaterial{},
		&models.Invitation{},
		&models.MessageTemplate{},
		&models.DesktopTerminal{},
		&models.PreRegistration{},
		&models.ServiceSlot{},
		&models.DaySchedule{},
		&models.PasswordResetToken{},
	)

	// Create seed data
	fmt.Println("Seeding data...")

	// Create company (SaaS operator tenant for this deployment)
	company := models.Company{
		Name:           "QuokkaQ Demo",
		IsSaaSOperator: true,
	}
	database.DB.Create(&company)
	fmt.Printf("Created company: %s (ID: %s)\n", company.Name, company.ID)

	// Root subdivision (branch): queues, kiosk, counters attach to this unitId.
	unit := models.Unit{
		CompanyID: company.ID,
		Name:      "Main Office",
		Code:      "MAIN",
		Kind:      models.UnitKindSubdivision,
		Timezone:  "Europe/Moscow",
	}
	database.DB.Create(&unit)
	fmt.Printf("Created unit: %s (ID: %s)\n", unit.Name, unit.ID)

	anonymousClient := models.UnitClient{
		UnitID:      unit.ID,
		FirstName:   "Аноним",
		LastName:    "",
		PhoneE164:   nil,
		IsAnonymous: true,
	}
	if err := database.DB.Create(&anonymousClient).Error; err != nil {
		log.Fatalf("seed: create anonymous unit client: %v", err)
	}
	fmt.Println("Created anonymous unit client for kiosk tickets")

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
	adminEmail := "admin@quokkaq.com"
	adminUser := models.User{
		Name:     "Admin User",
		Email:    &adminEmail,
		Password: &hashedPasswordStr,
	}
	database.DB.Create(&adminUser)
	fmt.Printf("Created admin user: %s (ID: %s, password: admin123)\n", adminUser.Name, adminUser.ID)

	// Assign admin role
	database.DB.Create(&models.UserRole{
		UserID: adminUser.ID,
		RoleID: adminRole.ID,
	})

	// SaaS operator UI/API (`/platform/*`); no env hacks needed for local demo admin
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
	fmt.Printf("Created operator user: %s (ID: %s, password: operator123)\n", operatorUser.Name, operatorUser.ID)

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
		ClientID:    &anonymousClient.ID,
	}
	if err := database.DB.Create(&ticket1).Error; err != nil {
		log.Fatalf("seed: create sample ticket %s: %v", ticket1.QueueNumber, err)
	}

	ticket2 := models.Ticket{
		UnitID:      unit.ID,
		ServiceID:   serviceB.ID,
		QueueNumber: "B001",
		Status:      "waiting",
		CreatedAt:   now.Add(1 * time.Minute),
		ClientID:    &anonymousClient.ID,
	}
	if err := database.DB.Create(&ticket2).Error; err != nil {
		log.Fatalf("seed: create sample ticket %s: %v", ticket2.QueueNumber, err)
	}

	ticket3 := models.Ticket{
		UnitID:      unit.ID,
		ServiceID:   serviceA.ID,
		QueueNumber: "A002",
		Status:      "waiting",
		CreatedAt:   now.Add(2 * time.Minute),
		ClientID:    &anonymousClient.ID,
	}
	if err := database.DB.Create(&ticket3).Error; err != nil {
		log.Fatalf("seed: create sample ticket %s: %v", ticket3.QueueNumber, err)
	}

	fmt.Println("Created 3 sample tickets")

	// Create message template
	template := models.MessageTemplate{
		Name:      "Welcome",
		Subject:   "Welcome to QuokkaQ",
		Content:   "Hello {{name}}, welcome to our queue management system!",
		IsDefault: true,
	}
	database.DB.Create(&template)
	fmt.Println("Created default message template")

	fmt.Println("\n✅ Database seeding completed successfully!")
	fmt.Println("\nTest credentials:")
	fmt.Println("  Admin: admin@quokkaq.com / admin123 (tenant admin + platform_admin)")
	fmt.Println("  Operator: operator@quokkaq.com / operator123")
}

func stringPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}
