package services

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"

	"github.com/google/uuid"
)

var (
	// ErrKioskLookupNotFound is returned for unknown or expired lookup sessions.
	ErrKioskLookupNotFound = errors.New("lookup session not found or expired")
	// ErrKioskLookupInvalidOTP is returned when the SMS code is wrong.
	ErrKioskLookupInvalidOTP = errors.New("invalid or expired code")
	// ErrKioskLookupNoSMS is returned when SMS channel is not configured.
	ErrKioskLookupNoSMS = errors.New("sms is not available for this location")
	// ErrKioskLookupPreRegInvalid is returned when a chosen row cannot be redeemed.
	ErrKioskLookupPreRegInvalid = errors.New("this appointment cannot be checked in")
)

const (
	kioskLookupOTPTTL          = 10 * time.Minute
	kioskLookupVerifiedTTL     = 15 * time.Minute
	kioskLookupMaxOTPAttempts  = 6
	kioskLookupPhoneBurstPerHr = 8
)

type otpPending struct {
	UnitID   string
	Phone    string
	Code     string
	Expires  time.Time
	Attempts int
}

type verifiedKiosk struct {
	UnitID string
	Phone  string
	Exp    time.Time
}

// AppointmentKioskLookupService supports kiosk check-in by phone: OTP, list today's bookings, redeem with token.
// State is in-memory (single process); horizontal scale should use shared storage or sticky sessions.
type AppointmentKioskLookupService struct {
	mu       sync.Mutex
	otps     map[string]*otpPending
	verified map[string]*verifiedKiosk
	phoneLog map[string][]time.Time // key unitID+"|"+phone, timestamps for rate window

	Repo  *repository.PreRegistrationRepository
	Notif *NotificationService
	PSvc  *PreRegistrationService
	TSvc  TicketService
}

// NewAppointmentKioskLookupService constructs a lookup service (in-memory state).
// For multiple API replicas, persist OTP/lookup state in Redis or a DB, or use sticky sessions to one pod.
func NewAppointmentKioskLookupService(
	repo *repository.PreRegistrationRepository,
	ps *PreRegistrationService,
	ts TicketService,
	notif *NotificationService,
) *AppointmentKioskLookupService {
	return &AppointmentKioskLookupService{
		Repo:     repo,
		Notif:    notif,
		PSvc:     ps,
		TSvc:     ts,
		otps:     make(map[string]*otpPending),
		verified: make(map[string]*verifiedKiosk),
		phoneLog: make(map[string][]time.Time),
	}
}

// StartPhoneLookup sends a 6-digit code to the phone. Returns a sessionId for VerifyPhoneLookup.
func (s *AppointmentKioskLookupService) StartPhoneLookup(unitID, rawPhone string) (sessionID string, err error) {
	if s.Repo == nil || s.PSvc == nil || s.Notif == nil {
		return "", fmt.Errorf("appointment kiosk lookup: not configured")
	}
	phone, err := phoneutil.ParseAndNormalize(rawPhone, phoneutil.DefaultRegion())
	if err != nil {
		return "", err
	}
	if !s.Notif.isSMSChannelAvailableForUnit(unitID) {
		return "", ErrKioskLookupNoSMS
	}
	s.mu.Lock()
	s.pruneUnlocked()
	key := unitID + "|" + phone
	now := time.Now()
	ents := s.phoneLog[key]
	var keep []time.Time
	for _, t := range ents {
		if now.Sub(t) < time.Hour {
			keep = append(keep, t)
		}
	}
	if len(keep) >= kioskLookupPhoneBurstPerHr {
		s.mu.Unlock()
		return "", fmt.Errorf("too many requests for this number; try again later")
	}
	keep = append(keep, now)
	s.phoneLog[key] = keep

	n, rerr := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if rerr != nil {
		s.mu.Unlock()
		return "", rerr
	}
	code := fmt.Sprintf("%06d", n.Int64())
	sid := uuid.NewString()
	s.otps[sid] = &otpPending{
		UnitID:  unitID,
		Phone:   phone,
		Code:    code,
		Expires: now.Add(kioskLookupOTPTTL),
	}
	s.mu.Unlock()

	ru := "Код подтверждения: " + code + ". Не передавайте его никому."
	if err := s.Notif.EnqueueUnitTransactionalSMS(unitID, phone, ru, "kiosk_appointment_lookup_otp"); err != nil {
		s.mu.Lock()
		delete(s.otps, sid)
		s.mu.Unlock()
		return "", err
	}
	return sid, nil
}

func (s *AppointmentKioskLookupService) pruneUnlocked() {
	now := time.Now()
	for k, p := range s.otps {
		if now.After(p.Expires) {
			delete(s.otps, k)
		}
	}
	for k, v := range s.verified {
		if now.After(v.Exp) {
			delete(s.verified, k)
		}
	}
}

// VerifyPhoneLookup checks the SMS code. On success, returns a lookupToken to use with List and Redeem.
func (s *AppointmentKioskLookupService) VerifyPhoneLookup(sessionID, code string) (lookupToken string, err error) {
	if sessionID == "" || code == "" {
		return "", ErrKioskLookupInvalidOTP
	}
	s.mu.Lock()
	s.pruneUnlocked()
	p, ok := s.otps[sessionID]
	if !ok || time.Now().After(p.Expires) {
		s.mu.Unlock()
		return "", ErrKioskLookupInvalidOTP
	}
	if p.Attempts >= kioskLookupMaxOTPAttempts {
		delete(s.otps, sessionID)
		s.mu.Unlock()
		return "", ErrKioskLookupInvalidOTP
	}
	p.Attempts++
	trimC := strings.TrimSpace(code)
	for len(trimC) > 0 && len(trimC) < 6 {
		trimC = "0" + trimC
	}
	if len(trimC) != 6 {
		s.mu.Unlock()
		return "", ErrKioskLookupInvalidOTP
	}
	want := []byte(strings.TrimSpace(p.Code))
	got := []byte(trimC)
	if subtle.ConstantTimeCompare(want, got) != 1 {
		s.mu.Unlock()
		return "", ErrKioskLookupInvalidOTP
	}
	unitID := p.UnitID
	phone := p.Phone
	delete(s.otps, sessionID)
	tok := uuid.NewString() + hex.EncodeToString(make([]byte, 16))[:20]
	s.verified[tok] = &verifiedKiosk{UnitID: unitID, Phone: phone, Exp: time.Now().Add(kioskLookupVerifiedTTL)}
	s.mu.Unlock()
	return tok, nil
}

// ListByLookupToken returns today's active pre-registrations for the verified phone.
func (s *AppointmentKioskLookupService) ListByLookupToken(lookupToken, unitID string) ([]models.PreRegistration, error) {
	if s.Repo == nil {
		return nil, ErrKioskLookupNotFound
	}
	now := time.Now()
	today := now.Format("2006-01-02")
	s.mu.Lock()
	s.pruneUnlocked()
	v, ok := s.verified[lookupToken]
	if !ok || v.UnitID != unitID || time.Now().After(v.Exp) {
		s.mu.Unlock()
		return nil, ErrKioskLookupNotFound
	}
	phone := v.Phone
	s.mu.Unlock()

	rows, err := s.Repo.ListActiveByUnitPhoneAndDate(unitID, phone, today)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// RedeemByLookupToken redeems a pre-registration after a verified phone flow (same as code redeem).
func (s *AppointmentKioskLookupService) RedeemByLookupToken(lookupToken, unitID, preRegID string) (*models.Ticket, error) {
	if s.PSvc == nil || s.TSvc == nil || s.Repo == nil {
		return nil, fmt.Errorf("appointment kiosk lookup: not configured")
	}
	s.mu.Lock()
	s.pruneUnlocked()
	v, ok := s.verified[lookupToken]
	if !ok || v.UnitID != unitID || time.Now().After(v.Exp) {
		s.mu.Unlock()
		return nil, ErrKioskLookupNotFound
	}
	phone := v.Phone
	s.mu.Unlock()

	pr, err := s.Repo.GetByID(preRegID)
	if err != nil {
		return nil, ErrKioskLookupPreRegInvalid
	}
	if pr.UnitID != unitID || pr.Status != "created" || pr.CustomerPhone != phone {
		return nil, ErrKioskLookupPreRegInvalid
	}
	_, vErr := s.PSvc.ValidateForKiosk(pr.Code)
	if vErr != nil {
		if errors.Is(vErr, ErrPreRegistrationTooEarly) || errors.Is(vErr, ErrPreRegistrationTooLate) {
			return nil, vErr
		}
		return nil, ErrKioskLookupPreRegInvalid
	}
	ticket, cErr := s.TSvc.CreateTicketWithPreRegistration(pr.UnitID, pr.ServiceID, pr.ID, nil)
	if cErr != nil {
		return nil, cErr
	}
	if err := s.PSvc.MarkAsRedeemed(pr.ID, ticket.ID); err != nil {
		return nil, err
	}
	return ticket, nil
}

// KioskPrTokenPayload is the JSON for signed deep-link check-in (server-side only secret).
type KioskPrTokenPayload struct {
	UnitID string `json:"unitId"`
	Date   string `json:"date"`
	Code   string `json:"code"`
}

// SignKioskCheckinPrToken returns a URL-safe token for the given unit, local date, and 6-digit code. Uses JWT_SECRET.
func SignKioskCheckinPrToken(unitID, yyyymmdd, code string) (string, error) {
	sec := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if len(sec) < 8 {
		return "", fmt.Errorf("JWT_SECRET is not set")
	}
	key := []byte(sec)
	p := KioskPrTokenPayload{UnitID: unitID, Date: yyyymmdd, Code: strings.TrimSpace(code)}
	js, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(js)
	sig := mac.Sum(nil)
	blob := struct {
		P []byte `json:"p"`
		S []byte `json:"s"`
	}{P: js, S: sig}
	out, err := json.Marshal(blob)
	if err != nil {
		return "", err
	}
	// base64 would need encoding; use hex of json for simplicity
	return hex.EncodeToString(out), nil
}

// ParseKioskCheckinPrToken verifies HMAC and returns the embedded code and date.
func ParseKioskCheckinPrToken(token, expectUnitID string) (code, date string, err error) {
	sec := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if len(sec) < 8 {
		return "", "", fmt.Errorf("token verification unavailable")
	}
	raw, derr := hex.DecodeString(token)
	if derr != nil {
		return "", "", derr
	}
	var blob struct {
		P []byte `json:"p"`
		S []byte `json:"s"`
	}
	if jerr := json.Unmarshal(raw, &blob); jerr != nil {
		return "", "", jerr
	}
	mac := hmac.New(sha256.New, []byte(sec))
	_, _ = mac.Write(blob.P)
	if subtle.ConstantTimeCompare(mac.Sum(nil), blob.S) != 1 {
		return "", "", fmt.Errorf("invalid token")
	}
	var p KioskPrTokenPayload
	if jerr := json.Unmarshal(blob.P, &p); jerr != nil {
		return "", "", jerr
	}
	if p.UnitID != expectUnitID {
		return "", "", fmt.Errorf("unit mismatch")
	}
	return p.Code, p.Date, nil
}

const maxBulkRemindSMS = 200

// SendTodayAppointmentReminders sends a transactional SMS to each phone with a non-redeemed booking for `date` (YYYY-MM-DD).
// Returns the number of SMS jobs successfully enqueued.
func (s *AppointmentKioskLookupService) SendTodayAppointmentReminders(unitID, yyyymmdd string) (int, error) {
	if s.Repo == nil || s.Notif == nil {
		return 0, fmt.Errorf("appointment reminders: not configured")
	}
	if !s.Notif.isSMSChannelAvailableForUnit(unitID) {
		return 0, ErrKioskLookupNoSMS
	}
	rows, err := s.Repo.ListCreatedByUnitAndDate(unitID, yyyymmdd)
	if err != nil {
		return 0, err
	}
	sent := 0
	for i := range rows {
		if sent >= maxBulkRemindSMS {
			break
		}
		phone := strings.TrimSpace(rows[i].CustomerPhone)
		if phone == "" {
			continue
		}
		ti := rows[i].Time
		if ti == "" {
			ti = "—"
		}
		code := rows[i].Code
		msg := fmt.Sprintf("Напоминание: запись на %s %s. Код для стойки: %s. Не отвечайте на SMS.", yyyymmdd, ti, code)
		if err := s.Notif.EnqueueUnitTransactionalSMS(unitID, phone, msg, "appointment_bulk_remind"); err != nil {
			continue
		}
		sent++
	}
	return sent, nil
}
