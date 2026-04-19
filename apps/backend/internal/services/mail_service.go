package services

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"os"
	"quokkaq-go-backend/internal/logger"
	"strconv"
	"strings"

	"gopkg.in/gomail.v2"
)

type MailService interface {
	SendMail(to string, subject string, html string) error
}

type mailService struct {
	dialer *gomail.Dialer
	from   string
}

func NewMailService() MailService {
	host := os.Getenv("SMTP_HOST")
	portStr := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("SMTP_FROM")
	secureStr := os.Getenv("SMTP_SECURE")

	if host == "" {
		logger.Println("SMTP_HOST not configured. MailService will log emails instead of sending.")
		return &mailService{dialer: nil, from: from}
	}

	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 587
	}

	d := gomail.NewDialer(host, port, user, pass)

	// Explicitly handle SSL/TLS based on configuration
	switch secureStr {
	case "true":
		d.SSL = true
	case "false":
		d.SSL = false
	}

	// Only for dev/self-signed SMTP; never enable in production without understanding the risk.
	if os.Getenv("SMTP_TLS_INSECURE_SKIP_VERIFY") == "true" {
		if d.TLSConfig == nil {
			d.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
		}
		d.TLSConfig.InsecureSkipVerify = true
	}

	logger.Printf("SMTP Configured: Host=%s, Port=%d, User=%s, SSL=%v", host, port, user, d.SSL)

	return &mailService{dialer: d, from: from}
}

// recipientLogRef is a stable short hex digest for correlating logs without logging the raw address.
func recipientLogRef(email string) string {
	s := strings.TrimSpace(strings.ToLower(email))
	if s == "" {
		return "(empty)"
	}
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:8])
}

func (s *mailService) SendMail(to string, subject string, html string) error {
	if s.dialer == nil {
		logger.Printf("Mock Send Mail -> to_ref=%s, Subject: %s, Body: %s\n", recipientLogRef(to), subject, html)
		return nil
	}

	m := gomail.NewMessage()
	if s.from == "" {
		m.SetHeader("From", "noreply@quokkaq.com")
	} else {
		m.SetHeader("From", s.from)
	}
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", html)

	if err := s.dialer.DialAndSend(m); err != nil {
		logger.Printf("Error sending email to %s: %v\n", to, err)
		return err
	}

	logger.Debugf("Email sent to_ref=%s\n", recipientLogRef(to))
	return nil
}
