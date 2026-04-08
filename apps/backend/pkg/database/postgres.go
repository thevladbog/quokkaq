package database

import (
	"fmt"
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		host := os.Getenv("DB_HOST")
		user := os.Getenv("DB_USER")
		password := os.Getenv("DB_PASSWORD")
		dbname := os.Getenv("DB_NAME")
		port := os.Getenv("DB_PORT")
		sslmode := os.Getenv("DB_SSLMODE")

		if host != "" && user != "" && dbname != "" {
			if port == "" {
				port = "5432"
			}
			if sslmode == "" {
				sslmode = "disable"
			}
			// Use Key/Value format which is safer for special characters in passwords
			dsn = fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
				host, user, password, dbname, port, sslmode)
		}
	}

	if dsn == "" {
		log.Fatal("DATABASE_URL or DB_* environment variables are not set")
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Silent), // Suppress migration logs
		DisableForeignKeyConstraintWhenMigrating: true,                                  // Disable FK constraints during migration
	})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	fmt.Println("Database connected successfully")
}

// AutoMigrate runs auto-migrations for the given models
// This is kept for backward compatibility but should be replaced with versioned migrations
func AutoMigrate(models ...interface{}) {
	err := DB.AutoMigrate(models...)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}
	fmt.Println("Database migration completed")
}

// RunVersionedMigrations initializes migration tracking and runs all migrations
func RunVersionedMigrations(models ...interface{}) error {
	fmt.Println("Initializing migration system...")
	
	// Create migration manager
	manager := NewMigrationManager(DB)
	
	// Initialize migration tracking table
	if err := manager.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize migration tracking: %w", err)
	}

	// Run all tables migration
	err := manager.RunMigration("v1.0.0_core_tables", func(db *gorm.DB) error {
		return db.AutoMigrate(models...)
	})
	
	if err != nil {
		return fmt.Errorf("failed to run core tables migration: %w", err)
	}

	fmt.Println("All migrations completed successfully")
	return nil
}
