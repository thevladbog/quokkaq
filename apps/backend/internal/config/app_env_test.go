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
