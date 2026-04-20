package services

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
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
	// SMTP is informational for the wizard; failures do not set allOK=false above.

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
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return SetupHealthCheck{OK: false, Message: fmt.Sprintf("invalid SMTP_PORT %q (must be a number 1-65535)", portStr)}
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	secure := strings.EqualFold(strings.TrimSpace(os.Getenv("SMTP_SECURE")), "true")

	if err := smtpDialAndAuth(ctx, host, port, user, pass, secure); err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return SetupHealthCheck{OK: false, Message: "timeout or cancelled"}
		}
		return SetupHealthCheck{OK: false, Message: err.Error()}
	}
	return SetupHealthCheck{OK: true}
}

func smtpOpDeadline(ctx context.Context) time.Time {
	if dl, ok := ctx.Deadline(); ok {
		return dl
	}
	return time.Now().Add(10 * time.Second)
}

func smtpTLSConfig(host string) *tls.Config {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: host}
	if os.Getenv("SMTP_TLS_INSECURE_SKIP_VERIFY") == "true" {
		cfg.InsecureSkipVerify = true
	}
	return cfg
}

func smtpDialAndAuth(ctx context.Context, host string, port int, user, pass string, ssl bool) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	deadline := smtpOpDeadline(ctx)

	dialTimeout := time.Until(deadline)
	if dialTimeout < time.Second {
		dialTimeout = time.Second
	}
	if dialTimeout > 10*time.Second {
		dialTimeout = 10 * time.Second
	}
	d := net.Dialer{Timeout: dialTimeout}
	rawConn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}

	tlsCfg := smtpTLSConfig(host)

	if ssl || port == 465 {
		if err := rawConn.SetDeadline(deadline); err != nil {
			_ = rawConn.Close()
			return err
		}
		tlsConn := tls.Client(rawConn, tlsCfg)
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			_ = tlsConn.Close()
			return err
		}
		if err := tlsConn.SetDeadline(deadline); err != nil {
			_ = tlsConn.Close()
			return err
		}
		c, err := smtp.NewClient(tlsConn, host)
		if err != nil {
			return err
		}
		defer func() { _ = c.Close() }()
		if user != "" {
			if err := c.Auth(smtp.PlainAuth("", user, pass, host)); err != nil {
				return err
			}
		}
		return nil
	}

	if err := rawConn.SetDeadline(deadline); err != nil {
		_ = rawConn.Close()
		return err
	}
	c, err := smtp.NewClient(rawConn, host)
	if err != nil {
		return err
	}
	defer func() { _ = c.Close() }()
	if err := c.Hello("localhost"); err != nil {
		return err
	}
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(tlsCfg); err != nil {
			return err
		}
	}
	if user != "" {
		if err := c.Auth(smtp.PlainAuth("", user, pass, host)); err != nil {
			return err
		}
	}
	return nil
}
