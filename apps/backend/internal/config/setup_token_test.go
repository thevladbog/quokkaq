package config

import (
	"testing"
)

func TestSetupTokenStrictEnv(t *testing.T) {
	t.Setenv("APP_ENV", "")
	if SetupTokenStrictEnv() {
		t.Fatal("expected false when APP_ENV empty")
	}
	t.Setenv("APP_ENV", "production")
	if !SetupTokenStrictEnv() {
		t.Fatal("expected true for production")
	}
	t.Setenv("APP_ENV", "Staging")
	if !SetupTokenStrictEnv() {
		t.Fatal("expected true for staging (case insensitive via strings)")
	}
}

func TestSetupTokenMatches(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SETUP_TOKEN", "secret")
	if !SetupTokenMatches("") {
		t.Fatal("dev should not require token match")
	}

	t.Setenv("APP_ENV", "production")
	t.Setenv("SETUP_TOKEN", "abc")
	if SetupTokenMatches("") {
		t.Fatal("prod with token set should reject empty header")
	}
	if !SetupTokenMatches("abc") {
		t.Fatal("exact token should match")
	}
	if SetupTokenMatches("abC") {
		t.Fatal("token compare should be case-sensitive for got")
	}
	if SetupTokenMatches("wrong") {
		t.Fatal("wrong token should not match")
	}
}

func TestSetupTokenStrictAndMissing(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SETUP_TOKEN", "")
	if !SetupTokenStrictAndMissing() {
		t.Fatal("prod without token should be strict missing")
	}
	t.Setenv("SETUP_TOKEN", "x")
	if SetupTokenStrictAndMissing() {
		t.Fatal("prod with token should not be missing")
	}
}
