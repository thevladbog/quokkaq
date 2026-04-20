package services

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"quokkaq-go-backend/internal/sso/redisstore"
	"quokkaq-go-backend/pkg/database"
)

// SetupHealthCheck is one dependency probe for the first-run wizard.
type SetupHealthCheck struct {
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
}

// SetupHealthReport is returned by GET /system/health.
type SetupHealthReport struct {
	OK     bool                        `json:"ok"`
	Checks map[string]SetupHealthCheck `json:"checks"`
}

// CollectSetupHealth runs postgres, redis, S3, and SMTP checks (SMTP failure is non-fatal for overall OK).
func CollectSetupHealth(ctx context.Context, storage StorageService) SetupHealthReport {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	checks := make(map[string]SetupHealthCheck)
	allOK := true

	// PostgreSQL
	if err := database.Ping(ctx); err != nil {
		checks["postgres"] = SetupHealthCheck{OK: false, Message: err.Error()}
		allOK = false
	} else {
		checks["postgres"] = SetupHealthCheck{OK: true}
	}

	// Redis (same client as SSO / shared store; optional when disabled)
	rc := redisstore.Client()
	if rc == nil {
		checks["redis"] = SetupHealthCheck{OK: true, Message: "skipped (redis client disabled or unavailable)"}
	} else if err := rc.Ping(ctx).Err(); err != nil {
		checks["redis"] = SetupHealthCheck{OK: false, Message: err.Error()}
		allOK = false
	} else {
		checks["redis"] = SetupHealthCheck{OK: true}
	}

	// S3 / MinIO
	if storage == nil {
		checks["s3"] = SetupHealthCheck{OK: false, Message: "storage service unavailable"}
		allOK = false
	} else if err := storage.S3Ping(ctx); err != nil {
		checks["s3"] = SetupHealthCheck{OK: false, Message: err.Error()}
		allOK = false
	} else {
		checks["s3"] = SetupHealthCheck{OK: true}
	}

	smtpRes := checkSMTP(ctx)
	checks["smtp"] = smtpRes
	if !smtpRes.OK {
		// SMTP issues are warnings for the wizard; do not fail overall readiness.
	}

	return SetupHealthReport{OK: allOK, Checks: checks}
}

func checkSMTP(ctx context.Context) SetupHealthCheck {
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	if host == "" {
		return SetupHealthCheck{OK: true, Message: "not configured (optional)"}
	}
	portStr := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	if portStr == "" {
		portStr = "587"
	}
	port, _ := strconv.Atoi(portStr)
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	secure := strings.EqualFold(strings.TrimSpace(os.Getenv("SMTP_SECURE")), "true")

	type res struct {
		err error
	}
	ch := make(chan res, 1)
	go func() {
		ch <- res{err: smtpDialAndAuth(host, port, user, pass, secure)}
	}()
	select {
	case <-ctx.Done():
		return SetupHealthCheck{OK: false, Message: "timeout or cancelled"}
	case r := <-ch:
		if r.err != nil {
			return SetupHealthCheck{OK: false, Message: r.err.Error()}
		}
		return SetupHealthCheck{OK: true}
	}
}

func smtpDialAndAuth(host string, port int, user, pass string, ssl bool) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: host}
	if os.Getenv("SMTP_TLS_INSECURE_SKIP_VERIFY") == "true" {
		tlsCfg.InsecureSkipVerify = true
	}

	if ssl || port == 465 {
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return err
		}
		defer conn.Close()
		c, err := smtp.NewClient(conn, host)
		if err != nil {
			return err
		}
		defer c.Close()
		if user != "" {
			auth := smtp.PlainAuth("", user, pass, host)
			if err := c.Auth(auth); err != nil {
				return err
			}
		}
		return nil
	}

	c, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer c.Close()
	if err := c.Hello("localhost"); err != nil {
		return err
	}
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(tlsCfg); err != nil {
			return err
		}
	}
	if user != "" {
		auth := smtp.PlainAuth("", user, pass, host)
		if err := c.Auth(auth); err != nil {
			return err
		}
	}
	return nil
}
