package config

import (
	"os"
	"testing"
)

func TestAppEnvAllowsYooKassaDevReturnURLFallback(t *testing.T) {
	orig, hadOrig := os.LookupEnv("APP_ENV")
	t.Cleanup(func() {
		if !hadOrig {
			_ = os.Unsetenv("APP_ENV")
			return
		}
		_ = os.Setenv("APP_ENV", orig)
	})

	cases := []struct {
		env  string
		want bool
	}{
		{"", false},
		{"   ", false},
		{"development", true},
		{"dev", true},
		{"local", true},
		{"production", false},
		{"staging", false},
		{"Development", true},
		{"random", false},
	}
	for _, tc := range cases {
		if err := os.Setenv("APP_ENV", tc.env); err != nil {
			t.Fatal(err)
		}
		if got := AppEnvAllowsYooKassaDevReturnURLFallback(); got != tc.want {
			t.Errorf("APP_ENV=%q: got %v want %v", tc.env, got, tc.want)
		}
	}
}

func TestExposePublicLeadUpstreamError(t *testing.T) {
	origApp, hadApp := os.LookupEnv("APP_ENV")
	origDbg, hadDbg := os.LookupEnv("PUBLIC_LEAD_DEBUG")
	t.Cleanup(func() {
		if !hadApp {
			_ = os.Unsetenv("APP_ENV")
		} else {
			_ = os.Setenv("APP_ENV", origApp)
		}
		if !hadDbg {
			_ = os.Unsetenv("PUBLIC_LEAD_DEBUG")
		} else {
			_ = os.Setenv("PUBLIC_LEAD_DEBUG", origDbg)
		}
	})

	_ = os.Unsetenv("PUBLIC_LEAD_DEBUG")
	_ = os.Setenv("APP_ENV", "development")
	if !ExposePublicLeadUpstreamError() {
		t.Fatal("want true when APP_ENV=development")
	}
	_ = os.Setenv("APP_ENV", "production")
	if ExposePublicLeadUpstreamError() {
		t.Fatal("want false when APP_ENV=production")
	}
	_ = os.Setenv("APP_ENV", "production")
	_ = os.Setenv("PUBLIC_LEAD_DEBUG", "1")
	if ExposePublicLeadUpstreamError() {
		t.Fatal("want false when APP_ENV=production even if PUBLIC_LEAD_DEBUG=1")
	}
}
