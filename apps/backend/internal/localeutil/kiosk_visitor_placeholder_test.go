package localeutil

import (
	"errors"
	"testing"
)

func TestUnknownVisitorPlaceholderNames(t *testing.T) {
	t.Parallel()
	fn, ln, err := UnknownVisitorPlaceholderNames("ru")
	if err != nil || fn != "Неизвестно" || ln != "Неизвестно" {
		t.Fatalf("ru: got %q %q err=%v", fn, ln, err)
	}
	fn, ln, err = UnknownVisitorPlaceholderNames("EN")
	if err != nil || fn != "Unknown" || ln != "Unknown" {
		t.Fatalf("en: got %q %q err=%v", fn, ln, err)
	}
	_, _, err = UnknownVisitorPlaceholderNames("")
	if !errors.Is(err, ErrKioskVisitorLocaleInvalid) {
		t.Fatalf("empty: want ErrKioskVisitorLocaleInvalid, got %v", err)
	}
	_, _, err = UnknownVisitorPlaceholderNames("de")
	if !errors.Is(err, ErrKioskVisitorLocaleInvalid) {
		t.Fatalf("de: want ErrKioskVisitorLocaleInvalid, got %v", err)
	}
}
