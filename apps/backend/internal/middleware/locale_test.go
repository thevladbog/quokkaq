package middleware

import "testing"

func TestLocaleFromAcceptLanguage(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"", "en"},
		{"en", "en"},
		{"en-US", "en"},
		{"en-US;q=0.9,ru;q=0.8", "en"},
		{"ru", "ru"},
		{"ru-RU", "ru"},
		{"RU-ru", "ru"},
		{"  ru-RU ; q=0.9 ", "ru"},
		{"fr", "en"},
	}
	for _, tt := range tests {
		if got := LocaleFromAcceptLanguage(tt.in); got != tt.want {
			t.Errorf("LocaleFromAcceptLanguage(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
