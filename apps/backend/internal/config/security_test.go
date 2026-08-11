package config

import (
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestJWTSecretFailsClosedWhenMissingOrBelowMinimumLength(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	if _, err := JWTSecret(); err == nil {
		t.Fatal("expected missing JWT_SECRET to fail")
	}

	t.Setenv("JWT_SECRET", "known-dev-secret")
	if _, err := JWTSecret(); err == nil {
		t.Fatal("expected below-minimum JWT_SECRET to fail")
	}
}

func TestJWTSecretAcceptsMinimumLengthSecret(t *testing.T) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		t.Fatal(err)
	}
	secret := base64.RawURLEncoding.EncodeToString(raw)
	t.Setenv("JWT_SECRET", secret)
	got, err := JWTSecret()
	if err != nil {
		t.Fatalf("JWTSecret() error = %v", err)
	}
	if got != secret {
		t.Fatalf("JWTSecret() did not return configured secret")
	}
}

func TestAllowsInsecureDevTLSRequiresExplicitDevelopmentEnvironment(t *testing.T) {
	for _, env := range []string{"", "production", "staging"} {
		t.Setenv("APP_ENV", env)
		if AllowsInsecureDevTLS() {
			t.Errorf("APP_ENV=%q unexpectedly allowed insecure TLS", env)
		}
	}
	t.Setenv("APP_ENV", "development")
	if !AllowsInsecureDevTLS() {
		t.Fatal("development should allow explicitly opted-in insecure TLS")
	}
}
