package config

import "testing"

func TestJWTSecretFailsClosedWhenMissingOrWeak(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	if _, err := JWTSecret(); err == nil {
		t.Fatal("expected missing JWT_SECRET to fail")
	}

	t.Setenv("JWT_SECRET", "known-dev-secret")
	if _, err := JWTSecret(); err == nil {
		t.Fatal("expected weak JWT_SECRET to fail")
	}
}

func TestJWTSecretAcceptsStrongSecret(t *testing.T) {
	const secret = "01234567890123456789012345678901"
	t.Setenv("JWT_SECRET", secret)
	got, err := JWTSecret()
	if err != nil {
		t.Fatalf("JWTSecret() error = %v", err)
	}
	if got != secret {
		t.Fatalf("JWTSecret() = %q, want configured secret", got)
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
