package services

import "testing"

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
	if err == nil {
		t.Fatal("want error for //")
	}
	_, err = SanitizeInternalReturnPath("https://evil.example/phish")
	if err == nil {
		t.Fatal("want error for absolute URL")
	}
	_, err = SanitizeInternalReturnPath("/../etc/passwd")
	if err == nil {
		t.Fatal("want error for traversal")
	}
}
