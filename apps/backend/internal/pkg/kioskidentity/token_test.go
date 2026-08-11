package kioskidentity

import (
	"testing"
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
}
