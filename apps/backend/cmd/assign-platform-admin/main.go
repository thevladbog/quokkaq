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
	"log"
	"os"

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

	config.Load()
	database.Connect()

	var role models.Role
	if err := database.DB.Where("name = ?", "platform_admin").First(&role).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			role = models.Role{Name: "platform_admin"}
			if err := database.DB.Create(&role).Error; err != nil {
				log.Fatalf("create platform_admin role: %v", err)
			}
			fmt.Println("Created role platform_admin")
		} else {
			log.Fatalf("lookup platform_admin role: %v", err)
		}
	}

	var user models.User
	if err := database.DB.Where("email = ?", *email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Fatalf("no user with email %q", *email)
		}
		log.Fatalf("lookup user: %v", err)
	}

	var existing int64
	if err := database.DB.Model(&models.UserRole{}).
		Where("user_id = ? AND role_id = ?", user.ID, role.ID).
		Count(&existing).Error; err != nil {
		log.Fatalf("check user_roles: %v", err)
	}
	if existing > 0 {
		fmt.Printf("User %s already has platform_admin\n", *email)
		return
	}

	if err := database.DB.Create(&models.UserRole{UserID: user.ID, RoleID: role.ID}).Error; err != nil {
		log.Fatalf("assign role: %v", err)
	}
	fmt.Printf("Assigned platform_admin to %s (%s)\n", *email, user.ID)
}
