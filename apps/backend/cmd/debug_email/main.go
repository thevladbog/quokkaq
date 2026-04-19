package main

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"os"
	"quokkaq-go-backend/internal/logger"

	"github.com/joho/godotenv"
)

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

func run() error {
	// Try loading .env from current directory first (if running from root)
	if err := godotenv.Load(); err != nil {
		// If failed, try loading from two levels up (if running from cmd/debug_email)
		if err := godotenv.Load("../../.env"); err != nil {
			fmt.Fprintln(os.Stderr, "Warning: .env file not found or could not be loaded.")
		}
	}
	logger.Init()

	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("SMTP_FROM")

	var client *smtp.Client
	var err error

	// Strategy 1: Implicit TLS (Port 465)
	// We try this if port is explicitly 465, or as a first attempt
	if port == "465" {
		addr := fmt.Sprintf("%s:%s", host, port)
		fmt.Printf("Diagnosing connection to %s (Implicit TLS)...\n", addr)
		fmt.Println("[1/4] Testing TCP connection...")

		tlsConfig := &tls.Config{InsecureSkipVerify: false, ServerName: host}
		var conn *tls.Conn
		conn, err = tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			fmt.Printf("   ❌ Port 465 failed: %v\n", err)
			fmt.Println("   > Will attempt fallback to Port 587...")
		} else {
			fmt.Println("   ✅ TLS Connection established on 465!")
			fmt.Println("[2/4] Starting SMTP handshake...")
			client, err = smtp.NewClient(conn, host)
			if err != nil {
				fmt.Printf("❌ SMTP Handshake failed: %v\n", err)
				if closeErr := conn.Close(); closeErr != nil {
					fmt.Printf("   Warning: Failed to close connection: %v\n", closeErr)
				}
				client = nil
			}
		}
	}

	// Strategy 2: STARTTLS (Port 587)
	// Run this if client is still nil (either port wasn't 465, or 465 failed)
	if client == nil {
		// Force port to 587 for this attempt
		fallbackPort := "587"
		addr := fmt.Sprintf("%s:%s", host, fallbackPort)
		fmt.Printf("Diagnosing connection to %s (STARTTLS)...\n", addr)

		fmt.Println("[1/4] Connecting to server...")
		// Connect to the server without TLS first
		c, dialErr := smtp.Dial(addr)
		if dialErr != nil {
			fmt.Printf("   ❌ Connection to %s failed: %v\n", addr, dialErr)
			logger.Error("all connection attempts failed", "err", dialErr)
			return fmt.Errorf("all connection attempts failed: %w", dialErr)
		}
		fmt.Println("   ✅ Connected to server!")

		// Send EHLO
		if err := c.Hello("localhost"); err != nil {
			fmt.Printf("   ❌ Hello failed: %v\n", err)
			return fmt.Errorf("smtp Hello: %w", err)
		}

		// Start TLS
		tlsConfig := &tls.Config{ServerName: host}
		if ok, _ := c.Extension("STARTTLS"); ok {
			fmt.Println("   > Server supports STARTTLS, upgrading...")
			if err := c.StartTLS(tlsConfig); err != nil {
				fmt.Printf("   ❌ StartTLS failed: %v\n", err)
				return fmt.Errorf("smtp StartTLS: %w", err)
			}
			fmt.Println("   ✅ TLS upgrade successful!")
		} else {
			fmt.Println("   ⚠️ Server does not support STARTTLS, proceeding insecurely (not recommended)...")
		}
		client = c
	}

	defer func() {
		if err := client.Quit(); err != nil {
			fmt.Printf("Warning: Failed to quit SMTP client: %v\n", err)
		}
	}()
	fmt.Println("✅ SMTP Handshake successful!")

	// 3. Authenticate
	fmt.Println("[3/4] Authenticating...")
	auth := smtp.PlainAuth("", user, pass, host)
	if err := client.Auth(auth); err != nil {
		fmt.Printf("❌ Authentication failed: %v\n", err)
		return fmt.Errorf("smtp Auth: %w", err)
	}
	fmt.Println("✅ Authentication successful!")

	// 4. Send Email
	fmt.Println("[4/4] Sending test email...")
	if err := client.Mail(from); err != nil {
		fmt.Printf("❌ MAIL FROM failed: %v\n", err)
		return fmt.Errorf("smtp Mail: %w", err)
	}
	if err := client.Rcpt(user); err != nil {
		fmt.Printf("❌ RCPT TO failed: %v\n", err)
		return fmt.Errorf("smtp Rcpt: %w", err)
	}
	wc, err := client.Data()
	if err != nil {
		fmt.Printf("❌ DATA command failed: %v\n", err)
		return fmt.Errorf("smtp Data: %w", err)
	}

	msg := []byte("To: " + user + "\r\n" +
		"Subject: QuokkaQ Diagnostic Email\r\n" +
		"\r\n" +
		"This is a test email from the diagnostic script.\r\n")

	if _, err = wc.Write(msg); err != nil {
		fmt.Printf("❌ Writing body failed: %v\n", err)
		return fmt.Errorf("write body: %w", err)
	}
	if err = wc.Close(); err != nil {
		fmt.Printf("❌ Closing data failed: %v\n", err)
		return fmt.Errorf("close data writer: %w", err)
	}

	fmt.Println("✅ Email sent successfully!")
	return nil
}
