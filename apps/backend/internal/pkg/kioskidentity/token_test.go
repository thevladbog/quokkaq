package kioskidentity

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestSignVerifyBindsIdentity(t *testing.T) {
	t.Setenv("JWT_SECRET", "kiosk-identity-test-secret-0123456789")
	token, err := Sign("unit-1", "user-1", []string{"employees", "ops"})
	if err != nil {
		t.Fatal(err)
	}
	groups, err := Verify(token, "unit-1", "user-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0] != "employees" || groups[1] != "ops" {
		t.Fatalf("groups = %#v", groups)
	}
	if _, err := Verify(token, "unit-2", "user-1"); err == nil {
		t.Fatal("expected unit binding failure")
	}
	if _, err := Verify(token[:len(token)-1]+"x", "unit-1", "user-1"); err == nil {
		t.Fatal("expected tampered token failure")
	}
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UnitID: "unit-1",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "user-1", Issuer: "quokkaq-kiosk-identity",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
		},
	}).SignedString([]byte("kiosk-identity-test-secret-0123456789"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(expired, "unit-1", "user-1"); err == nil {
		t.Fatal("expected expired token failure")
	}
}
