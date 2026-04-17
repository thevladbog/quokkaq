package services

import (
	"errors"
	"testing"
)

func TestSanitizeInternalReturnPath(t *testing.T) {
	t.Parallel()
	got, err := SanitizeInternalReturnPath("")
	if err != nil || got != "/settings/integrations" {
		t.Fatalf("empty: got %q err %v", got, err)
	}
	got, err = SanitizeInternalReturnPath("/ru/settings/integrations")
	if err != nil || got != "/ru/settings/integrations" {
		t.Fatalf("ok path: got %q err %v", got, err)
	}
	_, err = SanitizeInternalReturnPath("//evil")
	if err == nil || !errors.Is(err, ErrGoogleCalendarOAuthInvalidReturnPath) {
		t.Fatalf("want ErrGoogleCalendarOAuthInvalidReturnPath for //, got %v", err)
	}
	_, err = SanitizeInternalReturnPath("https://evil.example/phish")
	if err == nil || !errors.Is(err, ErrGoogleCalendarOAuthInvalidReturnPath) {
		t.Fatalf("want ErrGoogleCalendarOAuthInvalidReturnPath for absolute URL, got %v", err)
	}
	_, err = SanitizeInternalReturnPath("/../etc/passwd")
	if err == nil || !errors.Is(err, ErrGoogleCalendarOAuthInvalidReturnPath) {
		t.Fatalf("want ErrGoogleCalendarOAuthInvalidReturnPath for traversal, got %v", err)
	}
}
