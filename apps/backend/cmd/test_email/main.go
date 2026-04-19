package main

import (
	"fmt"
	"os"
	"quokkaq-go-backend/internal/logger"

	"quokkaq-go-backend/internal/services"

	"github.com/joho/godotenv"
)

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

func run() error {
	// Load .env file
	if err := godotenv.Load("../../.env"); err != nil {
		fmt.Fprintln(os.Stderr, "Warning: .env file not found or could not be loaded. Using environment variables.")
	}
	logger.Init()

	host := os.Getenv("SMTP_HOST")
	user := os.Getenv("SMTP_USER")
	from := os.Getenv("SMTP_FROM")
	secureStr := os.Getenv("SMTP_SECURE")

	fmt.Println("--- SMTP Configuration Test ---")
	fmt.Printf("Host: %s\n", host)
	fmt.Printf("Port: %s\n", os.Getenv("SMTP_PORT"))
	fmt.Printf("User: %s\n", user)
	fmt.Printf("Secure: %s\n", secureStr)
	fmt.Println("-------------------------------")

	if host == "" {
		logger.Error("SMTP_HOST is not set")
		return fmt.Errorf("SMTP_HOST is not set")
	}

	// Align with NewMailService(): STARTTLS / port 587 setups need explicit opt-in for self-signed certs.
	if secureStr == "false" && os.Getenv("SMTP_TLS_INSECURE_SKIP_VERIFY") == "" {
		if err := os.Setenv("SMTP_TLS_INSECURE_SKIP_VERIFY", "true"); err != nil {
			logger.Error("set SMTP_TLS_INSECURE_SKIP_VERIFY", "err", err)
			return fmt.Errorf("set SMTP_TLS_INSECURE_SKIP_VERIFY: %w", err)
		}
		logger.Println("SMTP_SECURE=false: set SMTP_TLS_INSECURE_SKIP_VERIFY=true for this run (dev/self-signed SMTP). For production use a proper CA or set the flag explicitly in .env.")
	}

	if from == "" {
		_ = os.Setenv("SMTP_FROM", "test@quokkaq.com")
		logger.Println("SMTP_FROM unset; using test@quokkaq.com for From header")
	}

	mail := services.NewMailService()

	fmt.Println("Attempting to send test email...")
	if err := mail.SendMail(user, "QuokkaQ SMTP Test", "If you received this, your SMTP configuration is correct!"); err != nil {
		logger.Error("Failed to send email", "err", err)
		return fmt.Errorf("failed to send email: %w", err)
	}

	fmt.Println("SUCCESS! Email sent successfully.")
	return nil
}
