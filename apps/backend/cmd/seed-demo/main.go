package main

import (
	"fmt"
	"os"
	"time"

	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/demoseed"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/pkg/database"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	fmt.Println("QuokkaQ demo seed — expects empty DB after migrations + seed-plans.")
	config.Load()
	logger.Init()
	if err := database.Connect(); err != nil {
		return err
	}
	cfg := demoseed.LoadConfig()
	fmt.Printf("Anchor (unit TZ): %s, history days: %d\n", cfg.Anchor.Format(time.RFC3339), cfg.HistoryDays)
	if err := demoseed.Run(database.DB, cfg); err != nil {
		return err
	}
	fmt.Println("Demo seed completed.")
	fmt.Printf("Tenant admin: %s (password from DEMO_ADMIN_PASSWORD or default in deploy/demo README)\n", cfg.AdminEmail)
	fmt.Printf("Operator:     %s\n", cfg.OperatorEmail)
	return nil
}
