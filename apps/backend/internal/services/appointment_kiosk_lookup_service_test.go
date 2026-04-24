package services

import (
	"errors"
	"os"
	"testing"
	"time"
)

func TestSignParseKioskCheckinPrToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "x_test_secret_at_least_8_chars_")

	uid := "unit-111"
	d := "2026-04-24"
	code := "123456"
	tok, err := SignKioskCheckinPrToken(uid, d, code)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	gotC, gotD, err := ParseKioskCheckinPrToken(tok, uid)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if gotC != code || gotD != d {
		t.Fatalf("got code=%q date=%q", gotC, gotD)
	}

	_, _, err = ParseKioskCheckinPrToken(tok, "other-unit")
	if err == nil {
		t.Fatal("expected unit mismatch")
	}
}

func TestParseKioskCheckinPrToken_jwt_not_set(t *testing.T) {
	_ = os.Unsetenv("JWT_SECRET")
	_, _, err := ParseKioskCheckinPrToken("aabb", "u")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParseKioskCheckinPrToken_bad_hex(t *testing.T) {
	t.Setenv("JWT_SECRET", "x_test_secret_at_least_8_chars_")
	_, _, err := ParseKioskCheckinPrToken("not-hex", "u1")
	if err == nil {
		t.Fatal("expected err")
	}
}

func TestVerifyPhoneLookup(t *testing.T) {
	s := &AppointmentKioskLookupService{
		otps:     make(map[string]*otpPending),
		verified: make(map[string]*verifiedKiosk),
		phoneLog: make(map[string][]time.Time),
	}
	sid := "sess-1"
	s.otps[sid] = &otpPending{
		UnitID:  "u1",
		Phone:   "+79990001122",
		Code:    "000001",
		Expires: time.Now().Add(2 * time.Minute),
	}

	_, err := s.VerifyPhoneLookup("missing", "000001")
	if !errors.Is(err, ErrKioskLookupInvalidOTP) {
		t.Fatalf("expected invalid OTP, got %v", err)
	}

	_, err = s.VerifyPhoneLookup(sid, "000002")
	if !errors.Is(err, ErrKioskLookupInvalidOTP) {
		t.Fatalf("expected wrong code: %v", err)
	}

	// "1" pads to 6 digits
	tok, err := s.VerifyPhoneLookup(sid, "1")
	if err != nil {
		t.Fatalf("valid code: %v", err)
	}
	if tok == "" {
		t.Fatal("empty lookup token")
	}
	if s.otps[sid] != nil {
		t.Fatal("expected session removed")
	}
	if s.verified[tok] == nil {
		t.Fatal("expected verified map entry")
	}

	_, err = s.VerifyPhoneLookup(sid, "1")
	if !errors.Is(err, ErrKioskLookupInvalidOTP) {
		t.Fatalf("re-use session: %v", err)
	}
}

func TestVerifyPhoneLookup_too_many_attempts(t *testing.T) {
	s := &AppointmentKioskLookupService{
		otps:     make(map[string]*otpPending),
		verified: make(map[string]*verifiedKiosk),
		phoneLog: make(map[string][]time.Time),
	}
	sid := "sess-2"
	s.otps[sid] = &otpPending{
		UnitID:   "u1",
		Phone:    "+79990001122",
		Code:     "000001",
		Expires:  time.Now().Add(2 * time.Minute),
		Attempts: 0,
	}
	for i := 0; i < kioskLookupMaxOTPAttempts; i++ {
		_, _ = s.VerifyPhoneLookup(sid, "badbad")
	}
	_, err := s.VerifyPhoneLookup(sid, "1")
	if !errors.Is(err, ErrKioskLookupInvalidOTP) {
		t.Fatalf("expected locked out, got %v", err)
	}
}

func TestListByLookupToken_no_repo(t *testing.T) {
	s := &AppointmentKioskLookupService{
		otps:     make(map[string]*otpPending),
		verified: make(map[string]*verifiedKiosk),
		phoneLog: make(map[string][]time.Time),
		Repo:     nil,
	}
	_, err := s.ListByLookupToken("t", "u")
	if !errors.Is(err, ErrKioskLookupNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}
