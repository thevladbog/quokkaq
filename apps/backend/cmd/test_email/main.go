package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"quokkaq-go-backend/internal/services"
)

func main() {
	// Load .env file
	if err := godotenv.Load("../../.env"); err != nil {
		log.Println("Warning: .env file not found or could not be loaded. Using environment variables.")
	}

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
		log.Fatal("SMTP_HOST is not set")
	}

	// Align with NewMailService(): STARTTLS / port 587 setups need explicit opt-in for self-signed certs.
	if secureStr == "false" && os.Getenv("SMTP_TLS_INSECURE_SKIP_VERIFY") == "" {
		if err := os.Setenv("SMTP_TLS_INSECURE_SKIP_VERIFY", "true"); err != nil {
			log.Fatalf("set SMTP_TLS_INSECURE_SKIP_VERIFY: %v", err)
		}
		log.Println("SMTP_SECURE=false: set SMTP_TLS_INSECURE_SKIP_VERIFY=true for this run (dev/self-signed SMTP). For production use a proper CA or set the flag explicitly in .env.")
	}

	if from == "" {
		_ = os.Setenv("SMTP_FROM", "test@quokkaq.com")
		log.Println("SMTP_FROM unset; using test@quokkaq.com for From header")
	}

	mail := services.NewMailService()

	fmt.Println("Attempting to send test email...")
	if err := mail.SendMail(user, "QuokkaQ SMTP Test", "If you received this, your SMTP configuration is correct!"); err != nil {
		log.Fatalf("Failed to send email: %v", err)
	}

	fmt.Println("SUCCESS! Email sent successfully.")
}
