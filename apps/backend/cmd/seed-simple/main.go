package main

import (
	"errors"
	"fmt"
	"os"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	seedCompanyName = "QuokkaQ Demo"
	seedUnitCode    = "MAIN"
	adminEmail      = "admin@quokkaq.com"
	operatorEmail   = "operator@quokkaq.com"
)

func main() {
	fmt.Println("Starting database seeding...")
	config.Load()
	database.Connect()

	if err := runSeed(); err != nil {
		fmt.Printf("Seeding failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\n✅ Database seeding completed successfully!")
	fmt.Println("\nTest credentials:")
	fmt.Println("Admin: admin@quokkaq.com / admin123 (tenant admin + platform_admin)")
	fmt.Println("Operator: operator@quokkaq.com / operator123")
}

func runSeed() error {
	fmt.Println("Ensuring seed data (idempotent)...")

	company, err := ensureCompany()
	if err != nil {
		return fmt.Errorf("company: %w", err)
	}
	fmt.Printf("Company: %s (ID: %s)\n", company.Name, company.ID)

	unit, err := ensureUnit(company.ID)
	if err != nil {
		return fmt.Errorf("unit: %w", err)
	}
	fmt.Printf("Unit: %s (ID: %s)\n", unit.Name, unit.ID)

	adminRole, err := ensureRole("admin")
	if err != nil {
		return err
	}
	if _, err := ensureRole("supervisor"); err != nil {
		return err
	}
	operatorRole, err := ensureRole("operator")
	if err != nil {
		return err
	}
	platformAdminRole, err := ensureRole("platform_admin")
	if err != nil {
		return err
	}
	fmt.Println("Roles: admin, supervisor, operator, platform_admin")

	adminUser, err := ensureAdminUser()
	if err != nil {
		return fmt.Errorf("admin user: %w", err)
	}
	fmt.Printf("Admin user: %s (ID: %s)\n", adminUser.Name, adminUser.ID)

	ensureUserRole(adminUser.ID, adminRole.ID)
	ensureUserRole(adminUser.ID, platformAdminRole.ID)
	ensureUserUnit(adminUser.ID, unit.ID)

	operatorUser, err := ensureOperatorUser()
	if err != nil {
		return fmt.Errorf("operator user: %w", err)
	}
	fmt.Printf("Operator user: %s (ID: %s)\n", operatorUser.Name, operatorUser.ID)

	ensureUserRole(operatorUser.ID, operatorRole.ID)
	ensureUserUnit(operatorUser.ID, unit.ID)

	serviceA, err := ensureService(unit.ID, "Service A", stringPtr("Услуга А"), stringPtr("Service A"), stringPtr("General service"), stringPtr("A"), intPtr(15))
	if err != nil {
		return err
	}
	fmt.Printf("Service: %s (ID: %s)\n", serviceA.Name, serviceA.ID)

	serviceB, err := ensureService(unit.ID, "Service B", stringPtr("Услуга Б"), stringPtr("Service B"), stringPtr("Premium service"), stringPtr("B"), intPtr(30))
	if err != nil {
		return err
	}
	fmt.Printf("Service: %s (ID: %s)\n", serviceB.Name, serviceB.ID)

	if _, err := ensureCounter(unit.ID, "Counter 1"); err != nil {
		return err
	}
	if _, err := ensureCounter(unit.ID, "Counter 2"); err != nil {
		return err
	}
	fmt.Println("Counters: Counter 1, Counter 2")

	// Idempotent reset: stale assignments (manual QA / prior E2E) would skip the workstation
	// directory and redirect operators straight to /staff/:unitId/:counterId.
	if err := database.DB.Model(&models.Counter{}).
		Where("unit_id = ?", unit.ID).
		Update("assigned_to", nil).Error; err != nil {
		return fmt.Errorf("clear counter assignments: %w", err)
	}

	if err := ensureSampleTickets(unit.ID, serviceA.ID, serviceB.ID); err != nil {
		return err
	}
	fmt.Println("Sample tickets: A001, B001, A002 (skipped if already present)")

	return nil
}

func ensureCompany() (models.Company, error) {
	var c models.Company
	err := database.DB.Where("name = ? AND is_saas_operator = ?", seedCompanyName, true).First(&c).Error
	if err == nil {
		return c, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return c, err
	}
	c = models.Company{Name: seedCompanyName, IsSaaSOperator: true}
	if err := database.DB.Create(&c).Error; err != nil {
		return c, err
	}
	fmt.Println("Created company")
	return c, nil
}

func ensureUnit(companyID string) (models.Unit, error) {
	var u models.Unit
	err := database.DB.Where(models.Unit{Code: seedUnitCode}).First(&u).Error
	if err == nil {
		if u.Kind == "workplace" || u.Kind == "" {
			if err := database.DB.Model(&u).Update("kind", models.UnitKindSubdivision).Error; err != nil {
				return u, err
			}
			u.Kind = models.UnitKindSubdivision
		}
		return u, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return u, err
	}
	u = models.Unit{
		CompanyID: companyID,
		Name:      "Main Office",
		Code:      seedUnitCode,
		Kind:      models.UnitKindSubdivision,
		Timezone:  "Europe/Moscow",
	}
	if err := database.DB.Create(&u).Error; err != nil {
		return u, err
	}
	fmt.Println("Created unit")
	return u, nil
}

func ensureRole(name string) (models.Role, error) {
	var r models.Role
	err := database.DB.Where(models.Role{Name: name}).First(&r).Error
	if err == nil {
		return r, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return r, err
	}
	r = models.Role{Name: name}
	if err := database.DB.Create(&r).Error; err != nil {
		return r, err
	}
	fmt.Printf("Created role: %s\n", name)
	return r, nil
}

func ensureAdminUser() (models.User, error) {
	return ensurePasswordUser("Admin User", adminEmail, "admin123")
}

func ensureOperatorUser() (models.User, error) {
	return ensurePasswordUser("Operator User", operatorEmail, "operator123")
}

func ensurePasswordUser(name, email, plainPassword string) (models.User, error) {
	var u models.User
	err := database.DB.Where("email = ?", email).First(&u).Error
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return u, err
	}
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(plainPassword), bcrypt.DefaultCost)
	if err != nil {
		return u, err
	}
	hashedStr := string(hashedPassword)
	emailCopy := email
	u = models.User{
		Name:     name,
		Email:    &emailCopy,
		Password: &hashedStr,
	}
	if err := database.DB.Create(&u).Error; err != nil {
		return u, err
	}
	fmt.Printf("Created user: %s\n", email)
	return u, nil
}

func ensureUserRole(userID, roleID string) {
	var n int64
	database.DB.Model(&models.UserRole{}).Where("user_id = ? AND role_id = ?", userID, roleID).Count(&n)
	if n > 0 {
		return
	}
	database.DB.Create(&models.UserRole{UserID: userID, RoleID: roleID})
	fmt.Printf("Linked user %s to role %s\n", userID, roleID)
}

func ensureUserUnit(userID, unitID string) {
	var n int64
	database.DB.Model(&models.UserUnit{}).Where("user_id = ? AND unit_id = ?", userID, unitID).Count(&n)
	if n > 0 {
		return
	}
	database.DB.Create(&models.UserUnit{UserID: userID, UnitID: unitID})
	fmt.Printf("Linked user %s to unit %s\n", userID, unitID)
}

func ensureService(
	unitID, name string,
	nameRu, nameEn, description, prefix *string,
	duration *int,
) (models.Service, error) {
	var s models.Service
	err := database.DB.Where("unit_id = ? AND name = ?", unitID, name).First(&s).Error
	if err == nil {
		return s, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return s, err
	}
	s = models.Service{
		UnitID:      unitID,
		Name:        name,
		NameRu:      nameRu,
		NameEn:      nameEn,
		Description: description,
		Prefix:      prefix,
		Duration:    duration,
		IsLeaf:      true,
	}
	if err := database.DB.Create(&s).Error; err != nil {
		return s, err
	}
	fmt.Printf("Created service: %s\n", name)
	return s, nil
}

func ensureCounter(unitID, name string) (models.Counter, error) {
	var c models.Counter
	err := database.DB.Where("unit_id = ? AND name = ?", unitID, name).First(&c).Error
	if err == nil {
		return c, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return c, err
	}
	c = models.Counter{UnitID: unitID, Name: name}
	if err := database.DB.Create(&c).Error; err != nil {
		return c, err
	}
	fmt.Printf("Created counter: %s\n", name)
	return c, nil
}

func ensureSampleTickets(unitID, serviceAID, serviceBID string) error {
	type ticketSeed struct {
		queue   string
		svcID   string
		created time.Duration
	}
	seeds := []ticketSeed{
		{"A001", serviceAID, 0},
		{"B001", serviceBID, time.Minute},
		{"A002", serviceAID, 2 * time.Minute},
	}
	now := time.Now()
	for _, t := range seeds {
		var n int64
		database.DB.Model(&models.Ticket{}).
			Where("unit_id = ? AND queue_number = ?", unitID, t.queue).
			Count(&n)
		if n > 0 {
			continue
		}
		tk := models.Ticket{
			UnitID:      unitID,
			ServiceID:   t.svcID,
			QueueNumber: t.queue,
			Status:      "waiting",
			CreatedAt:   now.Add(t.created),
		}
		if err := database.DB.Create(&tk).Error; err != nil {
			return err
		}
		fmt.Printf("Created ticket %s\n", t.queue)
	}
	return nil
}

func stringPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}
