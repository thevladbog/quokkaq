package services

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCheckSMTP_InvalidPort(t *testing.T) {
	t.Setenv("SMTP_HOST", "example.test")
	t.Setenv("SMTP_PORT", "nope")
	ctx := context.Background()
	got := checkSMTP(ctx)
	if got.OK {
		t.Fatalf("expected failure for non-numeric port, got %+v", got)
	}
	if !strings.Contains(got.Message, "invalid SMTP_PORT") {
		t.Fatalf("message should mention invalid port, got %q", got.Message)
	}
}

func TestCheckSMTP_PortOutOfRange(t *testing.T) {
	t.Setenv("SMTP_HOST", "example.test")
	t.Setenv("SMTP_PORT", "99999")
	ctx := context.Background()
	got := checkSMTP(ctx)
	if got.OK {
		t.Fatalf("expected failure for out-of-range port")
	}
}

func TestCheckSMTP_NotConfigured(t *testing.T) {
	t.Setenv("SMTP_HOST", "")
	_ = os.Unsetenv("SMTP_PORT")
	ctx := context.Background()
	got := checkSMTP(ctx)
	if !got.OK {
		t.Fatalf("expected skip when host empty, got %+v", got)
	}
}

func TestCheckSMTP_ContextCancelledBeforeDial(t *testing.T) {
	t.Setenv("SMTP_HOST", "192.0.2.1") // TEST-NET-1, unlikely to respond quickly
	t.Setenv("SMTP_PORT", "587")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got := checkSMTP(ctx)
	if got.OK {
		t.Fatalf("expected failure after cancel, got %+v", got)
	}
	if got.Message != "timeout or cancelled" && !strings.Contains(strings.ToLower(got.Message), "cancel") {
		t.Fatalf("expected cancel-related message, got %q", got.Message)
	}
}

func TestSmtpOpDeadline_NoParentDeadline(t *testing.T) {
	dl := smtpOpDeadline(context.Background())
	if time.Until(dl) > 11*time.Second || time.Until(dl) < 8*time.Second {
		t.Fatalf("expected ~10s fallback deadline, until=%v", time.Until(dl))
	}
}
