package services

import (
	"os"
	"testing"
)

func TestNewMailService_InsecureSkipVerifyWhenEnvTrue(t *testing.T) {
	t.Setenv("SMTP_HOST", "127.0.0.1")
	t.Setenv("SMTP_PORT", "587")
	t.Setenv("SMTP_USER", "u")
	t.Setenv("SMTP_PASS", "p")
	t.Setenv("SMTP_FROM", "f@example.com")
	t.Setenv("SMTP_SECURE", "false")
	t.Setenv("SMTP_TLS_INSECURE_SKIP_VERIFY", "true")
	t.Cleanup(func() { _ = os.Unsetenv("SMTP_TLS_INSECURE_SKIP_VERIFY") })

	ms, ok := NewMailService().(*mailService)
	if !ok {
		t.Fatal("expected *mailService")
	}
	if ms.dialer == nil {
		t.Fatal("expected dialer")
	}
	if ms.dialer.TLSConfig == nil || !ms.dialer.TLSConfig.InsecureSkipVerify {
		t.Fatal("expected TLS InsecureSkipVerify when SMTP_TLS_INSECURE_SKIP_VERIFY=true")
	}
}

func TestNewMailService_NoInsecureSkipVerifyWithoutEnv(t *testing.T) {
	t.Setenv("SMTP_HOST", "127.0.0.1")
	t.Setenv("SMTP_PORT", "587")
	t.Setenv("SMTP_USER", "u")
	t.Setenv("SMTP_PASS", "p")
	t.Setenv("SMTP_FROM", "f@example.com")
	t.Setenv("SMTP_SECURE", "false")
	_ = os.Unsetenv("SMTP_TLS_INSECURE_SKIP_VERIFY")

	ms, ok := NewMailService().(*mailService)
	if !ok {
		t.Fatal("expected *mailService")
	}
	if ms.dialer == nil {
		t.Fatal("expected dialer")
	}
	if ms.dialer.TLSConfig != nil && ms.dialer.TLSConfig.InsecureSkipVerify {
		t.Fatal("did not expect InsecureSkipVerify without SMTP_TLS_INSECURE_SKIP_VERIFY")
	}
}
