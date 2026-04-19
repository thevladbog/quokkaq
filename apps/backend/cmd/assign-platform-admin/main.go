// Command: assign-platform-admin assigns the platform_admin role to an existing user by email.
//
// Usage:
//
//	go run ./cmd/assign-platform-admin --email=user@example.com
//
// Requires DATABASE_URL (via config.Load).
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"quokkaq-go-backend/internal/logger"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

func main() {
	email := flag.String("email", "", "user email (required)")
	flag.Parse()
	if *email == "" {
		fmt.Fprintln(os.Stderr, "usage: assign-platform-admin -email=user@example.com")
		os.Exit(1)
	}
	if err := run(*email); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(email string) error {
	config.Load()
	logger.Init()
	if err := database.Connect(); err != nil {
		return err
	}

	var role models.Role
	if err := database.DB.Where("name = ?", "platform_admin").First(&role).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			role = models.Role{Name: "platform_admin"}
			if err := database.DB.Create(&role).Error; err != nil {
				logger.Error("create platform_admin role", "err", err)
				return fmt.Errorf("create platform_admin role: %w", err)
			}
			fmt.Println("Created role platform_admin")
		} else {
			logger.Error("lookup platform_admin role", "err", err)
			return fmt.Errorf("lookup platform_admin role: %w", err)
		}
	}

	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			err := fmt.Errorf("no user with email %q", email)
			logger.Error(err.Error())
			return err
		}
		logger.Error("lookup user", "err", err)
		return fmt.Errorf("lookup user: %w", err)
	}

	var existing int64
	if err := database.DB.Model(&models.UserRole{}).
		Where("user_id = ? AND role_id = ?", user.ID, role.ID).
		Count(&existing).Error; err != nil {
		logger.Error("check user_roles", "err", err)
		return fmt.Errorf("check user_roles: %w", err)
	}
	if existing > 0 {
		fmt.Printf("User %s already has platform_admin\n", email)
		return nil
	}

	if err := database.DB.Create(&models.UserRole{UserID: user.ID, RoleID: role.ID}).Error; err != nil {
		logger.Error("assign role", "err", err)
		return fmt.Errorf("assign role: %w", err)
	}
	fmt.Printf("Assigned platform_admin to %s (%s)\n", email, user.ID)
	return nil
}
