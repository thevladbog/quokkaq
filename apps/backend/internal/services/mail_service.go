package services

import (
	"crypto/tls"
	"log"
	"os"
	"strconv"

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
		log.Println("SMTP_HOST not configured. MailService will log emails instead of sending.")
		return &mailService{dialer: nil, from: from}
	}

	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 587
	}

	d := gomail.NewDialer(host, port, user, pass)

	// Explicitly handle SSL/TLS based on configuration
	if secureStr == "true" {
		d.SSL = true
	} else if secureStr == "false" {
		d.SSL = false
		// For development/testing with self-signed certs or if specifically requested
		d.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}

	log.Printf("SMTP Configured: Host=%s, Port=%d, User=%s, SSL=%v", host, port, user, d.SSL)

	return &mailService{dialer: d, from: from}
}

func (s *mailService) SendMail(to string, subject string, html string) error {
	if s.dialer == nil {
		log.Printf("Mock Send Mail -> To: %s, Subject: %s, Body: %s\n", to, subject, html)
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
		log.Printf("Error sending email to %s: %v\n", to, err)
		return err
	}

	log.Printf("Email sent to %s\n", to)
	return nil
}
