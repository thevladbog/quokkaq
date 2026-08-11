package config

import (
	"errors"
	"os"
	"strings"
)

const minimumJWTSecretLength = 32

var ErrJWTSecretNotConfigured = errors.New("JWT_SECRET must be configured with at least 32 characters")

// JWTSecret returns the authentication secret without a predictable fallback.
// This enforces the minimum-length configuration contract; operators must still
// provide a cryptographically random value when configuring the environment.
func JWTSecret() (string, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if len(secret) < minimumJWTSecretLength {
		return "", ErrJWTSecretNotConfigured
	}
	return secret, nil
}

// ValidateSecurityEnv verifies secrets required by a running API before it opens a port.
func ValidateSecurityEnv() error {
	_, err := JWTSecret()
	return err
}

// AllowsInsecureDevTLS permits certificate verification bypass only in an explicitly
// non-production environment. An unset APP_ENV is fail-closed.
func AllowsInsecureDevTLS() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV"))) {
	case "development", "dev", "local", "demo":
		return true
	default:
		return false
	}
}
