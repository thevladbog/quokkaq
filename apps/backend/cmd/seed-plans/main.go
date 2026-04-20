package main

import (
	"fmt"
	"os"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/subscriptionplanseed"
	"quokkaq-go-backend/pkg/database"
)

func main() {
	config.Load()
	logger.Init()
	if err := database.Connect(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println("Seeding subscription plans...")

	if err := subscriptionplanseed.UpsertSubscriptionPlans(database.DB); err != nil {
		logger.Error("subscription plan seed failed", "err", err)
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println("Subscription plans seeding completed!")
}
