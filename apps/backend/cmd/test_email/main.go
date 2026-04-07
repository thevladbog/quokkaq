package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"gopkg.in/gomail.v2"
)

func main() {
	// Load .env file
	if err := godotenv.Load("../../.env"); err != nil {
		log.Println("Warning: .env file not found or could not be loaded. Using environment variables.")
	}

	host := os.Getenv("SMTP_HOST")
	portStr := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("SMTP_FROM")
	secureStr := os.Getenv("SMTP_SECURE")

	fmt.Println("--- SMTP Configuration Test ---")
	fmt.Printf("Host: %s\n", host)
	fmt.Printf("Port: %s\n", portStr)
	fmt.Printf("User: %s\n", user)
	fmt.Printf("Secure: %s\n", secureStr)
	fmt.Println("-------------------------------")

	if host == "" {
		log.Fatal("SMTP_HOST is not set")
	}

	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 587
	}

	d := gomail.NewDialer(host, port, user, pass)

	if secureStr == "true" {
		d.SSL = true
		fmt.Println("Configuring for Implicit SSL/TLS (usually port 465)")
	} else if secureStr == "false" {
		d.SSL = false
		d.TLSConfig = &tls.Config{InsecureSkipVerify: true}
		fmt.Println("Configuring for STARTTLS (usually port 587) with InsecureSkipVerify")
	} else {
		fmt.Println("SMTP_SECURE not set or invalid, using default (STARTTLS if supported)")
	}

	m := gomail.NewMessage()
	if from == "" {
		from = "test@quokkaq.com"
	}
	m.SetHeader("From", from)
	m.SetHeader("To", user) // Send to self for testing
	m.SetHeader("Subject", "QuokkaQ SMTP Test")
	m.SetBody("text/plain", "If you received this, your SMTP configuration is correct!")

	fmt.Println("Attempting to send test email...")
	if err := d.DialAndSend(m); err != nil {
		log.Fatalf("Failed to send email: %v", err)
	}

	fmt.Println("SUCCESS! Email sent successfully.")
}
