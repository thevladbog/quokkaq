package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	desktopTerminalCodeLen = 10
	desktopTerminalJWTDays = 60
)

var (
	ErrInvalidTerminalCode           = errors.New("invalid terminal code")
	ErrInvalidLocale                 = errors.New("locale must be en or ru")
	ErrInvalidTerminalKind           = errors.New("invalid terminal kind")
	ErrCounterIDRequired             = errors.New("counter terminal requires counterId")
	ErrInvalidKindForCounter         = errors.New("invalid kind for counter terminal")
	ErrTerminalKindRequiresRebinding = errors.New("terminal kind cannot be changed without updating counter binding")
	ErrTerminalCounterContext        = errors.New("contextUnitId is required when counterId is set")
	ErrTerminalCounterMismatch       = errors.New("counter does not match selected organizational unit")
	ErrUnitNotFound                  = errors.New("unit not found")
	ErrCounterNotFound               = errors.New("counter not found")
	ErrContextUnitNotFound           = errors.New("context unit not found")
	ErrCounterBoardFeatureLocked     = errors.New("counter board is not enabled for your subscription")
)

type DesktopTerminalService interface {
	Create(name *string, unitID, defaultLocale string, kioskFullscreen bool, contextUnitID, counterID *string, kind string) (*models.DesktopTerminal, string, error)
	ListForCompany(companyID string) ([]models.DesktopTerminal, error)
	GetByID(id string) (*models.DesktopTerminal, error)
	Update(id string, name *string, unitID, defaultLocale string, kioskFullscreen bool, contextUnitID, counterID *string, kind *string) error
	Revoke(id string) error
	Bootstrap(pairingCode string) (token, unitID, defaultLocale, appBaseURL string, kioskFullscreen bool, counterID *string, terminalKind string, err error)
}

type desktopTerminalService struct {
	repo        repository.DesktopTerminalRepository
	unitRepo    repository.UnitRepository
	counterRepo repository.CounterRepository
}

func NewDesktopTerminalService(
	repo repository.DesktopTerminalRepository,
	unitRepo repository.UnitRepository,
	counterRepo repository.CounterRepository,
) DesktopTerminalService {
	return &desktopTerminalService{repo: repo, unitRepo: unitRepo, counterRepo: counterRepo}
}

func (s *desktopTerminalService) codePepper() string {
	if p := os.Getenv("TERMINAL_CODE_PEPPER"); p != "" {
		return p
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "default_secret_please_change"
	}
	return secret
}

func pairingCodeDigest(pepper, code string) string {
	n := strings.TrimSpace(code)
	h := sha256.Sum256([]byte(pepper + "\x00" + n))
	return hex.EncodeToString(h[:])
}

func generatePairingCode(length int) (string, error) {
	const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"
	if length < 8 {
		length = 8
	}
	out := make([]byte, length)
	for i := range out {
		var b [1]byte
		if _, err := rand.Read(b[:]); err != nil {
			return "", err
		}
		out[i] = alphabet[int(b[0])%len(alphabet)]
	}
	return string(out), nil
}

func validateLocale(loc string) error {
	switch strings.ToLower(strings.TrimSpace(loc)) {
	case "en", "ru":
		return nil
	default:
		return ErrInvalidLocale
	}
}

func normalizeTerminalKindInput(kind string) string {
	k := strings.TrimSpace(strings.ToLower(kind))
	switch k {
	case "", models.DesktopTerminalKindKiosk:
		return models.DesktopTerminalKindKiosk
	case models.DesktopTerminalKindCounterGuestSurvey, models.DesktopTerminalKindCounterBoard:
		return k
	default:
		return ""
	}
}

func (s *desktopTerminalService) resolveCounterBinding(unitID string, contextUnitID, counterID *string, kind string) (effectiveUnitID string, counterPtr *string, outKind string, err error) {
	cid := ""
	if counterID != nil {
		cid = strings.TrimSpace(*counterID)
	}
	k := normalizeTerminalKindInput(kind)
	if k == "" {
		return "", nil, "", ErrInvalidTerminalKind
	}
	// Legacy API: counter binding without explicit kind → guest survey screen.
	if cid != "" && k == models.DesktopTerminalKindKiosk {
		k = models.DesktopTerminalKindCounterGuestSurvey
	}

	if cid == "" {
		if k != models.DesktopTerminalKindKiosk {
			return "", nil, "", ErrCounterIDRequired
		}
		if _, e := s.unitRepo.FindByIDLight(unitID); e != nil {
			if repository.IsNotFound(e) {
				return "", nil, "", fmt.Errorf("%w", ErrUnitNotFound)
			}
			return "", nil, "", e
		}
		return unitID, nil, models.DesktopTerminalKindKiosk, nil
	}

	if k != models.DesktopTerminalKindCounterGuestSurvey && k != models.DesktopTerminalKindCounterBoard {
		return "", nil, "", ErrInvalidKindForCounter
	}

	if contextUnitID == nil || strings.TrimSpace(*contextUnitID) == "" {
		return "", nil, "", ErrTerminalCounterContext
	}
	ctxID := strings.TrimSpace(*contextUnitID)

	counter, e := s.counterRepo.FindByID(cid)
	if e != nil {
		if repository.IsNotFound(e) {
			return "", nil, "", fmt.Errorf("%w", ErrCounterNotFound)
		}
		return "", nil, "", e
	}
	ctxUnit, e := s.unitRepo.FindByIDLight(ctxID)
	if e != nil {
		if repository.IsNotFound(e) {
			return "", nil, "", fmt.Errorf("%w", ErrContextUnitNotFound)
		}
		return "", nil, "", e
	}
	if !CounterMatchesOrgUnit(counter, ctxUnit) {
		return "", nil, "", ErrTerminalCounterMismatch
	}

	u, e := s.unitRepo.FindByIDLight(counter.UnitID)
	if e != nil {
		return "", nil, "", e
	}
	if k == models.DesktopTerminalKindCounterBoard {
		ok, e := CompanyHasCounterBoardFeature(u.CompanyID)
		if e != nil {
			return "", nil, "", e
		}
		if !ok {
			return "", nil, "", ErrCounterBoardFeatureLocked
		}
	} else {
		ok, e := CompanyHasPlanFeature(u.CompanyID, PlanFeatureCounterGuestSurvey)
		if e != nil {
			return "", nil, "", e
		}
		if !ok {
			return "", nil, "", ErrSurveyFeatureLocked
		}
	}

	c := cid
	return counter.UnitID, &c, k, nil
}

func (s *desktopTerminalService) Create(name *string, unitID, defaultLocale string, kioskFullscreen bool, contextUnitID, counterID *string, kind string) (*models.DesktopTerminal, string, error) {
	if err := validateLocale(defaultLocale); err != nil {
		return nil, "", err
	}

	effectiveUnit, cPtr, outKind, err := s.resolveCounterBinding(unitID, contextUnitID, counterID, kind)
	if err != nil {
		return nil, "", err
	}

	var plain string
	var row *models.DesktopTerminal
	for attempt := 0; attempt < 8; attempt++ {
		code, err := generatePairingCode(desktopTerminalCodeLen)
		if err != nil {
			return nil, "", err
		}
		digest := pairingCodeDigest(s.codePepper(), code)
		hash, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(code)), bcrypt.DefaultCost)
		if err != nil {
			return nil, "", err
		}
		loc := strings.ToLower(strings.TrimSpace(defaultLocale))
		row = &models.DesktopTerminal{
			UnitID:            effectiveUnit,
			CounterID:         cPtr,
			Kind:              outKind,
			Name:              name,
			DefaultLocale:     loc,
			KioskFullscreen:   kioskFullscreen,
			PairingCodeDigest: digest,
			SecretHash:        string(hash),
		}
		if err := s.repo.Create(row); err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				continue
			}
			return nil, "", err
		}
		plain = code
		break
	}
	if plain == "" {
		return nil, "", errors.New("could not allocate unique pairing code")
	}
	return row, plain, nil
}

func (s *desktopTerminalService) ListForCompany(companyID string) ([]models.DesktopTerminal, error) {
	if companyID == "" {
		return nil, errors.New("companyId is required")
	}
	return s.repo.FindAllByCompanyID(companyID)
}

func (s *desktopTerminalService) GetByID(id string) (*models.DesktopTerminal, error) {
	return s.repo.FindByID(id)
}

func (s *desktopTerminalService) Update(id string, name *string, unitID, defaultLocale string, kioskFullscreen bool, contextUnitID, counterID *string, kind *string) error {
	if err := validateLocale(defaultLocale); err != nil {
		return err
	}
	t, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	// Omitting counterId/contextUnitId in JSON leaves both nil: keep existing guest counter binding, only refresh metadata.
	if contextUnitID == nil && counterID == nil && t.CounterID != nil && *t.CounterID != "" {
		eff := models.EffectiveTerminalKind(t)
		if kind != nil && strings.TrimSpace(*kind) != "" {
			if strings.ToLower(strings.TrimSpace(*kind)) != eff {
				return ErrTerminalKindRequiresRebinding
			}
		}
		t.Name = name
		t.DefaultLocale = strings.ToLower(strings.TrimSpace(defaultLocale))
		t.KioskFullscreen = kioskFullscreen
		return s.repo.Update(t)
	}

	kindStr := models.EffectiveTerminalKind(t)
	if kind != nil && strings.TrimSpace(*kind) != "" {
		kindStr = strings.TrimSpace(*kind)
	}
	effectiveUnit, cPtr, outKind, err := s.resolveCounterBinding(unitID, contextUnitID, counterID, kindStr)
	if err != nil {
		return err
	}

	t.Name = name
	t.UnitID = effectiveUnit
	t.CounterID = cPtr
	t.Kind = outKind
	t.DefaultLocale = strings.ToLower(strings.TrimSpace(defaultLocale))
	t.KioskFullscreen = kioskFullscreen
	return s.repo.Update(t)
}

func (s *desktopTerminalService) Revoke(id string) error {
	t, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	now := time.Now()
	t.RevokedAt = &now
	return s.repo.Update(t)
}

func (s *desktopTerminalService) Bootstrap(pairingCode string) (token, unitID, defaultLocale, appBaseURL string, kioskFullscreen bool, counterID *string, terminalKind string, err error) {
	digest := pairingCodeDigest(s.codePepper(), pairingCode)
	t, e := s.repo.FindByPairingCodeDigest(digest)
	if e != nil || t.RevokedAt != nil {
		return "", "", "", "", false, nil, "", ErrInvalidTerminalCode
	}
	if bcrypt.CompareHashAndPassword([]byte(t.SecretHash), []byte(strings.TrimSpace(pairingCode))) != nil {
		return "", "", "", "", false, nil, "", ErrInvalidTerminalCode
	}

	tk := models.EffectiveTerminalKind(t)

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default_secret_please_change"
	}
	exp := time.Now().Add(time.Hour * 24 * desktopTerminalJWTDays)
	claims := jwt.MapClaims{
		"sub":           t.ID,
		"typ":           "terminal",
		"unit_id":       t.UnitID,
		"locale":        t.DefaultLocale,
		"exp":           exp.Unix(),
		"terminal_kind": tk,
	}
	if t.CounterID != nil && *t.CounterID != "" {
		claims["counter_id"] = *t.CounterID
	}
	tokClaims := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, e := tokClaims.SignedString([]byte(secret))
	if e != nil {
		return "", "", "", "", false, nil, "", e
	}

	now := time.Now()
	t.LastSeenAt = &now
	_ = s.repo.Update(t)

	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = "http://localhost:3000"
	}
	var outCounter *string
	if t.CounterID != nil && *t.CounterID != "" {
		outCounter = t.CounterID
	}
	return signed, t.UnitID, t.DefaultLocale, strings.TrimRight(base, "/"), t.KioskFullscreen, outCounter, tk, nil
}
