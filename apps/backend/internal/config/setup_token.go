package config

import (
	"crypto/subtle"
	"os"
	"strings"
)

// SetupTokenStrictEnv is true when first-run setup routes must enforce SETUP_TOKEN.
func SetupTokenStrictEnv() bool {
	app := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return app == "production" || app == "staging"
}

// SetupTokenConfigured returns true when SETUP_TOKEN is non-empty (trimmed).
func SetupTokenConfigured() bool {
	return strings.TrimSpace(os.Getenv("SETUP_TOKEN")) != ""
}

// SetupTokenStrictAndMissing returns true when APP_ENV requires a token but SETUP_TOKEN is empty.
func SetupTokenStrictAndMissing() bool {
	return SetupTokenStrictEnv() && !SetupTokenConfigured()
}

// SetupTokenMatches compares the header value to SETUP_TOKEN using constant-time equality.
// When SetupTokenStrictEnv is false, returns true (token not required in dev).
func SetupTokenMatches(headerValue string) bool {
	if !SetupTokenStrictEnv() {
		return true
	}
	want := strings.TrimSpace(os.Getenv("SETUP_TOKEN"))
	if want == "" {
		return false
	}
	got := strings.TrimSpace(headerValue)
	return subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}
